import type { CAC } from 'cac'
import { prioritySchema } from '../../domain'
import type { TaskPatch } from '../../domain'
import {
  compact,
  printJson,
  printTask,
  run,
  service,
  taskJson,
  taskLine,
  toArray,
} from '../context'

/** Commandes tâches : le cœur du contrat tracker (create/read/list/edit/comment/close/next). */
export function registerTaskCommands(cli: CAC): void {
  cli
    .command('add <title>', 'Create a task')
    .option('--status <status>', 'Target column (default: first column)')
    .option('--priority <priority>', 'low | medium | high | urgent')
    .option('--label <label>', 'Label (repeatable)')
    .option('--assignee <assignee>', 'Assignee')
    .option('--parent <id>', 'Parent task id')
    .option('--depends <id>', 'Blocking task id (repeatable)')
    .option('--body <markdown>', 'Task body (use a shell heredoc for multi-line)')
    .option('--json', 'JSON output')
    .action(
      run(async (title: string, options) => {
        const task = await service().create({
          title,
          status: options.status,
          priority: options.priority ? prioritySchema.parse(options.priority) : undefined,
          labels: toArray(options.label),
          assignee: options.assignee,
          parent: options.parent,
          depends: toArray(options.depends),
          body: options.body,
        })
        if (options.json) printJson(taskJson(task))
        else console.log(`${task.frontmatter.id}  ${task.frontmatter.title}`)
      }),
    )

  cli
    .command('list', 'List tasks (board order)')
    .option('--status <status>', 'Filter by column')
    .option('--label <label>', 'Filter by label')
    .option('--assignee <assignee>', 'Filter by assignee')
    .option('--ready', 'Only ready tasks: not done, unassigned, no open dependency')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const tasks = await service().queryTasks({
          status: options.status,
          label: options.label,
          assignee: options.assignee,
          ready: options.ready,
        })
        if (options.json) {
          printJson(tasks.map(taskJson))
          return
        }
        if (tasks.length === 0) {
          console.log('No tasks.')
          return
        }
        for (const task of tasks) console.log(taskLine(task))
      }),
    )

  cli
    .command('get <id>', 'Show a task, including its body')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const task = await service().getTask(id)
        if (!task) throw new Error(`Task not found: ${id}`)
        if (options.json) printJson(taskJson(task))
        else printTask(task)
      }),
    )

  cli
    .command('edit <id>', 'Edit a task (fields and/or labels)')
    .option('--title <title>', 'New title')
    .option('--status <status>', 'New column')
    .option('--priority <priority>', 'low | medium | high | urgent')
    .option('--assignee <assignee>', 'Assign (empty string to clear)')
    .option('--parent <id>', 'Parent task id')
    .option('--depends <id>', 'Replace blocking ids (repeatable)')
    .option('--add-label <label>', 'Add a label (repeatable)')
    .option('--remove-label <label>', 'Remove a label (repeatable)')
    .option('--body <markdown>', 'Replace the body')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const svc = service()
        const current = await svc.getTask(id)
        if (!current) throw new Error(`Task not found: ${id}`)
        let labels: string[] | undefined
        const add = toArray(options.addLabel) ?? []
        const remove = toArray(options.removeLabel) ?? []
        if (add.length > 0 || remove.length > 0) {
          labels = current.frontmatter.labels
            .filter((label) => !remove.includes(label))
            .concat(add.filter((label) => !current.frontmatter.labels.includes(label)))
        }
        const patch: TaskPatch = compact({
          title: options.title,
          status: options.status,
          priority: options.priority ? prioritySchema.parse(options.priority) : undefined,
          assignee: options.assignee,
          parent: options.parent,
          depends: toArray(options.depends),
          labels,
          body: options.body,
        })
        // `--assignee ""` désassigne : le `undefined` explicite survit au compactage.
        if (options.assignee === '') patch.assignee = undefined
        const task = await svc.edit(id, patch)
        if (options.json) printJson(taskJson(task))
        else console.log(taskLine(task))
      }),
    )

  cli
    .command('comment <id> <text>', 'Append a timestamped comment to a task')
    .option('--author <author>', 'Comment author (e.g. claude, kevin)')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, text: string, options) => {
        const task = await service().comment(id, text, options.author)
        if (options.json) printJson(taskJson(task))
        else console.log(`${task.frontmatter.id}  comment added`)
      }),
    )

  cli
    .command('move <id> <status>', 'Move a task to a column')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, status: string, options) => {
        const task = await service().move(id, status)
        if (options.json) printJson(taskJson(task))
        else console.log(`${task.frontmatter.id} → ${status}`)
      }),
    )

  cli
    .command('done <id>', 'Close a task (move to the final column)')
    .option('--comment <text>', 'Resolution comment appended before closing')
    .option('--author <author>', 'Comment author')
    .option('--archive', 'Also move the file to tasks/archive/')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const task = await service().close(id, {
          comment: options.comment,
          author: options.author,
          archive: options.archive,
        })
        if (options.json) printJson(taskJson(task))
        else
          console.log(
            `${task.frontmatter.id} → ${task.frontmatter.status}${options.archive ? ' (archived)' : ''}`,
          )
      }),
    )

  cli
    .command('next', 'Next ready task (unassigned, no open dependency)')
    .option('--sprint <id>', 'Restrict to a sprint, in sprint order')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const task = await service().next(options.sprint)
        if (options.json) {
          printJson(task ? taskJson(task) : null)
          return
        }
        if (!task) console.log('No ready task.')
        else console.log(taskLine(task))
      }),
    )

  cli.command('rm <id>', 'Delete a task').action(
    run(async (id: string) => {
      const ok = await service().remove(id)
      if (!ok) throw new Error(`Task not found: ${id}`)
      console.log('Deleted.')
    }),
  )
}
