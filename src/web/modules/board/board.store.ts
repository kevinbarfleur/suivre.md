import { ref } from 'vue'
import type { Board, Task } from '../../../domain'
import * as api from '../../lib/api'

// Store singleton (module-level refs). Board + sélection + actions + live SSE.
// Toute mutation écrit côté serveur → le file-watcher pousse un event SSE →
// reload : le board reste juste quel que soit l'auteur (web, CLI ou MCP).
const board = ref<Board | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const selected = ref<Task | null>(null)
let liveStarted = false

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    board.value = await api.fetchBoard()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function ensureLoaded(): Promise<void> {
  if (board.value === null && !loading.value) await reload()
}

function startLive(): void {
  if (liveStarted || typeof EventSource === 'undefined') return
  liveStarted = true
  const source = new EventSource('/api/events')
  source.addEventListener('board', () => {
    void reload()
  })
}

export function useBoard() {
  return {
    board,
    loading,
    error,
    selected,
    reload,
    ensureLoaded,
    startLive,
    openTask: (task: Task) => {
      selected.value = task
    },
    closeTask: () => {
      selected.value = null
    },
    create: (input: api.CreateInput) => api.createTask(input).then(reload),
    update: (id: string, patch: api.UpdateInput) => api.updateTask(id, patch).then(reload),
    move: (id: string, body: api.MoveInput) => api.moveTask(id, body).then(reload),
    remove: (id: string) => api.deleteTask(id).then(reload),
  }
}
