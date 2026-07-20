import { registerView } from '../shell/view-registry'
import OverviewView from './OverviewView.vue'

/** Enregistre la vue overview (synthèse développée, lecture seule). */
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
