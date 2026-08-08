import { ref } from 'vue'
import type { ArchivedEntry } from '../../lib/api'
import { onLive } from '../shell/live'
import * as api from '../../lib/api'

// Archive store: unified list (archived tasks + historical decisions
// + docs filed under archive/), read-only. Live on every collection it spans.
const entries = ref<ArchivedEntry[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    entries.value = await api.fetchArchive()
    // Only a successful read may mark the store loaded: otherwise a server
    // that was down reads as "no archives" and never retries.
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

let live = false
async function ensureLoaded(): Promise<void> {
  if (loaded.value || loading.value) return
  if (!live) {
    live = true
    for (const channel of ['tasks', 'decisions', 'docs'] as const)
      onLive(channel, () => void reload())
  }
  await reload()
}

export function useArchive() {
  return { entries, loading, loaded, error, reload, ensureLoaded }
}
