#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { BoardService } from '../service/board-service'
import { prioritySchema } from '../domain'

const cli = cac('suivre')
const service = (): BoardService => new BoardService(process.env.SUIVRE_ROOT ?? process.cwd())

cli
  .command('init [name]', 'Initialise un backlog dans le repo courant')
  .action(async (name?: string) => {
    const config = await service().init(name ?? 'Backlog')
    console.log(`Backlog « ${config.name} » prêt — ${config.columns.length} colonnes.`)
  })

cli
  .command('add <title>', 'Crée une tâche')
  .option('--status <status>', 'Colonne cible')
  .option('--priority <priority>', 'low | medium | high | urgent')
  .action(async (title: string, options: { status?: string; priority?: string }) => {
    const priority = options.priority ? prioritySchema.parse(options.priority) : undefined
    const task = await service().create({ title, status: options.status, priority })
    console.log(`${task.frontmatter.id}  ${task.frontmatter.title}`)
  })

cli.command('list', 'Liste les tâches').action(async () => {
  const tasks = await service().listTasks()
  if (tasks.length === 0) {
    console.log('Aucune tâche.')
    return
  }
  for (const task of tasks) {
    console.log(`${task.frontmatter.id}  [${task.frontmatter.status}]  ${task.frontmatter.title}`)
  }
})

cli
  .command('move <id> <status>', 'Déplace une tâche vers une colonne')
  .action(async (id: string, status: string) => {
    const task = await service().move(id, status)
    console.log(`${task.frontmatter.id} → ${status}`)
  })

cli.command('rm <id>', 'Supprime une tâche').action(async (id: string) => {
  const ok = await service().remove(id)
  console.log(ok ? 'Supprimée.' : 'Introuvable.')
})

cli
  .command('board', 'Lance le board web (live, un seul process)')
  .option('--port <port>', 'Port HTTP')
  .action(async (options: { port?: string }) => {
    const { startServer } = await import('../server/index')
    const distDir = fileURLToPath(new URL('../../dist/web', import.meta.url))
    const handle = await startServer(process.env.SUIVRE_ROOT ?? process.cwd(), {
      distDir,
      port: options.port ? Number(options.port) : undefined,
    })
    console.log(`\n  suivre.md — board sur ${handle.url}\n  Ctrl+C pour arrêter.\n`)
  })

cli
  .command('show [view]', 'Reveal the desktop overlay on a view/item (macOS app)')
  .option('--target <name>', 'Project or link name (default: active target)')
  .action(async (view: string | undefined, options: { target?: string }) => {
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (options.target) params.set('target', options.target)
    const query = params.toString()
    const url = `suivre://show${query ? `?${query}` : ''}`
    const { spawn } = await import('node:child_process')
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
    console.log(`overlay -> ${url}`)
  })

cli.help()
cli.parse()
