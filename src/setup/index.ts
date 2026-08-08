import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { atomicWrite, readFileSafe, removeFile } from '../storage'
import { BoardService } from '../service/board-service'
import type { BoardConfig } from '../domain'
import { hasBlock, planAdapterWrite, renderAdapter, upsertBlock } from './reconcile'
import {
  ADAPTER_BODY,
  ADAPTER_RELATIVE_PATH,
  ADAPTER_VERSION,
  AGENTS_POINTER_BLOCK,
  AGENTS_POINTER_END,
  AGENTS_POINTER_START,
  TRIAGE_LABELS_BODY,
  TRIAGE_LABELS_RELATIVE_PATH,
} from './templates'

/**
 * `suivre setup` — a CONVERGENCE command, not an installer: idempotent, it
 * brings the repo to the expected state whatever its starting state. First
 * run = installation; re-runs = update (new adapter after a suivre update)
 * or repair (deleted file, unplugged MCP).
 *
 * It wires the repo to Matt Pocock's skills (aihero.dev/skills) — through HIS
 * official channel, never by copying anything — then writes the adapter that
 * makes suivre their issue tracker. A file the user has taken ownership of is
 * never overwritten (see `reconcile.ts`).
 *
 * It writes into SOMEONE ELSE'S repo, so two rules hold everywhere below: a
 * step that cannot converge leaves the file alone and reports `!` (which is
 * also the exit code), and the report is printed whatever happens — the user
 * must never be left with an error and no record of what was already changed.
 */

export interface SetupOptions {
  yes?: boolean
  force?: boolean
  skipSkills?: boolean
  skipMcp?: boolean
}

export const SKILLS_PLUGIN = 'mattpocock-skills'
export const SKILLS_CREDIT = 'Matt Pocock — https://www.aihero.dev/skills'

interface ReportLine {
  mark: '✓' | '•' | '!'
  label: string
  detail: string
}

type Say = (mark: ReportLine['mark'], label: string, detail: string) => void

export async function runSetup(root: string, opts: SetupOptions = {}): Promise<void> {
  const report: ReportLine[] = []
  const say: Say = (mark, label, detail) => report.push({ mark, label, detail })

  console.log(`suivre setup — ${root}\n`)

  try {
    // One broken step must never cost the user the others.
    const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn()
      } catch (error) {
        say('!', label, `failed: ${describe(error)}`)
      }
    }

    // 1. Board — init if absent, adopt otherwise.
    await step('board', () => setupBoard(root, say))

    // 2. Matt Pocock's skills — through his official channel only.
    await step('skills', async () => {
      if (opts.skipSkills) say('•', 'skills', 'skipped (--skip-skills)')
      else await setupSkills(opts, say)
    })

    // 3. The adapter: the contract his skills read to talk to suivre.
    await step('adapter', () => setupAdapter(root, opts, say))

    // 4. The triage vocabulary the adapter points at.
    await step('labels', () => setupTriageLabels(root, say))

    // 5. Pointer in CLAUDE.md / AGENTS.md, for agents that don't read docs/agents/.
    await step('agents', () => setupPointer(root, say))

    // 6. Project MCP (.mcp.json) — the board as native tools for the agent.
    await step('mcp', async () => {
      if (opts.skipMcp) say('•', 'mcp', 'skipped (--skip-mcp)')
      else await setupMcp(root, say)
    })

    noteGitRepo(root, say)
    noteOverlay(say)
  } finally {
    printReport(report)
  }

  // A CI must be able to tell a converged repo from one where a file was refused.
  if (report.some((line) => line.mark === '!')) process.exitCode = 1
}

