import type { CAC } from 'cac'
import { prioritySchema } from '../../domain'
import type { TaskPatch } from '../../domain'
import {
  compact,
  parseEnum,
  printJson,
  printTask,
  run,
  service,
  taskJson,
  taskLine,
  toArray,
  warnInvalid,
} from '../context'

/** Task commands: the core of the tracker contract (create/read/list/edit/comment/close/next). */
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
          priority: options.priority
            ? parseEnum('--priority', prioritySchema.options, options.priority)
            : undefined,
          labels: toArray(options.label),
          assignee: options.assignee || undefined,
          parent: options.parent || undefined,
          body: options.body,
          depends: toArray(options.depends),
        })
        if (options.json) printJson(taskJson(task))
        else console.log(`${task.frontmatter.id}  ${task.frontmatter.title}`)
      }),
    )

  cli
    .command('list', 'List tasks (board order)')
    .option('--status <status>', 'Filter by column')
    .option('--label <label>', 'Filter by label (repeatable: a task must carry all of them)')
    .option('--assignee <assignee>', 'Filter by assignee')
    .option('--ready', 'Only ready tasks: not done, unassigned, no open dependency')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const labels = toArray(options.label) ?? []
        const { tasks, invalid } = await service().readTasks({
          status: options.status,
          label: labels[0],
          assignee: options.assignee,
          ready: options.ready,
        })
        // The domain filter carries a single label; repeating the flag is an AND.
        const matched = tasks.filter((task) =>
          labels.every((label) => task.frontmatter.labels.includes(label)),
        )
        warnInvalid(invalid)
        if (options.json) {
          printJson(matched.map(taskJson))
          return
        }
        if (matched.length === 0) {
          console.log('No tasks.')
          return
        }
        for (const task of matched) console.log(taskLine(task))
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
    .option('--priority <priority>', 'low | medium | high | urgent (empty string to clear)')
    .option('--assignee <assignee>', 'Assign (empty string to unassign)')
    .option('--parent <id>', 'Parent task id (empty string to clear)')
    .option('--depends <id>', 'Replace blocking ids (repeatable, empty string to clear)')
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
          priority: options.priority
            ? parseEnum('--priority', prioritySchema.options, options.priority)
            : undefined,
          assignee: options.assignee || undefined,
          parent: options.parent || undefined,
          depends: toArray(options.depends),
          labels,
          body: options.body,
        })
        // An empty value is an explicit CLEAR: `--assignee ""` releases a ticket.
        // The key has to survive compaction — the service reads key presence.
        if (options.assignee === '') patch.assignee = undefined
        if (options.parent === '') patch.parent = undefined
        if (options.priority === '') patch.priority = undefined
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

  cli
    .command('rm <id>', 'Delete a task')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const ok = await service().remove(id)
        if (!ok) throw new Error(`Task not found: ${id}`)
        if (options.json) printJson({ id, deleted: true })
        else console.log('Deleted.')
      }),
    )
}
