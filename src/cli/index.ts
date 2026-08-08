#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { registerTaskCommands } from './commands/tasks'
import { registerSprintCommands } from './commands/sprints'
import { registerKnowledgeCommands } from './commands/knowledge'
import { registerSurfaceCommands } from './commands/surfaces'
import { run } from './context'

const cli = cac('suivre')

// Résolus ici (entrée) : valables depuis src/ comme depuis dist/.
const webDistDir = fileURLToPath(new URL('../../dist/web', import.meta.url))
const desktopDir = fileURLToPath(new URL('../../apps/desktop', import.meta.url))

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

// cac ne matche un nom de commande que sur le PREMIER token d'argv : les noms à
// deux mots ("sprint create") ne matcheraient jamais — silencieusement. On fusionne
// donc `sprint create …` en un seul token avant le parse ; l'aide reste inchangée.
const GROUPS = new Set(['sprint', 'doc', 'decision', 'overlay'])
const argv = [...process.argv]
if (argv[2] && GROUPS.has(argv[2]) && argv[3] && !argv[3].startsWith('-')) {
  argv.splice(2, 2, `${argv[2]} ${argv[3]}`)
}

cli.parse(argv)

// cac est muet sur une commande inconnue — on préfère échouer bruyamment.
if (!cli.matchedCommand && !cli.options['help']) {
  if (cli.args.length === 0) {
    cli.outputHelp()
  } else {
    console.error(`error: unknown command "${cli.args.join(' ')}"`)
    process.exit(1)
  }
}
