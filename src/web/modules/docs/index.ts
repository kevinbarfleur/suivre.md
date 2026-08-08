import { registerView } from '../shell/view-registry'
import DocsView from './DocsView.vue'

/** Registers the docs view (documentation, markdown reading). */
export default function registerDocsModule(): void {
  registerView({
    id: 'docs',
    label: 'docs',
    group: 'resources',
    order: 20,
    component: DocsView,
    scroll: 'managed',
    promptCmd: 'suivre doc list',
  })
}
