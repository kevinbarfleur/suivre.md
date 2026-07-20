import { ref } from 'vue'
import type { Board } from '../../../domain'
import { fetchBoard } from '../../lib/api'

// Store singleton (module-level refs). Passera Pinia si un 2e module doit
// partager cet état — la surface publique (useBoard) resterait identique.
const board = ref<Board | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

export function useBoard() {
  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      board.value = await fetchBoard()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }
  return { board, loading, error, load }
}
