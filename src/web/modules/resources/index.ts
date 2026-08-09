import { registerView } from '../shell/view-registry'
import ResourcePlaceholder from './ResourcePlaceholder.vue'

// Resource views still without a backend: milestones + drafts. Honest state,
// no simulated data — and no badge, which would read as a real count of zero.
export default function registerResourceModules(): void {
  registerView({
    id: 'milestones',
    label: 'milestones',
    group: 'resources',
    order: 80,
    component: ResourcePlaceholder,
  })
  registerView({
    id: 'drafts',
    label: 'drafts',
    group: 'resources',
    order: 90,
    component: ResourcePlaceholder,
  })
}
