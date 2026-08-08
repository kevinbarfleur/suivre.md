import { ref } from 'vue'
import type { ArchivedEntry } from '../../lib/api'
import * as api from '../../lib/api'

// Archive store: unified list (archived tasks + historical decisions
// + docs filed under archive/), read-only. Reloaded on demand.
const entries = ref<ArchivedEntry[]>([])
const loading = ref(false)
const loaded = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    entries.value = await api.fetchArchive()
  } finally {
    loading.value = false
    loaded.value = true
  }
}

async function ensureLoaded(): Promise<void> {
  if (!loaded.value && !loading.value) await reload()
}

export function useArchive() {
  return { entries, loading, loaded, reload, ensureLoaded }
}
