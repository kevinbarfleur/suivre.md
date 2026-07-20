import { computed, ref } from 'vue'
import * as api from '../../lib/api'
import type { GlobalPreferences, ProjectPreferences, Theme } from '../../lib/api'

// Store de préférences, singleton. Deux niveaux : global (machine) et projet.
// Le thème est appliqué sur <html data-theme> ; un cache localStorage évite le
// flash au boot (cf. le script inline dans index.html).
const THEME_KEY = 'suivre.theme'

const global = ref<GlobalPreferences>({ theme: 'dark', defaultView: 'board' })
const project = ref<ProjectPreferences>({ defaultView: null })
const loaded = ref(false)

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme)
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme)
}

async function load(): Promise<void> {
  const prefs = await api.fetchPreferences()
  global.value = prefs.global
  project.value = prefs.project
  applyTheme(global.value.theme)
  loaded.value = true
}

const effectiveDefaultView = computed(
  () => project.value.defaultView ?? global.value.defaultView ?? 'board',
)

export function usePreferences() {
  return {
    global,
    project,
    loaded,
    effectiveDefaultView,
    load,
    async setTheme(theme: Theme): Promise<void> {
      applyTheme(theme)
      global.value = await api.patchGlobalPreferences({ theme })
    },
    async setGlobalDefaultView(view: string): Promise<void> {
      global.value = await api.patchGlobalPreferences({ defaultView: view })
    },
    async setProjectDefaultView(view: string | null): Promise<void> {
      project.value = await api.patchProjectPreferences({ defaultView: view })
    },
  }
}
