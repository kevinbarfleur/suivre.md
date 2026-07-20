import { registerPanel } from '../../dashboard/registry'
import BoardPanel from './BoardPanel.vue'

/** Enregistre le module board (occupe la hauteur restante). */
export default function registerBoardModule(): void {
  registerPanel({ id: 'board', title: 'Board', component: BoardPanel, order: 10, grow: true })
}
