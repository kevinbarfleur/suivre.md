import { registerView } from '../shell/view-registry'
import ArchivedView from './ArchivedView.vue'

// "Archive" view: cross-cutting list (archived tasks, historical decisions,
// docs filed under archive/). Resources group, at the end of the list. No badge:
// the archive count is not carried by the Board (dedicated endpoint).
export default function registerArchiveModule(): void {
  registerView({
    id: 'archive',
    label: 'archive',
    group: 'resources',
    order: 50,
    component: ArchivedView,
    scroll: 'managed',
  })
}
