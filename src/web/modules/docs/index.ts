import { registerView } from '../shell/view-registry'
import DocsView from './DocsView.vue'

/** Enregistre la vue docs (documentation, lecture markdown). */
export default function registerDocsModule(): void {
  registerView({
    id: 'docs',
    label: 'docs',
    group: 'resources',
    order: 20,
    component: DocsView,
    promptCmd: 'suivre doc list',
  })
}
