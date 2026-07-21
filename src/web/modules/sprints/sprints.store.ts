import { ref } from 'vue'
import type { Sprint } from '../../lib/api'
import type { CreateSprintInput, SprintPatch } from '../../../domain'
import * as api from '../../lib/api'

// Store des sprints : liste + CRUD, rechargé après mutation. La résolution
// (ids → tâches + progression) se fait côté vue, réactive sur le board.
const sprints = ref<Sprint[]>([])
const loading = ref(false)
const loaded = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    sprints.value = await api.fetchSprints()
  } finally {
    loading.value = false
    loaded.value = true
  }
}

async function ensureLoaded(): Promise<void> {
  if (!loaded.value && !loading.value) await reload()
}

export function useSprints() {
  return {
    sprints,
    loading,
    loaded,
    reload,
    ensureLoaded,
    create: (input: CreateSprintInput) => api.createSprint(input).then(reload),
    update: (id: string, patch: SprintPatch) => api.updateSprint(id, patch).then(reload),
    remove: (id: string) => api.deleteSprint(id).then(reload),
  }
}
