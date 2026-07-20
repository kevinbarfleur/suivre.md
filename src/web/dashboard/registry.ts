import type { Component } from 'vue'

/**
 * Registre de panneaux du dashboard. C'est le cœur de la modularité : chaque
 * bloc (board, filtres, stats…) s'enregistre ici. Réordonner = changer `order`.
 * Ajouter = enregistrer un module. Retirer = ne plus l'enregistrer. Aucun
 * couplage entre blocs.
 */
export interface PanelDef {
  id: string
  title: string
  component: Component
  order: number
}

const registry: PanelDef[] = []

export function registerPanel(def: PanelDef): void {
  if (!registry.some((panel) => panel.id === def.id)) registry.push(def)
}

export function panels(): PanelDef[] {
  return [...registry].sort((a, b) => a.order - b.order)
}
