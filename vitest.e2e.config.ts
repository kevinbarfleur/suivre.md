import { defineConfig } from 'vitest/config'

// Separate from the unit suite on purpose: these tests spawn the built CLI, the
// stdio MCP entry and the HTTP server, so they need `npm run build` and they are
// slow. Keeping them apart means `npm test` stays fast enough to run on save.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    // Each test owns a temp directory and a free port, so files can run in
    // parallel; a single test's own steps stay sequential.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    clearMocks: true,
  },
})
