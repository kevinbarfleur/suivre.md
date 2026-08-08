import type { Board } from '../../../domain'
import { registerView } from '../shell/view-registry'
import ListView from './ListView.vue'

function totalTasks(board: Board): number {
  return board.columns.reduce((n, c) => n + c.tasks.length, 0) + board.orphans.length
}

/** Registers the list view (sortable table). */
export default function registerListModule(): void {
  registerView({
    id: 'list',
    label: 'list',
    group: 'tasks',
    order: 20,
    component: ListView,
    taskChrome: true,
    scroll: 'managed',
    promptCmd: 'suivre task list',
    badge: totalTasks,
  })
}
