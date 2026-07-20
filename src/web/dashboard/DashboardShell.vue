<script setup lang="ts">
import { panels } from './registry'

const list = panels()
</script>

<template>
  <div class="sv-shell">
    <component :is="panel.component" v-for="panel in list" :key="panel.id" />
  </div>
</template>

<style scoped>
.sv-shell {
  height: 100%;
  min-height: 0;
}
</style>
