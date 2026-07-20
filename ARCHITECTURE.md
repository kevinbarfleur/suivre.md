# Architecture — suivre.md

Document de conception. Objectif : une base **modulaire, maintenable, réutilisable**,
où ajouter/déplacer/réordonner un bloc du dashboard est trivial et sans couplage.

## Principe directeur : un cœur, plusieurs surfaces

Toute la logique métier vit dans `domain` (pur, sans I/O). Les surfaces
(`server`, `mcp`, `cli`) sont des **adaptateurs minces** qui appellent le domaine
via `storage`. Aucune logique dupliquée entre les surfaces — un seul endroit à
faire évoluer.

```
                ┌─────────── server (HTTP + SSE) ──┐
domain (pur) ── storage (disque) ── mcp (agent) ───┼── mêmes opérations
                └─────────── cli (terminal) ───────┘
```

## Couches

- **`domain/`** — types + schémas zod (source de vérité du modèle), parse/serialize
  markdown, rang lexicographique (`fractional-indexing`), opérations pures
  (`createTask`, `editTask`, `moveTask`, `buildBoard`). 100 % testé, zéro I/O.
- **`storage/`** — seul composant qui touche le disque. **Écriture atomique**
  (temp + `rename`) car un board a des writers concurrents (web + CLI + MCP) :
  jamais un fichier à moitié écrit. Watch (chokidar) → SSE pour le live.
- **`server/`** — Hono. REST (`/api/board`, `/api/task/...`) + SSE (`/api/events`) +
  sert la SPA buildée. Adaptateur mince.
- **`mcp/`** — expose les opérations en tools MCP (`board_list`, `task_create`,
  `task_move`, `task_edit`, …) sur le même domaine. L'agent ne parse jamais de fichier.
- **`cli/`** — bin `suivre` (`init`, `task create/list/move`, `board`).
- **`web/`** — SPA Vue modulaire (voir ci-dessous).

## Modularité du dashboard (exigence centrale)

- **Modules co-localisés** : `web/src/modules/<feature>/` contient son UI, son store,
  son api, ses types. Un module ne connaît pas les autres — tout passe par le store.
- **Registre de panneaux** : un tableau ordonné `{ id, title, component (lazy), size,
  order, visible, conditions }`. Le `DashboardShell` le lit et rend les blocs.
  - Réordonner = changer `order`. Ajouter = déposer un dossier + une ligne.
    Retirer = supprimer le dossier + la ligne. **Zéro couplage transversal.**
- Layout réarrangeable par l'utilisateur (ordre/visibilité persistés).
- Modules du MVP : `board`, `task-detail`, `filters`, `stats`.

## Modèle de données

Défini dans `CONTRACT.md`. Résumé : `backlog/config.yml` (colonnes/statuts) +
`backlog/tasks/<id>-<slug>.md` (frontmatter YAML + corps). Le statut d'une tâche =
l'id d'une colonne. Rang = clé fractionnaire (insertion sans réindex).

## Distribution

**Un seul package npm `suivre.md`** (pas un monorepo à N packages publiés). Modulaire
à l'intérieur, il embarque le web buildé et expose bin CLI + serveur + MCP.
`npx suivre.md init` dans n'importe quel repo. Repo dédié → package + GitHub
réinstallable partout.

## Design

Système « dark glassmorphism » interne (repris de `agents/tools/DESIGN-SYSTEM.html`) :
fond 3 couches, hiérarchie par opacité de blanc, recette glass unique, préfixe `sv-`.
**Monochrome par défaut**, mini-palette sémantique réservée à ce qui doit se repérer
(priorité, statuts done/blocked) — contraste vérifié sur le fond réel.

## Phasage

0. Scaffold + tooling + tokens design. **(fait)**
1. `domain` + `storage` + tests. **(fait — 14 tests verts)**
2. `server` (REST+SSE) + `cli` + `mcp` — prouver le cœur sans UI.
3. `web` : `DashboardShell` + registre + module `board` (kanban dnd + live) + `task-detail`.
4. Modules `filters` + `stats`, polish design.
5. Doc + packaging npm + enregistrer le pattern kanban dans le design system.

## Décisions verrouillées

- Stack : Vue 3 + Vite + UnoCSS + Ark UI ; Hono ; TS strict ; Vitest.
- Écriture atomique obligatoire (corrige le point faible de question-inbox).
- Un seul package publiable, repo dédié.
- Board kanban dès le MVP (drag-and-drop via Pragmatic DnD).
- Couleur : monochrome + mini-palette sémantique validée à l'œil.
