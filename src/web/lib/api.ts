import type { Board } from '../../domain'

/** Client HTTP minimal du board (proxyfié vers le serveur en dev). */
export async function fetchBoard(): Promise<Board> {
  const res = await fetch('/api/board')
  if (!res.ok) throw new Error(`board indisponible (${res.status})`)
  return (await res.json()) as Board
}
