#!/usr/bin/env node
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { registerTaskCommands } from './commands/tasks'
import { registerSprintCommands } from './commands/sprints'
import { registerKnowledgeCommands } from './commands/knowledge'
import { registerSurfaceCommands } from './commands/surfaces'
import { run, runCli } from './context'

const cli = cac('suivre')

// Resolved here (entry): valid from src/ as well as from dist/.
const webDistDir = fileURLToPath(new URL('../../dist/web', import.meta.url))
const desktopDir = fileURLToPath(new URL('../../apps/desktop', import.meta.url))

// package.json sits two levels above both src/cli/ and dist/cli/; `createRequire`
// keeps the path relative to the emitted file rather than to a bundled chunk.
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

registerTaskCommands(cli)
registerSprintCommands(cli)
registerKnowledgeCommands(cli)
registerSurfaceCommands(cli, { webDistDir, desktopDir })

cli
  .command(
    'setup',
    "Wire this repo for agent workflows: board, Matt Pocock's skills, tracker adapter, MCP",
  )
  .option('--yes', 'Accept all defaults, no prompts')
  .option('--force', 'Overwrite a hand-edited adapter instead of writing a .new file')
  .option('--skip-skills', 'Skip the skills installation step')
  .option('--skip-mcp', 'Skip MCP registration (.mcp.json)')
  .action(
    run(async (options) => {
      const { runSetup } = await import('../setup')
      await runSetup(process.env.SUIVRE_ROOT ?? process.cwd(), {
        yes: options.yes,
        force: options.force,
        skipSkills: options.skipSkills,
        skipMcp: options.skipMcp,
      })
    }),
  )

cli.help()
cli.version(version)

// Every failure path inside exits the process, so this only settles on success.
void runCli(cli, process.argv)
