<script setup lang="ts">
import { onMounted } from 'vue'
import NavRail from './modules/shell/NavRail.vue'
import MainPane from './modules/shell/MainPane.vue'
import { useBoard } from './modules/board/board.store'
import { useView } from './modules/shell/view.store'
import { usePreferences } from './modules/settings/prefs.store'

const { ensureLoaded, startLive } = useBoard()
const { setView, hasExplicitHash } = useView()
const { load: loadPreferences, effectiveDefaultView } = usePreferences()

onMounted(async () => {
  void ensureLoaded()
  startLive()
  await loadPreferences()
  // Sans deep-link explicite, on ouvre sur la vue par défaut préférée.
  if (!hasExplicitHash()) setView(effectiveDefaultView.value)
})
</script>

<template>
  <div class="sv-app">
    <NavRail />
    <MainPane />
  </div>
</template>

<style scoped>
.sv-app {
  height: 100vh;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  background: var(--sv-surface);
}
@media (max-width: 860px) {
  .sv-app {
    height: auto;
    min-height: 100vh;
    flex-direction: column;
    overflow: visible;
  }
}
</style>
