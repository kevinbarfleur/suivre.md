import { defineConfig, presetWind3 } from 'unocss'

// Utilitaires de layout uniquement. Le look (glass, couleurs, radii) vient des
// tokens du design system dans src/web/styles/tokens.css.
export default defineConfig({
  presets: [presetWind3()],
})
