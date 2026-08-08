import { ref } from 'vue'

// Active view + targeted item, deep-linkable via `#<view>/<item>` (e.g.
// `#decisions/decision-001`, `#board/task-012`). A direct link opens the app on
// the item: this is what lets you point someone to a specific decision/task.
function parseHash(): { view: string | null; item: string | null } {
  if (typeof window === 'undefined') return { view: null, item: null }
  const raw = window.location.hash.replace(/^#\/?/, '').trim()
  if (!raw) return { view: null, item: null }
  const slash = raw.indexOf('/')
  if (slash === -1) return { view: raw || null, item: null }
  return { view: raw.slice(0, slash) || null, item: raw.slice(slash + 1) || null }
}

function hashFor(view: string, item: string | null): string {
  return item ? `#${view}/${item}` : `#${view}`
}

const initial = parseHash()
const view = ref<string>(initial.view ?? 'board')
const item = ref<string | null>(initial.item)

export function useView() {
  return {
    view,
    item,
    /** An explicit hash is present (deep-link) → don't override with the pref. */
    hasExplicitHash: (): boolean => parseHash().view != null,
    setView: (id: string, target: string | null = null) => {
      view.value = id
      item.value = target
      if (typeof window !== 'undefined') window.history.replaceState(null, '', hashFor(id, target))
    },
    /** Direct link to an item (shareable). */
    linkFor: (id: string, target?: string | null): string => hashFor(id, target ?? null),
  }
}
