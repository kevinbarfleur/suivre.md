<script setup lang="ts">
import { onMounted } from 'vue'
import DashboardShell from './dashboard/DashboardShell.vue'
import { useBoard } from './modules/board/board.store'

const { ensureLoaded, startLive } = useBoard()
onMounted(() => {
  void ensureLoaded()
  startLive()
})
</script>

<template>
  <div class="sv-wrap">
    <header class="sv-app-head">
      <span class="sv-dot"></span>
      <span class="sv-eyebrow mono">suivre.md</span>
    </header>
    <main class="sv-app-main">
      <DashboardShell />
    </main>
  </div>
</template>

<style scoped>
.sv-wrap {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.sv-app-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px 14px;
}
.sv-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sv-high);
  box-shadow: 0 0 10px rgba(233, 184, 114, 0.7);
}
.sv-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-ink-3);
}
.sv-app-main {
  flex: 1;
  min-height: 0;
}
</style>
