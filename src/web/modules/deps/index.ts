import type { Board } from '../../../domain'
import { registerView } from '../shell/view-registry'
import { blockedTasks } from '../../lib/aggregate'
import DepsView from './DepsView.vue'

function blockedCount(board: Board): number {
  const tasks = board.columns.flatMap((c) => c.tasks).concat(board.orphans)
  return blockedTasks(
    tasks,
    board.columns.map((c) => c.column),
  ).length
}

/** Enregistre la vue dépendances (ordre d'exécution). */
export default function registerDepsModule(): void {
  registerView({
    id: 'deps',
    label: 'deps',
    group: 'tasks',
    order: 40,
    component: DepsView,
    taskChrome: true,
    promptCmd: 'suivre deps',
    badge: blockedCount,
  })
}
