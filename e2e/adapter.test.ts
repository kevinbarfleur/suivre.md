import { beforeAll, describe, expect, it } from 'vitest'
import { ADAPTER_BODY } from '../src/setup/templates'
import { mcpSession, withBoard, type Board } from './harness'

/**
 * The adapter is the contract Matt Pocock's skills read to drive suivre, so a
 * command it prescribes that does not work is a silent failure in every user's
 * repo. This suite extracts the commands FROM the contract and runs them, which
 * means a claim can never drift from the CLI again: adding a line to the adapter
 * adds a test.
 *
 * Two classes of citation, checked differently:
 *  - a bare verb (`suivre add`) — the command must exist;
 *  - a full invocation (`suivre get task-013 --json`) — it must actually run.
 */

/** Ids the adapter cites literally; the fixture board is built to contain them. */
const PLACEHOLDERS: [RegExp, string][] = [
  [/<you>/g, 'claude'],
  [/<id>/g, 'task-013'],
  [/<blocker-id>/g, 'task-012'],
  [/<feature>/g, 'Auth'],
  [/<title>/g, 'Signed cookies over a session store'],
  [/<one-liner>/g, 'Ship the overlay'],
  [/<Notes[^>]*>/g, '## Notes'],
  [/<answer>/g, 'Signed cookies, no store.'],
  [/<sprint-id>/g, 'sprint-001'],
  [/<task-id>/g, 'task-013'],
  [/<doc-id>/g, 'doc-003'],
  [/<decision-id>/g, 'decision-001'],
  [/<column>/g, 'doing'],
  [/<label>/g, 'bug'],
  [/<name>/g, 'claude'],
  [/"\.\.\."/g, '"a real value"'],
  [/<[a-z-]+>/g, 'x'],
]

function fill(command: string): string {
  return PLACEHOLDERS.reduce((out, [from, to]) => out.replace(from, to), command)
}

/** Every `suivre …` snippet the adapter quotes, whitespace-normalised. */
function citations(): string[] {
  const found = ADAPTER_BODY.match(/`suivre [^`]{2,200}`/g) ?? []
  const seen = new Set<string>()
  for (const raw of found) seen.add(raw.slice(1, -1).replace(/\s+/g, ' ').trim())
  return [...seen]
}

/** The runnable bash blocks the adapter shows as examples. */
function bashBlocks(): string[] {
  return [...ADAPTER_BODY.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1] ?? '')
}

/**
 * `show` reveals the macOS overlay by spawning `open`, so running it in a test
 * would try to raise a real window. Its existence and flags are asserted through
 * `--help` instead.
 */
const NOT_EXECUTED = /^suivre show\b/

async function seed(board: Board): Promise<void> {
  for (let i = 1; i <= 14; i += 1) board.cli('add', `Seeded task ${i}`)
  for (let i = 1; i <= 3; i += 1) board.cli('doc', 'create', `Seeded doc ${i}`)
  board.cli('decision', 'create', 'Seeded decision')
  board.cli('sprint', 'create', 'Seeded sprint', '--item', 'task-013')
}

let commands: string[]
let blocks: string[]

beforeAll(() => {
  commands = citations()
  blocks = bashBlocks()
})

describe('the adapter only prescribes commands that exist', () => {
  it('quotes a non-trivial number of commands', () => {
    // A regex that silently stops matching would make this whole suite vacuous.
    expect(commands.length).toBeGreaterThan(20)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('names only registered commands', async () => {
    await withBoard(async (board) => {
      const help = board.cli('--help').stdout
      const groups = ['sprint', 'doc', 'decision', 'overlay']
      const groupHelp = Object.fromEntries(
        groups.map((g) => [g, board.cli(g, '--help').stdout + help]),
      )
      for (const command of commands) {
        const [, verb, maybeSub] = command.split(' ')
        const haystack = verb && groups.includes(verb) ? (groupHelp[verb] ?? help) : help
        const needle = verb && groups.includes(verb) ? `${verb} ${maybeSub}` : verb
        expect(haystack, `\`${command}\` names an unknown command`).toContain(needle)
      }
    })
  })
})

