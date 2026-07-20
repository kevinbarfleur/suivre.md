<script setup lang="ts">
import type { BoardColumn } from '../../../domain'
import TaskCard from './TaskCard.vue'

defineProps<{ col: BoardColumn }>()
</script>

<template>
  <section class="sv-col">
    <header class="sv-col-head">
      <span class="sv-col-label mono">{{ col.column.label }}</span>
      <span class="sv-col-count mono">{{ col.tasks.length }}</span>
    </header>
    <div class="sv-col-list">
      <TaskCard v-for="task in col.tasks" :key="task.frontmatter.id" :task="task" />
      <p v-if="col.tasks.length === 0" class="sv-col-empty">Vide</p>
    </div>
  </section>
</template>

<style scoped>
.sv-col {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-col);
  backdrop-filter: var(--sv-glass-blur);
  -webkit-backdrop-filter: var(--sv-glass-blur);
}
.sv-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}
.sv-col-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-ink-2);
}
.sv-col-count {
  font-size: 11px;
  color: var(--sv-ink-3);
  font-variant-numeric: tabular-nums;
}
.sv-col-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 12px 14px;
  overflow-y: auto;
}
.sv-col-empty {
  margin: 0;
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: var(--sv-ink-3);
}
</style>
