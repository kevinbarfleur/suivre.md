import type { Component } from 'vue'

/**
 * Registre de panneaux du dashboard. Cœur de la modularité : chaque bloc
 * (bilan, board, filtres…) s'enregistre ici. Réordonner = changer `order`.
 * Ajouter = enregistrer un module. Retirer = ne plus l'enregistrer. Aucun
 * couplage entre blocs.
 */
export interface PanelDef {
  id: string
  title: string
  component: Component
  order: number
  /** Le panneau occupe la hauteur restante (le board) plutôt qu'une bande fixe. */
  grow?: boolean
}

const registry: PanelDef[] = []

export function registerPanel(def: PanelDef): void {
  if (!registry.some((panel) => panel.id === def.id)) registry.push(def)
}

export function panels(): PanelDef[] {
  return [...registry].sort((a, b) => a.order - b.order)
}
