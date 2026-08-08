import type { Component } from 'vue'
import type { Board } from '../../../domain'

// View registry (evolution of the panel registry). Core of the modularity:
// a view registers itself here with its nav group, component, prompt
// command, and an optional badge. Adding a view = registering a module.
export type ViewGroup = 'tasks' | 'resources' | 'system'

export interface ViewDef {
  id: string
  label: string
  group: ViewGroup
  order: number
  component: Component
  /** Shows the task chrome (Summary + filter toolbar) above the view. */
  taskChrome?: boolean
  /**
   * Who owns the scroll within the MainPane's bounded area.
   * - `auto` (default): the MainPane scrolls the whole view (simple content).
   * - `managed`: the view fills the area and manages its own internal scroll
   *   (fixed header/footer, independent master-detail panes, board columns).
   */
  scroll?: 'auto' | 'managed'
  /**
   * Command shown on the prompt line. Omitted when no CLI command opens this
   * view: the line is read as copyable shell, so it may only carry real ones.
   */
  promptCmd?: string
  /** Counter shown in the navigation rail. */
  badge?: (board: Board) => string | number
}

const registry: ViewDef[] = []

export function registerView(def: ViewDef): void {
  if (!registry.some((v) => v.id === def.id)) registry.push(def)
}

export function views(group?: ViewGroup): ViewDef[] {
  return registry.filter((v) => !group || v.group === group).sort((a, b) => a.order - b.order)
}

export function viewById(id: string): ViewDef | undefined {
  return registry.find((v) => v.id === id)
}
