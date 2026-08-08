import { describe, expect, it, vi } from 'vitest'
import type { Doc } from '../../../domain'

// The four collection stores (docs, decisions, sprints, archive) share this
// contract; docs stands for all of them.
const liveHandlers = new Map<string, () => void>()

async function freshStore(fetchDocs: () => Promise<Doc[]>) {
  vi.resetModules()
  liveHandlers.clear()
  vi.doMock('../../lib/api', () => ({
    fetchDocs,
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
  }))
  vi.doMock('../shell/live', () => ({
    onLive: (channel: string, handler: () => void) => liveHandlers.set(channel, handler),
  }))
  const { useDocs } = await import('./docs.store')
  return useDocs()
}

const doc = (id: string): Doc => ({
  frontmatter: { id, title: id, tags: [], updated: '2026-01-01' },
  body: '',
  fileName: `${id}.md`,
})

describe('docs store', () => {
  it('marks itself loaded and clears the error on a successful read', async () => {
    const store = await freshStore(async () => [doc('doc-001')])
    await store.ensureLoaded()

    expect(store.loaded.value).toBe(true)
    expect(store.error.value).toBeNull()
    expect(store.docs.value).toHaveLength(1)
  })

  it('leaves `loaded` false on a failed read, so the view never says "empty"', async () => {
    const store = await freshStore(async () => {
      throw new Error('Request failed (500)')
    })
    await store.ensureLoaded()

    expect(store.loaded.value).toBe(false)
    expect(store.error.value).toBe('Request failed (500)')
    expect(store.docs.value).toEqual([])
  })

  it('retries on the next ensureLoaded after a failure', async () => {
    let attempt = 0
    const store = await freshStore(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('Request failed (500)')
      return [doc('doc-001')]
    })

    await store.ensureLoaded()
    expect(attempt).toBe(1)

    // A restarted server has to be picked up when the view is opened again.
    await store.ensureLoaded()
    expect(attempt).toBe(2)
    expect(store.loaded.value).toBe(true)
    expect(store.error.value).toBeNull()
  })

  it('does not re-read once loaded', async () => {
    let attempt = 0
    const store = await freshStore(async () => {
      attempt += 1
      return []
    })

    await store.ensureLoaded()
    await store.ensureLoaded()
    expect(attempt).toBe(1)
  })

  it('reloads when the server reports a change on the docs channel', async () => {
    let attempt = 0
    const store = await freshStore(async () => {
      attempt += 1
      return [doc(`doc-00${attempt}`)]
    })
    await store.ensureLoaded()

    const push = liveHandlers.get('docs')
    expect(push).toBeDefined()

    push?.()
    await vi.waitFor(() => expect(store.docs.value[0]?.frontmatter.id).toBe('doc-002'))
  })
})
