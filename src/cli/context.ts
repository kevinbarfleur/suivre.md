import { resolve } from 'node:path'
import { z } from 'zod'
import type { CAC } from 'cac'
import { BoardService } from '../service/board-service'
import { findRoot } from '../storage'
import type { InvalidMarkdownFile } from '../storage'
import { formatZodError } from '../domain'
import type { Decision, Doc, Sprint, Task } from '../domain'

/** Shared command plumbing: argv, service, outputs, error handling. */

/**
 * Repo root of every command but `init`: the nearest ancestor holding a
 * backlog. Run from a subdirectory, a surface must act on the repo's board
 * instead of reporting it missing.
 */
export function commandRoot(): string {
  const start = resolve(process.env.SUIVRE_ROOT ?? process.cwd())
  return findRoot(start) ?? start
}

/**
 * Root for `init`, the one command anchored to the cwd — it is what creates a
 * root. It refuses to nest a second board under an existing one: two backlogs
 * on one path split the board, and every other command would follow the outer.
 */
export function initRoot(force: boolean): string {
  const root = resolve(process.env.SUIVRE_ROOT ?? process.cwd())
  const existing = findRoot(root)
  if (existing && existing !== root && !force) {
    throw new Error(
      `Backlog already initialized at ${existing} — run suivre from there, or pass --force to nest a second board.`,
    )
  }
  return root
}

export const service = (root = commandRoot()): BoardService => new BoardService(root)

/** The service, refusing early when there is no board: docs, ADRs and sprints all live under one. */
export async function requireBoard(): Promise<BoardService> {
  const svc = service()
  if (!(await svc.loadConfig())) {
    throw new Error('Backlog not initialized — run `suivre init` first.')
  }
  return svc
}

/** One readable line for any error. A ZodError's own message is a JSON dump. */
export function messageOf(error: unknown): string {
  if (error instanceof z.ZodError) return formatZodError(error)
  return error instanceof Error ? error.message : String(error)
}

/** Prints `error: <message>` on stderr and exits 1. A surface never shows a stack. */
export function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

/** Wraps an action: error → message on stderr + exit 1 (never a raw stack). */
export function run<A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...restoreOperands(args))
    } catch (error) {
      fail(messageOf(error))
    }
  }
}

// --- argv ---

/**
 * cac parses through mri, which mangles operands: it coerces them (`--assignee
 * ""` arrives as `0`, `--assignee 42` as a number) and reads any value starting
 * with `-` as short flags — `--body "- [ ] repro"` sets `-h`, so the CLI prints
 * help and exits 0 without writing the ticket. Ticket text has to survive
 * verbatim, so `prepareArgv` swaps every operand for an opaque token and `run`
 * puts the text back. NUL cannot occur in a real argv, hence the sentinel.
 */
const STASH = '\u0000operand:'
const operands: string[] = []

function stash(value: string): string {
  return `${STASH}${operands.push(value) - 1}`
}

function restore(value: unknown): unknown {
  if (typeof value === 'string') {
    if (!value.startsWith(STASH)) return value
    return operands[Number(value.slice(STASH.length))] ?? value
  }
  // Safety net for anything mri still coerced: a command only ever reads text.
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(restore)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, restore(v)]))
  }
  return value
}

/** Puts stashed operands back into parsed args and options. */
export function restoreOperands<T>(value: T): T {
  return restore(value) as T
}

/** First words of the two-token command names ("sprint create" → "sprint"). */
export function commandGroups(cli: CAC): Set<string> {
  return new Set(
    cli.commands
      .map((command) => command.name)
      .filter((name) => name.includes(' '))
      .map((name) => name.split(' ')[0]!),
  )
}

/** cac's option names are camelCase; argv's are kebab-case. */
const camelize = (name: string): string =>
  name.replace(
    /([a-z])-([a-z])/g,
    (_, before: string, after: string) => before + after.toUpperCase(),
  )

/** A token that a parser would read as a flag rather than as text. */
const FLAG_SHAPE = /^--?[A-Za-z][\w-]*(=|$)/

/** The camelCase option name a token carries, or `null` when it is not a flag. */
function flagName(token: string): string | null {
  if (!token.startsWith('-') || token === '-' || token === '--') return null
  const body = token.replace(/^-{1,2}/, '')
  const at = body.indexOf('=')
  return camelize(at === -1 ? body : body.slice(0, at))
}

function stashOperands(
  tokens: readonly string[],
  known: ReadonlySet<string>,
  takesValue: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === '--') {
      for (const operand of tokens.slice(i + 1)) out.push(stash(operand))
      break
    }
    const flag = flagName(token)
    // An unknown token shaped like a flag stays one, so a typo is reported
    // rather than silently swallowed as ticket text.
    if (flag === null || !(known.has(flag) || FLAG_SHAPE.test(token))) {
      out.push(stash(token))
      continue
    }
    const at = token.indexOf('=')
    if (at !== -1) {
      out.push(`${token.slice(0, at)}=${stash(token.slice(at + 1))}`)
      continue
    }
    out.push(token)
    if (takesValue.has(flag) && i + 1 < tokens.length) out.push(stash(tokens[++i]!))
  }
  return out
}

/**
 * Rewrites argv for cac: two-word command names are merged into the single
 * token cac matches on (it only ever looks at the first one), and every operand
 * is stashed so ticket content is never parsed as flags.
 */
