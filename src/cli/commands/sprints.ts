import type { CAC } from 'cac'
import { sprintStatusSchema } from '../../domain'
import { compact, parseEnum, printJson, requireBoard, run, sprintJson, toArray } from '../context'

/**
 * Sprint commands: the "map" of an effort (wayfinding). A sprint references
 * existing tasks in order; its body carries the effort's notes.
 */
export function registerSprintCommands(cli: CAC): void {
  cli
    .command('sprint create <title>', 'Create a sprint (ordered checklist of task ids)')
    .option('--goal <goal>', 'One-line goal')
    .option('--item <taskId>', 'Task id, in order (repeatable)')
    .option('--body <markdown>', 'Sprint body (notes, decisions, open questions)')
    .option('--json', 'JSON output')
    .action(
      run(async (title: string, options) => {
        const svc = await requireBoard()
        const sprint = await svc.createSprint({
          title,
          goal: options.goal || undefined,
          items: toArray(options.item),
          body: options.body,
        })
        if (options.json) printJson(sprintJson(sprint))
        else console.log(`${sprint.frontmatter.id}  ${sprint.frontmatter.title}`)
      }),
    )

  cli
    .command('sprint list', 'List sprints')
    .option('--json', 'JSON output')
    .action(
      run(async (options) => {
        const sprints = await (await requireBoard()).listSprints()
        if (options.json) {
          printJson(sprints.map(sprintJson))
          return
        }
        if (sprints.length === 0) {
          console.log('No sprints.')
          return
        }
        for (const sprint of sprints) {
          const fm = sprint.frontmatter
          console.log(`${fm.id}  [${fm.status}]  ${fm.title}  (${fm.items.length} tasks)`)
        }
      }),
    )

  cli
    .command('sprint get <id>', 'Show a sprint with per-task progress')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const progress = await (await requireBoard()).sprintProgress(id)
        if (!progress) throw new Error(`Sprint not found: ${id}`)
        const { sprint, resolved } = progress
        if (options.json) {
          printJson({
            ...sprintJson(sprint),
            progress: { done: resolved.done, total: resolved.total },
          })
          return
        }
        const fm = sprint.frontmatter
        console.log(`${fm.id}  [${fm.status}]  ${fm.title}${fm.goal ? `\ngoal: ${fm.goal}` : ''}`)
        for (const step of resolved.steps) {
          const mark = step.done ? 'x' : ' '
          console.log(`  [${mark}] ${step.id}  ${step.task?.frontmatter.title ?? '(missing task)'}`)
        }
        if (sprint.body.trim()) console.log(`\n${sprint.body.trim()}`)
      }),
    )

  cli
    .command('sprint add <id> [...taskIds]', 'Append tasks to a sprint')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, taskIds: string[], options) => {
        const svc = await requireBoard()
        const sprint = await svc.getSprint(id)
        if (!sprint) throw new Error(`Sprint not found: ${id}`)
        const items = [
          ...sprint.frontmatter.items,
          ...taskIds.filter((t) => !sprint.frontmatter.items.includes(t)),
        ]
        const next = await svc.editSprint(id, { items })
        if (options.json) printJson(sprintJson(next))
        else console.log(`${id}  ${next.frontmatter.items.length} tasks`)
      }),
    )

  cli
    .command('sprint edit <id>', 'Edit a sprint (title / goal / status / body)')
    .option('--title <title>', 'New title')
    .option('--goal <goal>', 'New goal')
    .option('--status <status>', 'active | done')
    .option('--body <markdown>', 'Replace the body (notes, decisions)')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const svc = await requireBoard()
        const sprint = await svc.editSprint(
          id,
          compact({
            title: options.title,
            goal: options.goal,
            status: options.status
              ? parseEnum('--status', sprintStatusSchema.options, options.status)
              : undefined,
            body: options.body,
          }),
        )
        if (options.json) printJson(sprintJson(sprint))
        else console.log(`${id}  updated`)
      }),
    )

  cli
    .command('sprint done <id>', 'Mark a sprint done')
    .option('--json', 'JSON output')
    .action(
      run(async (id: string, options) => {
        const sprint = await (await requireBoard()).editSprint(id, { status: 'done' })
        if (options.json) printJson(sprintJson(sprint))
        else console.log(`${id} → done`)
      }),
    )
}
