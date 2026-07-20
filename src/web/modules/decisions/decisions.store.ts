import { ref } from 'vue'
import type { CreateDecisionInput, Decision, DecisionPatch } from '../../../domain'
import * as api from '../../lib/api'

// Store des décisions (ADR). Liste + CRUD, rechargé après mutation.
const decisions = ref<Decision[]>([])
const loading = ref(false)
const loaded = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    decisions.value = await api.fetchDecisions()
  } finally {
    loading.value = false
    loaded.value = true
  }
}

async function ensureLoaded(): Promise<void> {
  if (!loaded.value && !loading.value) await reload()
}

export function useDecisions() {
  return {
    decisions,
    loading,
    loaded,
    reload,
    ensureLoaded,
    create: (input: CreateDecisionInput) => api.createDecision(input).then(reload),
    update: (id: string, patch: DecisionPatch) => api.updateDecision(id, patch).then(reload),
    remove: (id: string) => api.deleteDecision(id).then(reload),
  }
}
