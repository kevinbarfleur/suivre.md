<script setup lang="ts">
import { panels } from './registry'

const list = panels()
</script>

<template>
  <div class="sv-shell">
    <div
      v-for="panel in list"
      :key="panel.id"
      class="sv-panel"
      :class="{ 'sv-panel--grow': panel.grow }"
    >
      <component :is="panel.component" />
    </div>
  </div>
</template>

<style scoped>
.sv-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sv-panel {
  flex: none;
}
.sv-panel--grow {
  flex: 1;
  min-height: 0;
}
</style>
