import { registerPanel } from '../../dashboard/registry'
import StatsPanel from './StatsPanel.vue'

/** Enregistre le bloc Bilan en tête du dashboard (bande fixe). */
export default function registerStatsModule(): void {
  registerPanel({ id: 'stats', title: 'Bilan', component: StatsPanel, order: 5 })
}