function printReport(report: ReportLine[]): void {
  if (report.length === 0) return
  const width = Math.max(...report.map((line) => line.label.length))
  for (const line of report) {
    console.log(`  ${line.mark} ${line.label.padEnd(width)}  ${line.detail}`)
  }
  const refused = report.filter((line) => line.mark === '!').length
  if (refused > 0) {
    console.log(`\n${refused} item(s) marked ! need you — nothing was forced (exit 1).`)
  }
  console.log(`\nWorkflow skills by ${SKILLS_CREDIT}`)
  console.log('Try: /grill-with-docs → /to-tickets → suivre show board\n')
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

async function setupBoard(root: string, say: Say): Promise<void> {
  const service = new BoardService(root)
  let existing: BoardConfig | null
  try {
    existing = await service.loadConfig()
  } catch {
    // "Repair what's missing" must survive a config it cannot read: name the
    // file, say what to do, and let the other steps run.
    say(
      '!',
      'board',
      '.suivre/config.yml is present but invalid (bad YAML, or a column without an id) — fix it, or delete it and re-run `suivre setup`',
    )
    return
  }
  if (existing) {
    say(
      '✓',
      'board',
      `.suivre/ already initialized ("${existing.name}", ${existing.columns.length} columns)`,
    )
    return
  }
  const config = await service.init(basename(root))
  say('✓', 'board', `.suivre/ created ("${config.name}", ${config.columns.length} columns)`)
}

async function setupSkills(opts: SetupOptions, say: Say): Promise<void> {
  const manual = `install manually: \`claude plugins install ${SKILLS_PLUGIN}\` (Claude Code) or \`npx skills@latest add mattpocock/skills\` (any agent)`
  const claudeFound = spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0
  if (!claudeFound) {
    say('!', 'skills', `Claude Code CLI not found — ${manual}`)
    return
  }
  // Running an external installer requires EXPLICIT consent: a yes at the
  // prompt (TTY), or --yes. An agent in a non-TTY shell without --yes gets
  // the instruction instead of the execution — no installation by surprise.
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  if (interactive && !opts.yes) {
    const ok = await confirm(`Install ${SKILLS_PLUGIN} (by Matt Pocock, official marketplace)?`)
    if (!ok) {
      say('•', 'skills', `declined — ${manual}`)
      return
    }
  } else if (!opts.yes) {
    say('•', 'skills', `not installed (non-interactive) — re-run with --yes, or ${manual}`)
    return
  }
  const result = spawnSync('claude', ['plugins', 'install', SKILLS_PLUGIN], { stdio: 'inherit' })
  if (result.status === 0) {
    say('✓', 'skills', `${SKILLS_PLUGIN} plugin installed/updated (auto-updates via Claude Code)`)
  } else {
    say('!', 'skills', `plugin install failed — ${manual}`)
  }
}

async function setupAdapter(root: string, opts: SetupOptions, say: Say): Promise<void> {
  const path = join(root, ADAPTER_RELATIVE_PATH)
  const fresh = renderAdapter(ADAPTER_BODY, ADAPTER_VERSION)
  const plan = planAdapterWrite(await readFileSafe(path), ADAPTER_BODY, ADAPTER_VERSION)
  const label = 'adapter'
  const rel = ADAPTER_RELATIVE_PATH
  // A `.new` from a previous run only makes sense while the file diverges.
  const dropStaleNew = () => removeFile(`${path}.new`)
  switch (plan.action) {
    case 'create':
      await atomicWrite(path, fresh)
      await dropStaleNew()
      say('✓', label, `${rel} written (v${ADAPTER_VERSION})`)
      return
    case 'update':
      await atomicWrite(path, fresh)
      await dropStaleNew()
      say('✓', label, `${rel} updated (v${plan.fromVersion} → v${ADAPTER_VERSION})`)
      return
    case 'up-to-date':
      await dropStaleNew()
      say('✓', label, `${rel} up to date (v${ADAPTER_VERSION})`)
      return
    case 'newer': {
      if (opts.force) {
        await atomicWrite(path, fresh)
        await dropStaleNew()
        say('✓', label, `${rel} downgraded v${plan.fromVersion} → v${ADAPTER_VERSION} (--force)`)
        return
      }
      say(
        '!',
        label,
        `${rel} was written by a newer suivre (v${plan.fromVersion} > v${ADAPTER_VERSION}) — left untouched; update suivre (or \`suivre setup --force\` to downgrade it)`,
      )
      return
    }
    case 'diverged': {
      if (opts.force) {
        await atomicWrite(path, fresh)
        await dropStaleNew()
        say('✓', label, `${rel} overwritten (--force; your edits are gone from it)`)
        return
      }
      await atomicWrite(`${path}.new`, fresh)
      say(
        '!',
        label,
        `${rel} has your own edits — left untouched; latest template written to ${rel}.new (merge or \`suivre setup --force\`)`,
      )
      return
    }
  }
}

/**
 * The role → label mapping is the user's vocabulary: created when missing,
 * never converged. Rewriting it would silently re-point every skill at labels
 * they had renamed.
 */
async function setupTriageLabels(root: string, say: Say): Promise<void> {
  const path = join(root, TRIAGE_LABELS_RELATIVE_PATH)
  if ((await readFileSafe(path)) !== null) {
    say('✓', 'labels', `${TRIAGE_LABELS_RELATIVE_PATH} present — yours, left as is`)
    return
  }
  await atomicWrite(path, TRIAGE_LABELS_BODY)
  say('✓', 'labels', `${TRIAGE_LABELS_RELATIVE_PATH} written (the 5 canonical triage roles)`)
}

/**
 * Claude Code does not load AGENTS.md by default, and Matt Pocock's own setup
 * skill forbids creating one beside an existing CLAUDE.md: write into the file
 * the repo already has — and, once written, keep updating that same one.
 */
async function setupPointer(root: string, say: Say): Promise<void> {
  const candidates = ['CLAUDE.md', 'AGENTS.md'] as const
  const contents = new Map<string, string | null>()
  for (const name of candidates) contents.set(name, await readFileSafe(join(root, name)))
  const owns = (name: string): boolean => {
    const content = contents.get(name) ?? null
    return content !== null && hasBlock(content, AGENTS_POINTER_START, AGENTS_POINTER_END)
  }
  const target =
    candidates.find(owns) ?? candidates.find((name) => contents.get(name) !== null) ?? 'AGENTS.md'
  const plan = upsertBlock(
    contents.get(target) ?? null,
    AGENTS_POINTER_BLOCK,
    AGENTS_POINTER_START,
    AGENTS_POINTER_END,
  )
  switch (plan.action) {
    case 'up-to-date':
      say('✓', 'agents', `${target} pointer up to date`)
      return
    case 'unbalanced':
      say(
        '!',
        'agents',
        `${target} carries ${plan.starts} start and ${plan.ends} end suivre marker(s) that do not pair up — left untouched (repair or delete them, then re-run)`,
      )
      return
    case 'create':
    case 'update':
      await atomicWrite(join(root, target), plan.content)
      say('✓', 'agents', `${target} pointer ${plan.action === 'create' ? 'created' : 'updated'}`)
      return
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function setupMcp(root: string, say: Say): Promise<void> {
  const path = join(root, '.mcp.json')
  const raw = await readFileSafe(path)
  let config: Record<string, unknown> = {}
  if (raw !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      say('!', 'mcp', '.mcp.json exists but is not valid JSON — left untouched')
      return
    }
    if (!isObject(parsed)) {
      say('!', 'mcp', '.mcp.json is valid JSON but not an object — left untouched')
      return
    }
    config = parsed
  }
  const declared = config['mcpServers']
  if (declared !== undefined && !isObject(declared)) {
    say('!', 'mcp', '.mcp.json has an "mcpServers" that is not an object — left untouched')
    return
  }
  const servers: Record<string, unknown> = declared ?? {}
  const write = async (): Promise<void> => {
    config['mcpServers'] = servers
    await atomicWrite(path, `${JSON.stringify(config, null, 2)}\n`)
  }
  // Without SUIVRE_ROOT, a client launched from another directory reads an
  // empty backlog — and `backlog_init` scaffolds `.suivre/` in the wrong repo.
  const entry = servers['suivre']
  if (entry !== undefined) {
    if (!isObject(entry)) {
      say('!', 'mcp', '.mcp.json has a "suivre" entry that is not an object — left untouched')
      return
    }
    const env = entry['env']
    if (isObject(env) && typeof env['SUIVRE_ROOT'] === 'string') {
      say('✓', 'mcp', '.mcp.json already wires the suivre server')
      return
    }
    entry['env'] = { ...(isObject(env) ? env : {}), SUIVRE_ROOT: root }
    await write()
    say('✓', 'mcp', '.mcp.json suivre server pinned to this repo (env.SUIVRE_ROOT)')
    return
  }
  servers['suivre'] = { command: 'suivre', args: ['mcp'], env: { SUIVRE_ROOT: root } }
  await write()
  say(
    '✓',
    'mcp',
    `.mcp.json ${raw === null ? 'created' : 'updated'} → \`suivre mcp\` (requires suivre on PATH)`,
  )
}

/** The adapter promises "git is the history" — say so when there is no git. */
function noteGitRepo(root: string, say: Say): void {
  for (let dir = root; ;) {
    if (existsSync(join(dir, '.git'))) return
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  say(
    '•',
    'git',
    'not a git repository — tickets are files, so nothing is versioned until you `git init`',
  )
}

/** A small opt-in extra: suggested, NEVER installed. */
function noteOverlay(say: Say): void {
  if (process.platform !== 'darwin') return
  // install.sh falls back to ~/Applications when /Applications is not writable.
  const dirs = ['/Applications', join(homedir(), 'Applications')]
  if (dirs.some((dir) => existsSync(join(dir, 'suivre.app')))) return
  say('•', 'overlay', 'optional: `suivre overlay install` adds the double-⌘ overlay (macOS)')
}

/**
 * EOF (piped stdin) and Ctrl-C must resolve: an unresolved prompt lets Node
 * drain its loop and exit 0 having done — and reported — nothing.
 */
async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const refused = new Promise<false>((resolve) => {
      rl.once('close', () => resolve(false))
      rl.once('SIGINT', () => {
        rl.close()
        resolve(false)
      })
    })
    const answer = await Promise.race([rl.question(`${question} [Y/n] `), refused])
    if (answer === false) return false
    const normalized = answer.trim().toLowerCase()
    return normalized === '' || normalized === 'y' || normalized === 'yes'
  } finally {
    rl.close()
  }
}
