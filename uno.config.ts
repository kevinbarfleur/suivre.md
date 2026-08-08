import { defineConfig } from 'unocss'

// No preset on purpose: not a single utility class is used in src/web (the look
// comes from the design tokens in src/web/styles/), and presetWind3's preflight
// was shipping ~6 KB of unused reset. Keeping the plugin only keeps the
// `virtual:uno.css` import in main.ts resolvable — it now emits nothing.
export default defineConfig({
  presets: [],
})
