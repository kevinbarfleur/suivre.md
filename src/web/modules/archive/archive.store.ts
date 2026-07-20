import { ref } from 'vue'
import type { ArchivedEntry } from '../../lib/api'
import * as api from '../../lib/api'

// Store des archives : liste unifiée (tâches archivées + décisions historiques
// + docs rangés dans archive/), lecture seule. Rechargée à la demande.
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
