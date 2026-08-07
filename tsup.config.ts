import { defineConfig } from 'tsup'

// Bundles node : les chemins de sortie DOIVENT correspondre à `bin` et `exports`
// de package.json (dist/cli/index.js, dist/mcp/index.js, dist/domain/index.js).
// Le bundling résout les imports sans extension (le source n'est pas ESM-node
// strict) — c'est lui qui rend le paquet exécutable hors tsx.
export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'mcp/index': 'src/mcp/index.ts',
    'domain/index': 'src/domain/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  splitting: true,
  // dist/web appartient au build vite — ne jamais le nettoyer d'ici.
  clean: false,
})
