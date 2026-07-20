import type { Component } from 'vue'
import type { Board } from '../../../domain'

// Registre de VUES (évolution du registre de panneaux). Cœur de la modularité :
// une vue s'enregistre ici avec son groupe de nav, son composant, sa commande
// d'invite et un badge optionnel. Ajouter une vue = enregistrer un module.
export type ViewGroup = 'tasks' | 'resources' | 'system'

export interface ViewDef {
  id: string
  label: string
  group: ViewGroup
  order: number
  component: Component
  /** Affiche le bandeau tâches (Bilan + toolbar filtres) au-dessus de la vue. */
  taskChrome?: boolean
  /** Commande affichée dans la ligne d'invite. */
  promptCmd: string
  /** Compteur affiché dans le rail de navigation. */
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
