import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { atomicWrite, readFileSafe, removeFile } from '../storage'
import { BoardService } from '../service/board-service'
import { planAdapterWrite, renderAdapter, upsertBlock } from './reconcile'
import {
  ADAPTER_BODY,
  ADAPTER_RELATIVE_PATH,
  ADAPTER_VERSION,
  AGENTS_POINTER_BLOCK,
  AGENTS_POINTER_END,
  AGENTS_POINTER_START,
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

export async function runSetup(root: string, opts: SetupOptions = {}): Promise<void> {
  const report: ReportLine[] = []
  const say = (mark: ReportLine['mark'], label: string, detail: string) =>
    report.push({ mark, label, detail })

  console.log(`suivre setup — ${root}\n`)

  // 1. Board — init if absent, adopt otherwise.
  const service = new BoardService(root)
  const existing = await service.loadConfig()
  if (existing) {
    say(
      '✓',
      'board',
      `.suivre/ already initialized ("${existing.name}", ${existing.columns.length} columns)`,
    )
  } else {
    const config = await service.init(basename(root))
    say('✓', 'board', `.suivre/ created ("${config.name}", ${config.columns.length} columns)`)
  }

  // 2. Matt Pocock's skills — through his official channel only.
  if (opts.skipSkills) {
    say('•', 'skills', 'skipped (--skip-skills)')
  } else {
    await setupSkills(opts, say)
  }

  // 3. The adapter: the contract his skills read to talk to suivre.
  await setupAdapter(root, opts, say)

  // 4. Pointer in AGENTS.md, for agents that don't read docs/agents/ on their own.
  const agentsPath = join(root, 'AGENTS.md')
  const agentsBefore = await readFileSafe(agentsPath)
  const agentsAfter = upsertBlock(
    agentsBefore,
    AGENTS_POINTER_BLOCK,
    AGENTS_POINTER_START,
    AGENTS_POINTER_END,
  )
  if (agentsAfter === agentsBefore) {
    say('✓', 'agents', 'AGENTS.md pointer up to date')
  } else {
    await atomicWrite(agentsPath, agentsAfter)
    say('✓', 'agents', `AGENTS.md pointer ${agentsBefore === null ? 'created' : 'updated'}`)
  }

  // 5. Project MCP (.mcp.json) — the board as native tools for the agent.
  if (opts.skipMcp) {
    say('•', 'mcp', 'skipped (--skip-mcp)')
  } else {
    await setupMcp(root, say)
  }

  // 6. Desktop overlay (macOS) — a small opt-in extra: suggested, NEVER installed.
  if (process.platform === 'darwin' && !existsSync('/Applications/suivre.app')) {
    say('•', 'overlay', 'optional: `suivre overlay install` adds the double-⌘ overlay (macOS)')
  }

  const width = Math.max(...report.map((line) => line.label.length))
  for (const line of report) {
    console.log(`  ${line.mark} ${line.label.padEnd(width)}  ${line.detail}`)
  }
  console.log(`\nWorkflow skills by ${SKILLS_CREDIT}`)
  console.log('Try: /grill-with-docs → /to-tickets → suivre show board\n')
}

async function setupSkills(
  opts: SetupOptions,
  say: (mark: ReportLine['mark'], label: string, detail: string) => void,
): Promise<void> {
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

async function setupAdapter(
  root: string,
  opts: SetupOptions,
  say: (mark: ReportLine['mark'], label: string, detail: string) => void,
): Promise<void> {
  const path = join(root, ADAPTER_RELATIVE_PATH)
  const fresh = renderAdapter(ADAPTER_BODY, ADAPTER_VERSION)
  const plan = planAdapterWrite(await readFileSafe(path), ADAPTER_BODY)
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

async function setupMcp(
  root: string,
  say: (mark: ReportLine['mark'], label: string, detail: string) => void,
): Promise<void> {
  const path = join(root, '.mcp.json')
  const raw = await readFileSafe(path)
  let config: { mcpServers?: Record<string, unknown> } = {}
  if (raw !== null) {
    try {
      config = JSON.parse(raw) as typeof config
    } catch {
      say('!', 'mcp', '.mcp.json exists but is not valid JSON — left untouched')
      return
    }
  }
  const servers = (config.mcpServers ??= {})
  if (servers['suivre']) {
    say('✓', 'mcp', '.mcp.json already wires the suivre server')
    return
  }
  servers['suivre'] = { command: 'suivre', args: ['mcp'] }
  await atomicWrite(path, `${JSON.stringify(config, null, 2)}\n`)
  say(
    '✓',
    'mcp',
    `.mcp.json ${raw === null ? 'created' : 'updated'} → \`suivre mcp\` (requires suivre on PATH)`,
  )
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase()
    return answer === '' || answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}
