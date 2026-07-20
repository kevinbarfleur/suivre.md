import { ref } from 'vue'

// Vue active + item ciblé, deep-linkables par `#<vue>/<item>` (ex.
// `#decisions/decision-001`, `#board/task-012`). Un lien direct ouvre l'app sur
// l'item : c'est ce qui permet de pointer quelqu'un vers une décision/tâche précise.
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
    /** Un hash explicite est présent (deep-link) → ne pas surcharger par la pref. */
    hasExplicitHash: (): boolean => parseHash().view != null,
    setView: (id: string, target: string | null = null) => {
      view.value = id
      item.value = target
      if (typeof window !== 'undefined') window.history.replaceState(null, '', hashFor(id, target))
    },
    /** Lien direct vers un item (à partager). */
    linkFor: (id: string, target?: string | null): string => hashFor(id, target ?? null),
  }
}
