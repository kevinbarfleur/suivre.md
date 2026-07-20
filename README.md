# suivre.md

Gestionnaire de backlog **markdown-native** : les tâches sont des fichiers `.md`
versionnés dans ton repo. Board kanban web (dark glassmorphism), CLI, et serveur
MCP — pensé pour être piloté par un agent autant que par un humain, et réinstallable
dans n'importe quel projet.

> Statut : **en construction**. Le cœur (domaine + storage) est posé et testé.
> Les surfaces (server / CLI / MCP) et le web arrivent (voir `ARCHITECTURE.md`).

## Idée

- Une tâche = un fichier markdown avec frontmatter YAML. Pas de base de données,
  pas de service à héberger. Git est l'historique.
- Un cœur métier pur, trois surfaces minces par-dessus : **HTTP** (le board web),
  **MCP** (l'agent pilote le backlog en direct), **CLI** (l'humain au terminal).
- Le board reflète en direct les changements de fichiers (SSE) — l'agent écrit,
  tu vois bouger.

## Stack

Vue 3 + Vite + UnoCSS + Ark UI (web) · Hono (serveur) · `@modelcontextprotocol/sdk`
(MCP) · zod + yaml (contrat) · fractional-indexing (rang) · TypeScript strict, Vitest.

## Développement

```bash
npm install
npm test          # Vitest (domaine + storage)
npm run typecheck # tsc strict
npm run dev       # web + API (à venir)
```

## Structure

```
src/
  domain/    cœur métier pur (types, markdown, rang, ops) — 0 I/O
  storage/   seul contact disque (écriture atomique, watch)
  server/    API HTTP + SSE + sert la SPA        (à venir)
  mcp/       serveur MCP                          (à venir)
  cli/       commandes terminal (bin `suivre`)    (à venir)
  web/       SPA Vue modulaire (board kanban)     (à venir)
```

Voir `ARCHITECTURE.md` (conception) et `CONTRACT.md` (format sur disque).

## Licence

MIT — Kevin Barfleur.
