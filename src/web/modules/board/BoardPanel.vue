<script setup lang="ts">
import { onMounted } from 'vue'
import { useBoard } from './board.store'
import Column from './Column.vue'

const { board, loading, error, load } = useBoard()
onMounted(load)
</script>

<template>
  <section class="sv-board">
    <div v-if="error" class="sv-state sv-state--err">{{ error }}</div>
    <div v-else-if="loading && !board" class="sv-state">Chargement…</div>
    <div v-else-if="board" class="sv-cols">
      <Column v-for="col in board.columns" :key="col.column.id" :col="col" />
    </div>
    <div v-else class="sv-state">Backlog non initialisé.</div>
  </section>
</template>

<style scoped>
.sv-board {
  height: 100%;
  padding: 4px 24px 24px;
}
.sv-cols {
  display: flex;
  gap: 14px;
  height: 100%;
  overflow-x: auto;
  align-items: flex-start;
  padding-bottom: 8px;
}
.sv-state {
  padding: 24px;
  font-size: 14px;
  color: var(--sv-ink-2);
}
.sv-state--err {
  color: #ffb4a8;
}
</style>
