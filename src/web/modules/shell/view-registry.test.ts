import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewDef } from './view-registry'

// The registry is a module-level singleton: every test starts from a fresh one.
async function freshRegistry() {
  vi.resetModules()
  return import('./view-registry')
}

const view = (over: Partial<ViewDef> & { id: string }): ViewDef => ({
  label: over.id,
  group: 'tasks',
  order: 10,
  component: {},
  ...over,
})

describe('view registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns undefined for an id nothing registered', async () => {
    const { registerView, viewById } = await freshRegistry()
    registerView(view({ id: 'board' }))

    // The blank-page bug: MainPane must be able to see the miss and fall back.
    expect(viewById('roadmap')).toBeUndefined()
    expect(viewById('board')).toBeDefined()
  })

  it('lists a group in `order`, ignoring registration order', async () => {
    const { registerView, views } = await freshRegistry()
    registerView(view({ id: 'deps', order: 40 }))
    registerView(view({ id: 'board', order: 10 }))
    registerView(view({ id: 'docs', order: 20, group: 'resources' }))

    expect(views('tasks').map((v) => v.id)).toEqual(['board', 'deps'])
    expect(views().map((v) => v.id)).toEqual(['board', 'docs', 'deps'])
  })

  it('accepts a view with no promptCmd', async () => {
    const { registerView, viewById } = await freshRegistry()
    registerView(view({ id: 'overview' }))

    // No CLI command opens the overview: the prompt line must not invent one.
    expect(viewById('overview')?.promptCmd).toBeUndefined()
  })

  it('keeps the first registration for a duplicate id', async () => {
    const { registerView, views } = await freshRegistry()
    registerView(view({ id: 'board', label: 'board' }))
    registerView(view({ id: 'board', label: 'other' }))

    expect(views('tasks')).toHaveLength(1)
    expect(views('tasks')[0]?.label).toBe('board')
  })
})
