import { ref } from 'vue'
import type { Sprint } from '../../lib/api'
import type { CreateSprintInput, SprintPatch } from '../../../domain'
import { onLive } from '../shell/live'
import * as api from '../../lib/api'

// Sprints store: list + CRUD, live on the server's `sprints` channel. The
// resolution (ids → tasks + progress) happens view-side, reactive on the board.
const sprints = ref<Sprint[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    sprints.value = await api.fetchSprints()
    // Only a successful read may mark the store loaded: otherwise a server
    // that was down reads as "no sprints yet" and never retries.
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
    onLive('sprints', () => void reload())
  }
  await reload()
}

export function useSprints() {
  return {
    sprints,
    loading,
    loaded,
    error,
    reload,
    ensureLoaded,
    create: (input: CreateSprintInput) => api.createSprint(input).then(reload),
    update: (id: string, patch: SprintPatch) => api.updateSprint(id, patch).then(reload),
    remove: (id: string) => api.deleteSprint(id).then(reload),
  }
}
