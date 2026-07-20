import { registerView } from '../shell/view-registry'
import ResourcePlaceholder from './ResourcePlaceholder.vue'

// Vues ressources encore sans backend : milestones + drafts. État honnête,
// pas de données simulées. (docs + décisions ont leur vrai module désormais.)
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
