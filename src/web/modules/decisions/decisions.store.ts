import { ref } from 'vue'
import type { CreateDecisionInput, Decision, DecisionPatch } from '../../../domain'
import { onLive } from '../shell/live'
import * as api from '../../lib/api'

// Decisions store (ADR). List + CRUD, live on the server's `decisions` channel.
const decisions = ref<Decision[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    decisions.value = await api.fetchDecisions()
    // Only a successful read may mark the store loaded: otherwise a server
    // that was down reads as "the ADR log is empty" and never retries.
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
    onLive('decisions', () => void reload())
  }
  await reload()
}

export function useDecisions() {
  return {
    decisions,
    loading,
    loaded,
    error,
    reload,
    ensureLoaded,
    create: (input: CreateDecisionInput) => api.createDecision(input).then(reload),
    update: (id: string, patch: DecisionPatch) => api.updateDecision(id, patch).then(reload),
    remove: (id: string) => api.deleteDecision(id).then(reload),
  }
}
