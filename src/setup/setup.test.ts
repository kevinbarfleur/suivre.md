import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cac } from 'cac'
import { registerTaskCommands } from '../cli/commands/tasks'
import { registerSprintCommands } from '../cli/commands/sprints'
import { registerKnowledgeCommands } from '../cli/commands/knowledge'
import { registerSurfaceCommands } from '../cli/commands/surfaces'
import { runSetup } from './index'
import { renderAdapter } from './reconcile'
import {
  ADAPTER_BODY,
  ADAPTER_RELATIVE_PATH,
  ADAPTER_VERSION,
  AGENTS_POINTER_BLOCK,
  AGENTS_POINTER_START,
  TRIAGE_LABELS_RELATIVE_PATH,
} from './templates'

/**
 * `suivre setup` writes into someone else's repo: every case here is exercised
 * against a real throwaway directory, never a mock filesystem.
 */

const roots: string[] = []
let logs: string[]

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'suivre-setup-'))
  // Without this, the git warning fires and pollutes the reported state.
  await mkdir(join(root, '.git'), { recursive: true })
  roots.push(root)
  return root
}

const converge = (root: string, force = false) =>
  runSetup(root, { skipSkills: true, force, yes: true })

const read = (root: string, ...segments: string[]) => readFile(join(root, ...segments), 'utf8')

const report = (): string => logs.join('\n')

beforeEach(() => {
  logs = []
  process.exitCode = 0
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = 0
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('runSetup — a fresh repo', () => {
  it('writes the board, the adapter, the labels, the pointer and the MCP entry', async () => {
    const root = await repo()
    await converge(root)

    expect(existsSync(join(root, '.suivre/config.yml'))).toBe(true)
    expect(await read(root, ADAPTER_RELATIVE_PATH)).toBe(
      renderAdapter(ADAPTER_BODY, ADAPTER_VERSION),
    )
    expect(await read(root, TRIAGE_LABELS_RELATIVE_PATH)).toContain('ready-for-agent')
    expect(await read(root, 'AGENTS.md')).toContain(AGENTS_POINTER_BLOCK)
    expect(JSON.parse(await read(root, '.mcp.json'))).toEqual({
      mcpServers: { suivre: { command: 'suivre', args: ['mcp'], env: { SUIVRE_ROOT: root } } },
    })
    expect(process.exitCode).toBe(0)
  })

  it('converges: a second run changes nothing and reports no failure', async () => {
    const root = await repo()
    await converge(root)
    const before = await Promise.all(
      [ADAPTER_RELATIVE_PATH, TRIAGE_LABELS_RELATIVE_PATH, 'AGENTS.md', '.mcp.json'].map((file) =>
        read(root, file),
      ),
    )

    logs = []
    await converge(root)
    const after = await Promise.all(
      [ADAPTER_RELATIVE_PATH, TRIAGE_LABELS_RELATIVE_PATH, 'AGENTS.md', '.mcp.json'].map((file) =>
        read(root, file),
      ),
    )

    expect(after).toEqual(before)
    expect(report()).not.toContain('!')
    expect(process.exitCode).toBe(0)
  })

  it('warns (without failing) when the directory is not a git repo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suivre-nogit-'))
    roots.push(root)
    await converge(root)
    expect(report()).toContain('not a git repository')
    expect(process.exitCode).toBe(0)
  })
})