describe('the adapter only prescribes commands that run', () => {
  it('runs every fully-formed invocation it quotes', async () => {
    await withBoard(async (board) => {
      await seed(board)
      const failures: string[] = []
      for (const command of commands) {
        if (NOT_EXECUTED.test(command)) continue
        const filled = fill(command)
        // A bare verb is a mention, not an invocation: nothing to run.
        const words = filled.split(' ')
        const isGroup = ['sprint', 'doc', 'decision', 'overlay'].includes(words[1] ?? '')
        if (words.length <= (isGroup ? 3 : 2)) continue
        const run = board.sh(filled)
        if (run.status !== 0) {
          failures.push(`${filled}\n    exit ${run.status}: ${run.stderr.trim().split('\n')[0]}`)
        }
      }
      expect(failures.join('\n  ')).toBe('')
    })
  })

  it('runs the shell examples it shows, under zsh', async () => {
    await withBoard(async (board) => {
      await seed(board)
      for (const block of blocks) {
        const run = board.sh(block, 'zsh')
        expect(run.status, `zsh rejected an adapter example:\n${block}\n${run.stderr}`).toBe(0)
      }
    })
  })

  it('creates a ticket from the heredoc example, body intact', async () => {
    await withBoard(async (board) => {
      const heredoc = blocks.find((b) => b.includes('<<'))
      expect(heredoc, 'the adapter no longer shows a heredoc example').toBeTruthy()
      const run = board.sh(heredoc ?? '', 'zsh')
      expect(run.status).toBe(0)
      const task = board.cli('get', 'task-001', '--json').json<{ body: string }>()
      expect(task.body).not.toContain('EOF')
      expect(task.body.split('\n').some((line) => line.startsWith('- ['))).toBe(true)
    })
  })

  it('documents `--json` only where the CLI accepts it', async () => {
    await withBoard(async (board) => {
      const paragraph = ADAPTER_BODY.match(/^Every command that reads or writes takes[^]*?\n\n/m)
      expect(paragraph, 'the --json paragraph moved or was reworded').toBeTruthy()
      const claimed = (paragraph?.[0] ?? '').split('Only the long-running')[0] ?? ''
      for (const match of claimed.matchAll(/`([a-z]+)`/g)) {
        const name = match[1] ?? ''
        if (['json', 'sprint', 'doc', 'decision'].includes(name)) continue
        expect(board.cli(name, '--help').stdout, `\`${name}\` has no --json`).toContain('--json')
      }
    })
  })

  it('enumerates the MCP tools that exist, and claims none is missing', async () => {
    await withBoard(async (board) => {
      const responses = await board.mcp(mcpSession({ id: 1, method: 'tools/list' }))
      const registered = new Set(
        ((responses.get(1)?.result?.['tools'] as { name: string }[]) ?? []).map((t) => t.name),
      )
      expect(registered.size).toBeGreaterThan(15)

      const section = ADAPTER_BODY.slice(ADAPTER_BODY.indexOf('## MCP tools'))
      const named = new Set([...section.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1] ?? ''))
      expect(named.size).toBeGreaterThan(15)

      for (const tool of named) {
        expect(registered, `the adapter names \`${tool}\`, which is not registered`).toContain(tool)
      }
      // The reverse direction is what went wrong: it declared `sprint_add`
      // missing while the tool existed, sending agents into a needless
      // read-modify-write race.
      for (const tool of registered) {
        expect(section, `\`${tool}\` is registered but the adapter never names it`).toContain(
          `\`${tool}\``,
        )
      }
    })
  })

  it('references only files that setup actually writes', async () => {
    await withBoard(
      async (board) => {
        expect(board.cli('setup', '--yes', '--skip-skills', '--skip-mcp').status).toBe(0)
        for (const match of ADAPTER_BODY.matchAll(/`([a-z-]+\.md)`/g)) {
          const file = match[1] ?? ''
          await expect(
            board.read(`docs/agents/${file}`),
            `the adapter points at docs/agents/${file}, which setup never writes`,
          ).resolves.toBeTruthy()
        }
      },
      { init: false },
    )
  })
})
