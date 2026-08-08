import { registerView } from '../shell/view-registry'
import ResourcePlaceholder from './ResourcePlaceholder.vue'

// Resource views still without a backend: milestones + drafts. Honest state,
// no simulated data. (docs + decisions now have their real module.)
export default function registerResourceModules(): void {
  registerView({
    id: 'milestones',
    label: 'milestones',
    group: 'resources',
    order: 10,
    component: ResourcePlaceholder,
    promptCmd: 'suivre milestone list',
    badge: () => 0,
  })
  registerView({
    id: 'drafts',
    label: 'drafts',
    group: 'resources',
    order: 30,
    component: ResourcePlaceholder,
    promptCmd: 'suivre draft list',
    badge: () => 0,
  })
}