describe('runSetup — the agent pointer', () => {
  it('prefers CLAUDE.md when it exists, and does not create AGENTS.md', async () => {
    const root = await repo()
    await writeFile(join(root, 'CLAUDE.md'), '# Project\n\nBuild with npm ci.\n')

    await converge(root)

    const claude = await read(root, 'CLAUDE.md')
    expect(claude).toContain('Build with npm ci.')
    expect(claude).toContain(AGENTS_POINTER_BLOCK)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })

  it('keeps updating the file that already carries the block', async () => {
    const root = await repo()
    await writeFile(join(root, 'CLAUDE.md'), '# Project\n')
    await writeFile(
      join(root, 'AGENTS.md'),
      `# Agents\n\n${AGENTS_POINTER_START}\nstale\n<!-- suivre:tracker:end -->\n`,
    )

    await converge(root)

    expect(await read(root, 'AGENTS.md')).toContain(AGENTS_POINTER_BLOCK)
    expect(await read(root, 'CLAUDE.md')).toBe('# Project\n')
  })

  it('refuses to splice when the markers do not pair up, and exits 1', async () => {
    const root = await repo()
    const orphaned = `# Agents\n\n${AGENTS_POINTER_START}\n\n## Build\n\nRun npm ci.\n`
    await writeFile(join(root, 'AGENTS.md'), orphaned)

    await converge(root)

    expect(await read(root, 'AGENTS.md')).toBe(orphaned)
    expect(report()).toContain('do not pair up')
    expect(process.exitCode).toBe(1)
  })
})

describe('runSetup — the adapter', () => {
  it('refuses to downgrade an adapter written by a newer suivre', async () => {
    const root = await repo()
    const fromTheFuture = renderAdapter('# From a newer suivre\n', ADAPTER_VERSION + 5)
    await mkdir(join(root, 'docs/agents'), { recursive: true })
    await writeFile(join(root, ADAPTER_RELATIVE_PATH), fromTheFuture)

    await converge(root)

    expect(await read(root, ADAPTER_RELATIVE_PATH)).toBe(fromTheFuture)
    expect(report()).toContain('newer suivre')
    expect(process.exitCode).toBe(1)
  })

  it('leaves a hand-edited adapter alone and offers a .new', async () => {
    const root = await repo()
    await mkdir(join(root, 'docs/agents'), { recursive: true })
    await writeFile(join(root, ADAPTER_RELATIVE_PATH), '# Mine\n')

    await converge(root)

    expect(await read(root, ADAPTER_RELATIVE_PATH)).toBe('# Mine\n')
    expect(await read(root, `${ADAPTER_RELATIVE_PATH}.new`)).toContain('suivre-adapter')
    expect(process.exitCode).toBe(1)
  })

  it('does not rewrite a triage-labels.md the user has edited', async () => {
    const root = await repo()
    await mkdir(join(root, 'docs/agents'), { recursive: true })
    await writeFile(join(root, TRIAGE_LABELS_RELATIVE_PATH), '# Ours\n\nbug:triage\n')

    await converge(root)

    expect(await read(root, TRIAGE_LABELS_RELATIVE_PATH)).toBe('# Ours\n\nbug:triage\n')
  })
})

describe('runSetup — .mcp.json', () => {
  it.each([
    ['null', 'null'],
    ['a string', '"nope"'],
    ['an array', '[]'],
    ['broken JSON', '{'],
  ])('leaves %s untouched, reports it and exits 1', async (_name, content) => {
    const root = await repo()
    await writeFile(join(root, '.mcp.json'), content)

    await converge(root)

    expect(await read(root, '.mcp.json')).toBe(content)
    expect(process.exitCode).toBe(1)
    // The steps after the failure still ran.
    expect(existsSync(join(root, ADAPTER_RELATIVE_PATH))).toBe(true)
  })

  it('pins an existing suivre server to this repo instead of claiming success', async () => {
    const root = await repo()
    await writeFile(
      join(root, '.mcp.json'),
      `${JSON.stringify({ mcpServers: { suivre: { command: 'suivre', args: ['mcp'] }, other: {} } }, null, 2)}\n`,
    )

    await converge(root)

    expect(JSON.parse(await read(root, '.mcp.json'))).toEqual({
      mcpServers: {
        suivre: { command: 'suivre', args: ['mcp'], env: { SUIVRE_ROOT: root } },
        other: {},
      },
    })
    expect(process.exitCode).toBe(0)
  })
})

