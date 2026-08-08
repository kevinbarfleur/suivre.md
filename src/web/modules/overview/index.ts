import { registerView } from '../shell/view-registry'
import OverviewView from './OverviewView.vue'

/** Registers the overview view (expanded summary, read-only). */
export default function registerOverviewModule(): void {
  registerView({
    id: 'overview',
    label: 'overview',
    group: 'tasks',
    order: 30,
    component: OverviewView,
    promptCmd: 'suivre overview',
  })
}
