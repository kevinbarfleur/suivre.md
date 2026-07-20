import { registerView } from '../shell/view-registry'
import ArchivedView from './ArchivedView.vue'

// Vue « archives » : liste transverse (tâches archivées, décisions historiques,
// docs rangés dans archive/). Groupe ressources, en fin de liste. Pas de badge :
// le compte d'archives n'est pas porté par le Board (endpoint dédié).
export default function registerArchiveModule(): void {
  registerView({
    id: 'archive',
    label: 'archives',
    group: 'resources',
    order: 50,
    component: ArchivedView,
    promptCmd: 'suivre archive list',
  })
}