describe('runSetup — a broken board config', () => {
  it('names the file, keeps going, and still writes the adapter', async () => {
    const root = await repo()
    await mkdir(join(root, '.suivre'), { recursive: true })
    await writeFile(join(root, '.suivre/config.yml'), 'name: 42\ncolumns: "not a list"\n')

    await converge(root)

    expect(report()).toContain('.suivre/config.yml')
    expect(existsSync(join(root, ADAPTER_RELATIVE_PATH))).toBe(true)
    expect(existsSync(join(root, '.mcp.json'))).toBe(true)
    expect(process.exitCode).toBe(1)
  })
})

describe('the adapter contract', () => {
  it('gives a heredoc whose terminator is at column 0', () => {
    expect(ADAPTER_BODY).toContain("--body \"$(cat <<'EOF'")
    expect(ADAPTER_BODY).toContain('\nEOF\n)"\n')
  })

  it('parses in every shell available here (zsh aborts on an indented EOF)', async () => {
    const snippet = /```bash\n([\s\S]*?)```/.exec(ADAPTER_BODY)?.[1]
    expect(snippet).toBeTruthy()
    const script = join(await repo(), 'snippet.sh')
    await writeFile(script, snippet!)
    const shells = ['bash', 'zsh'].filter(
      (shell) => spawnSync(shell, ['-c', 'exit 0'], { stdio: 'ignore' }).status === 0,
    )
    for (const shell of shells) {
      expect([shell, spawnSync(shell, ['-n', script], { stdio: 'ignore' }).status]).toEqual([
        shell,
        0,
      ])
    }
  })

  /**
   * The adapter is what agents obey, so a claim it makes about the CLI has to
   * be checked against the CLI itself. Asserting a hard-coded sentence here is
   * what let the two drift apart the first time: the sentence stayed true-looking
   * while `--json` was added to three more commands.
   */
  it('only promises --json for commands that accept it', () => {
    const cli = cac('suivre')
    registerTaskCommands(cli)
    registerSprintCommands(cli)
    registerKnowledgeCommands(cli)
    registerSurfaceCommands(cli, { webDistDir: '', desktopDir: '' })
    const accepts = new Set(
      cli.commands
        .filter((command) => command.options.some((option) => option.name === 'json'))
        .map((command) => command.name.split(' ')[0]),
    )

    const paragraph = ADAPTER_BODY.match(/^Every command that reads or writes takes[^]*?\n\n/m)?.[0]
    expect(paragraph, 'the --json paragraph moved or was reworded').toBeTruthy()
    const claimed = paragraph!.split('Only the long-running')[0]!
    for (const name of claimed.matchAll(/`([a-z]+)`/g)) {
      const command = name[1]!
      if (['json', 'sprint', 'doc', 'decision'].includes(command)) continue
      expect(accepts, `the adapter promises --json on \`${command}\``).toContain(command)
    }
    for (const longRunning of ['board', 'mcp', 'setup']) {
      expect(accepts, `\`${longRunning}\` now takes --json`).not.toContain(longRunning)
    }
  })

  it('states the replace semantics the MCP tools do not share with the CLI', () => {
    expect(ADAPTER_BODY).toContain('List fields replace, they do not merge')
    for (const tool of ['task_get', 'task_edit', 'task_move', 'sprint_add']) {
      expect(ADAPTER_BODY).toContain(`\`${tool}\``)
    }
    // It used to declare `sprint_add` missing while the tool was registered,
    // which pushed agents into a read-modify-write race for no reason. The e2e
    // suite checks the enumeration against the live registry.
    expect(ADAPTER_BODY).not.toContain('There is no `sprint_add`')
  })

  it('tells the agent where to read the state it cannot guess', () => {
    expect(ADAPTER_BODY).toContain('.suivre/config.yml')
    expect(ADAPTER_BODY).toContain('suivre sprint list --json')
  })
})