export function prepareArgv(cli: CAC, argv: readonly string[]): string[] {
  const head = argv.slice(0, 2)
  let rest = argv.slice(2)
  const groups = commandGroups(cli)
  if (rest[0] && groups.has(rest[0]) && rest[1] && !rest[1].startsWith('-')) {
    rest = [`${rest[0]} ${rest[1]}`, ...rest.slice(2)]
  }
  const name = rest[0]
  const isCommandToken = name !== undefined && !name.startsWith('-')
  const command = isCommandToken ? cli.commands.find((c) => c.isMatched(name)) : undefined
  const options = [...cli.globalCommand.options, ...(command?.options ?? [])]
  const known = new Set(options.flatMap((option) => option.names))
  const takesValue = new Set(
    options.filter((option) => !option.isBoolean).flatMap((option) => option.names),
  )
  const body = isCommandToken ? rest.slice(1) : rest
  return [...head, ...(isCommandToken ? [name] : []), ...stashOperands(body, known, takesValue)]
}

const HELP_FLAGS = new Set(['-h', '--help'])

/** cac only knows flat command names, so a group ("sprint") has no help of its own. */
function outputGroupHelp(cli: CAC, group: string): void {
  const subcommands = cli.commands.filter((command) => command.name.startsWith(`${group} `))
  const width = Math.max(...subcommands.map((command) => command.rawName.length))
  console.log(`\nUsage:\n  $ ${cli.name} ${group} <command> [options]\n\nCommands:`)
  for (const command of subcommands) {
    console.log(`  ${command.rawName.padEnd(width)}  ${command.description}`)
  }
  console.log(`\nFor a command's options, run:\n  $ ${cli.name} ${group} <command> --help\n`)
}

/**
 * Parses argv and runs the matched command. Everything cac can throw — an
 * unknown option, a missing argument — is reported as one line on stderr:
 * outside a try/catch it surfaces as a raw Node stack, and a token starting
 * with `-` is common in ticket text.
 */
export async function runCli(cli: CAC, argv: readonly string[]): Promise<void> {
  const group = argv[2]
  if (group && commandGroups(cli).has(group) && (!argv[3] || HELP_FLAGS.has(argv[3]))) {
    outputGroupHelp(cli, group)
    return
  }

  // cac fires the action without awaiting it; the promise is what tells a
  // caller the write landed.
  let pending: unknown
  for (const command of cli.commands) {
    const action = command.commandAction
    if (action) command.commandAction = (...args: unknown[]) => (pending = action(...args))
  }

  try {
    cli.parse(prepareArgv(cli, argv))
  } catch (error) {
    fail(messageOf(error))
  }
  await pending

  // cac is silent on an unknown command — we prefer to fail loudly.
  if (!cli.matchedCommand && !cli.options['help'] && !cli.options['version']) {
    if (cli.args.length === 0) cli.outputHelp()
    else fail(`unknown command "${restoreOperands([...cli.args]).join(' ')}"`)
  }
}

// --- option values ---

/**
 * Normalizes a repeatable cac option (absent | scalar | array). An empty value
 * is an explicit CLEAR: `suivre edit <id> --depends ""` empties the list.
 */
export function toArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  return (Array.isArray(value) ? value : [value]).map(String).filter((item) => item !== '')
}

/** An enum option. A raw ZodError here is a JSON blob that never names the flag. */
export function parseEnum<T extends string>(flag: string, allowed: readonly T[], value: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(`${flag} ${value} — expected one of: ${allowed.join(', ')}`)
}

/**
 * Strips `undefined` keys from a patch. Required before `editTask`: its
 * spread-based merge would overwrite an existing field with `undefined`.
 */
export function compact<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

// --- output ---

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

/** Files a collection had to skip. On stderr, so `--json` stays pipeable. */
export function warnInvalid(invalid: readonly InvalidMarkdownFile[]): void {
  if (invalid.length === 0) return
  const one = invalid.length === 1
  console.error(
    `warning: ${one ? '1 file' : `${invalid.length} files`} could not be parsed and ${one ? 'is' : 'are'} not listed:`,
  )
  for (const file of invalid) console.error(`  ${file.fileName}: ${file.message}`)
}

/** A task flattened for JSON output (frontmatter + body, without the internal rank). */
export function taskJson(task: Task): Record<string, unknown> {
  const { order: _order, ...fm } = task.frontmatter
  return { ...fm, body: task.body }
}

export function sprintJson(sprint: Sprint): Record<string, unknown> {
  return { ...sprint.frontmatter, body: sprint.body }
}

export function docJson(doc: Doc): Record<string, unknown> {
  return { ...doc.frontmatter, body: doc.body }
}

export function decisionJson(decision: Decision): Record<string, unknown> {
  return { ...decision.frontmatter, body: decision.body }
}

export function taskLine(task: Task): string {
  const fm = task.frontmatter
  const extras = [
    fm.priority && `!${fm.priority}`,
    fm.assignee && `@${fm.assignee}`,
    fm.labels.length > 0 && fm.labels.map((l) => `#${l}`).join(' '),
    fm.depends.length > 0 && `deps:${fm.depends.join(',')}`,
  ]
    .filter(Boolean)
    .join('  ')
  return `${fm.id}  [${fm.status}]  ${fm.title}${extras ? `  ${extras}` : ''}`
}

export function printTask(task: Task): void {
  console.log(taskLine(task))
  if (task.body.trim()) console.log(`\n${task.body.trim()}\n`)
}
