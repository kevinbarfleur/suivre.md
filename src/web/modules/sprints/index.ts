import { registerView } from '../shell/view-registry'
import SprintsView from './SprintsView.vue'

// Sprints view: ordered checklists of tasks to ship. Its own header/progress, so
// no global task chrome. Managed scroll (master-detail panes scroll on their own).
export default function registerSprintsModule(): void {
  registerView({
    id: 'sprints',
    label: 'sprints',
    group: 'tasks',
    order: 25,
    component: SprintsView,
    scroll: 'managed',
    promptCmd: 'suivre sprint list',
  })
}
