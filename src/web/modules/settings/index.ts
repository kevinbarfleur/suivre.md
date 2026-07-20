import { registerView } from '../shell/view-registry'
import SettingsView from './SettingsView.vue'

/** Enregistre la page Préférences (groupe « system » : hors nav tâches/ressources,
 *  atteinte par le lien en bas du rail). */
export default function registerSettingsModule(): void {
  registerView({
    id: 'settings',
    label: 'settings',
    group: 'system',
    order: 10,
    component: SettingsView,
    promptCmd: 'suivre config',
  })
}
