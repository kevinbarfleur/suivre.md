#!/usr/bin/env node
import { cac } from 'cac'
import { BoardService } from '../service/board-service'
import { prioritySchema } from '../domain'

const cli = cac('suivre')
const service = (): BoardService => new BoardService(process.env.SUIVRE_ROOT ?? process.cwd())

cli.command('init [name]', 'Initialise un backlog dans le repo courant').action(async (name?: string) => {
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

cli.command('board', 'Lance le board web (live)').action(async () => {
  const { startServer } = await import('../server/index')
  const handle = await startServer(process.env.SUIVRE_ROOT ?? process.cwd())
  console.log(`Board sur ${handle.url} — Ctrl+C pour arrêter.`)
})

cli.help()
cli.parse()
