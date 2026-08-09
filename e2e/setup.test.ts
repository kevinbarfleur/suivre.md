import { readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { withBoard, type Board, type Run } from './harness'

/**
 * `suivre setup` writes into SOMEONE ELSE'S repo. Its happy path is one test;
 * everything else here is about what it must never do to a file it did not
 * write — overwrite it, splice it, or crash on it.
 */

const ADAPTER = 'docs/agents/issue-tracker.md'
const LABELS = 'docs/agents/triage-labels.md'

const START = '<!-- suivre:tracker:start -->'
const END = '<!-- suivre:tracker:end -->'

interface Step {
  mark: '✓' | '•' | '!'
  detail: string
}

/** One line of the setup report, e.g. `✓ adapter  docs/… written (v2)`. */
function step(run: Run, label: string): Step {
  const match = new RegExp(`^\\s*([✓•!]) ${label} +(.*)$`, 'm').exec(run.stdout)
  if (!match) throw new Error(`no "${label}" line in the report:\n${run.stdout}\n${run.stderr}`)
  return { mark: match[1] as Step['mark'], detail: match[2]! }
}

/** The skills step shells out to `claude`, so every test here opts out of it. */
const setup = (board: Board, ...extra: string[]): Run =>
  board.cli('setup', '--yes', '--skip-skills', ...extra)

const virgin = <T>(fn: (board: Board) => Promise<T>): Promise<T> => withBoard(fn, { init: false })

describe('suivre setup, on a virgin repo', () => {
  it('writes the board, the adapter, the labels, the pointer and the MCP registration', async () => {
    await virgin(async (board) => {
      const run = setup(board)
      expect(run.status, run.stdout + run.stderr).toBe(0)
      expect(step(run, 'board').mark).toBe('✓')
      expect(step(run, 'adapter').mark).toBe('✓')
      expect(step(run, 'labels').mark).toBe('✓')
      expect(step(run, 'agents').mark).toBe('✓')
      expect(step(run, 'mcp').mark).toBe('✓')

      expect(await board.read('.suivre/config.yml')).toContain('columns:')
      expect(await board.read(ADAPTER)).toContain('# Issue tracker: suivre.md')
      expect(await board.read(LABELS)).toContain('# Triage Labels')

      const pointer = await board.read('AGENTS.md')
      expect(pointer).toContain(START)
      expect(pointer).toContain(END)
      expect(pointer).toContain(ADAPTER)
      expect(pointer).toContain(LABELS)

      // Without SUIVRE_ROOT a client launched from another directory reads an
      // empty backlog, so the pin is part of what "wired" means.
      const mcp = JSON.parse(await board.read('.mcp.json')) as {
        mcpServers: Record<string, unknown>
      }
      expect(mcp.mcpServers['suivre']).toMatchObject({
        command: 'suivre',
        args: ['mcp'],
        env: { SUIVRE_ROOT: board.root },
      })
    })
  })

  it('converges on a second run and leaves the adapter byte-identical', async () => {
    await virgin(async (board) => {
      expect(setup(board).status).toBe(0)
      const written = await board.read(ADAPTER)
      const pointer = await board.read('AGENTS.md')
      const mcp = await board.read('.mcp.json')

      const again = setup(board)
      expect(again.status, again.stdout).toBe(0)
      expect(step(again, 'board').detail).toContain('already initialized')
      expect(step(again, 'adapter').detail).toContain('up to date')
      expect(step(again, 'labels').detail).toContain('left as is')
      expect(step(again, 'agents').detail).toContain('up to date')
      expect(step(again, 'mcp').detail).toContain('already wires')

      expect(await board.read(ADAPTER)).toBe(written)
      expect(await board.read('AGENTS.md')).toBe(pointer)
      expect(await board.read('.mcp.json')).toBe(mcp)
    })
  })

  it('does not add an AGENTS.md to a repo that already has a CLAUDE.md', async () => {
    await virgin(async (board) => {
      await board.write('CLAUDE.md', '# House rules\n\nRun the suite before pushing.\n')
      const run = setup(board)
      expect(run.status, run.stdout).toBe(0)
      expect(step(run, 'agents').detail).toContain('CLAUDE.md')

      const claude = await board.read('CLAUDE.md')
      expect(claude).toContain('Run the suite before pushing.')
      expect(claude).toContain(START)
      expect(await readdir(board.root)).not.toContain('AGENTS.md')
    })
  })
})

describe('suivre setup, on an adapter the user has taken over', () => {
  it('preserves the hand-edited file and drops the fresh template beside it', async () => {
    await virgin(async (board) => {
      expect(setup(board).status).toBe(0)
      const mine = `${await board.read(ADAPTER)}\n<!-- our own house rule -->\n`
      await board.write(ADAPTER, mine)

      const run = setup(board)
      expect(run.status).toBe(1)
      expect(step(run, 'adapter').mark).toBe('!')
      expect(step(run, 'adapter').detail).toContain(`${ADAPTER}.new`)
      expect(await board.read(ADAPTER)).toBe(mine)
      expect(await board.read(`${ADAPTER}.new`)).toContain('# Issue tracker: suivre.md')
      expect(await board.read(`${ADAPTER}.new`)).not.toContain('our own house rule')
    })
  })

  it('overwrites it with --force, and clears the stale .new', async () => {
    await virgin(async (board) => {
      expect(setup(board).status).toBe(0)
      const fresh = await board.read(ADAPTER)
      await board.write(ADAPTER, `${fresh}\n<!-- our own house rule -->\n`)
      expect(setup(board).status).toBe(1)

      const forced = setup(board, '--force')
      expect(forced.status, forced.stdout).toBe(0)
      expect(step(forced, 'adapter').detail).toContain('--force')
      expect(await board.read(ADAPTER)).toBe(fresh)
      expect(await readdir(`${board.root}/docs/agents`)).not.toContain('issue-tracker.md.new')
    })
  })
})

describe('suivre setup, on an AGENTS.md it cannot splice safely', () => {
  const refusals = [
    {
      name: 'the start marker quoted on its own line above the real block',
      // The regression: spliced from the quoted marker, the write ate every
      // line between it and the end of the real block.
      content: [
        '# House rules',
        '',
        'The block we generate opens with:',
        '',
        START,
        '',
        'Everything from there to the real block is my own prose.',
        '',
        START,
        'stale pointer',
        END,
        '',
      ].join('\n'),
    },
    {
      name: 'a start marker with no end',
      content: ['# House rules', '', 'Keep this paragraph.', '', START, 'dangling', ''].join('\n'),
    },
    {
      name: 'an end marker before its start',
      content: ['# House rules', '', END, '', 'Keep this paragraph.', '', START, ''].join('\n'),
    },
  ]

  for (const { name, content } of refusals) {
    it(`leaves it untouched and reports ! when it carries ${name}`, async () => {
      await virgin(async (board) => {
        await board.write('AGENTS.md', content)
        const run = setup(board)

        expect(run.status).toBe(1)
        expect(step(run, 'agents').mark).toBe('!')
        expect(step(run, 'agents').detail).toContain('left untouched')
        expect(await board.read('AGENTS.md')).toBe(content)
        // A refused step must not cost the user the ones that did converge.
        expect(step(run, 'adapter').mark).toBe('✓')
        expect(step(run, 'labels').mark).toBe('✓')
        expect(step(run, 'mcp').mark).toBe('✓')
        expect(await board.read(ADAPTER)).toContain('# Issue tracker: suivre.md')
      })
    })
  }

  it('replaces a well-formed block in place, prose and inline mentions intact', async () => {
    await virgin(async (board) => {
      // The same marker inside a sentence is prose, not a delimiter: refusing
      // here would leave any repo that documents the marker unconvergeable.
      const content = [
        '# House rules',
        '',
        `Our setup keeps a \`${START}\` block below. Do not delete it.`,
        '',
        '## Testing',
        '',
        'Run the suite before pushing.',
        '',
        START,
        'stale pointer',
        END,
        '',
        '## Afterword',
        '',
        'Keep this paragraph too.',
        '',
      ].join('\n')
      await board.write('AGENTS.md', content)

      const run = setup(board)
      expect(run.status, run.stdout).toBe(0)
      expect(step(run, 'agents').detail).toContain('updated')

      const next = await board.read('AGENTS.md')
      expect(next).toContain('Run the suite before pushing.')
      expect(next).toContain('Keep this paragraph too.')
      expect(next).toContain(`Our setup keeps a \`${START}\` block below.`)
      expect(next).not.toContain('stale pointer')
      expect(next).toContain(ADAPTER)
      // One block, not one per mention of the marker.
      expect(next.split(END)).toHaveLength(2)
    })
  })
})

describe('suivre setup, on a .mcp.json it cannot read', () => {
  const malformed = [
    { name: 'null', content: 'null' },
    { name: 'a bare string', content: '"just a string"' },
    { name: 'an array', content: '[]' },
    { name: 'a non-object mcpServers', content: '{ "mcpServers": 5 }' },
    { name: 'text that is not JSON at all', content: 'not json at all\n' },
  ]

  for (const { name, content } of malformed) {
    it(`reports ! and leaves it untouched when it holds ${name}`, async () => {
      await virgin(async (board) => {
        await board.write('.mcp.json', content)
        const run = setup(board)

        expect(run.status).toBe(1)
        expect(run.stderr).toBe('')
        expect(step(run, 'mcp').mark).toBe('!')
        expect(step(run, 'mcp').detail).toContain('left untouched')
        expect(await board.read('.mcp.json')).toBe(content)
        // Every other step still ran, and the report says so.
        expect(step(run, 'board').mark).toBe('✓')
        expect(step(run, 'adapter').mark).toBe('✓')
        expect(step(run, 'agents').mark).toBe('✓')
        expect(run.stdout).toContain('nothing was forced (exit 1)')
      })
    })
  }
})
