import { registerView } from '../shell/view-registry'
import SettingsView from './SettingsView.vue'

/** Registers the Preferences page (group "system": outside tasks/resources nav,
 *  reached via the link at the bottom of the rail). */
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
