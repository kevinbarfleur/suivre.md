import type { Board } from '../../../domain'
import { registerView } from '../shell/view-registry'
import BoardPanel from './BoardPanel.vue'

function totalTasks(board: Board): number {
  return board.columns.reduce((n, c) => n + c.tasks.length, 0) + board.orphans.length
}

/** Enregistre la vue board (kanban), première vue tâches. */
export default function registerBoardModule(): void {
  registerView({
    id: 'board',
    label: 'board',
    group: 'tasks',
    order: 10,
    component: BoardPanel,
    taskChrome: true,
    scroll: 'managed',
    promptCmd: 'suivre board',
    badge: totalTasks,
  })
}
