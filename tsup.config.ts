import { defineConfig } from 'tsup'

// Node bundles: output paths MUST match package.json's `bin` and `exports`
// (dist/cli/index.js, dist/mcp/index.js, dist/domain/index.js).
// Bundling resolves extensionless imports (the source is not strict ESM-node) —
// that is what makes the package runnable without tsx.
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
  // dist/web belongs to the vite build — never clean it from here.
  clean: false,
})
