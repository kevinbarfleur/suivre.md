import { ref } from 'vue'
import type { CreateDocInput, Doc, DocPatch } from '../../../domain'
import * as api from '../../lib/api'

// Store des docs. Liste + CRUD, rechargé après mutation.
const docs = ref<Doc[]>([])
const loading = ref(false)
const loaded = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    docs.value = await api.fetchDocs()
  } finally {
    loading.value = false
    loaded.value = true
  }
}

async function ensureLoaded(): Promise<void> {
  if (!loaded.value && !loading.value) await reload()
}

export function useDocs() {
  return {
    docs,
    loading,
    loaded,
    reload,
    ensureLoaded,
    create: (input: CreateDocInput) => api.createDoc(input).then(reload),
    update: (id: string, patch: DocPatch) => api.updateDoc(id, patch).then(reload),
    remove: (id: string) => api.deleteDoc(id).then(reload),
  }
}
