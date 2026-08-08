import { registerView } from '../shell/view-registry'
import DecisionsView from './DecisionsView.vue'

/** Registers the decisions view (ADR registry). */
export default function registerDecisionsModule(): void {
  registerView({
    id: 'decisions',
    label: 'decisions',
    group: 'resources',
    order: 40,
    component: DecisionsView,
    scroll: 'managed',
    promptCmd: 'suivre decision list',
  })
}
