<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBoard } from '../board/board.store'

const { board, ensureLoaded } = useBoard()
onMounted(ensureLoaded)

const cols = computed(() => board.value?.columns ?? [])
const allTasks = computed(() =>
  board.value ? board.value.columns.flatMap((c) => c.tasks).concat(board.value.orphans) : [],
)
const total = computed(() => allTasks.value.length)
const done = computed(() => cols.value.find((c) => c.column.id === 'done')?.tasks.length ?? 0)
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const toTest = computed(() => cols.value.find((c) => c.column.id === 'test')?.tasks.length ?? 0)
const priority = computed(
  () =>
    allTasks.value.filter(
      (t) => t.frontmatter.priority === 'urgent' || t.frontmatter.priority === 'high',
    ).length,
)
const debt = computed(() => allTasks.value.filter((t) => t.frontmatter.labels.includes('dette')).length)
</script>

<template>
  <section v-if="board" class="sv-stats">
    <div class="sv-stats-head">
      <h1 class="sv-stats-title">{{ board.config.name }}</h1>
      <span class="sv-stats-sub mono">{{ total }} tâches · {{ pct }}% terminé</span>
    </div>
    <div class="sv-bar"><div class="sv-bar-fill" :style="{ width: pct + '%' }"></div></div>
    <div class="sv-stats-row">
      <div class="sv-metrics">
        <div v-for="c in cols" :key="c.column.id" class="sv-metric">
          <span class="sv-metric-n mono">{{ c.tasks.length }}</span>
          <span class="sv-metric-l mono">{{ c.column.label }}</span>
        </div>
      </div>
      <div class="sv-chips">
        <span class="sv-chip" data-tone="test">{{ toTest }} à tester</span>
        <span class="sv-chip" data-tone="prio">{{ priority }} prioritaires</span>
        <span class="sv-chip" data-tone="debt">{{ debt }} dette</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sv-stats {
  margin: 0 24px 14px;
  padding: 18px 20px;
  background: var(--sv-surface);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-col);
  box-shadow: var(--sv-shadow-card);
  backdrop-filter: var(--sv-glass-blur);
  -webkit-backdrop-filter: var(--sv-glass-blur);
}
.sv-stats-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.sv-stats-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sv-ink);
}
.sv-stats-sub {
  font-size: 11.5px;
  color: var(--sv-ink-2);
  font-variant-numeric: tabular-nums;
}
.sv-bar {
  margin: 13px 0 15px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.sv-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--sv-done);
  transition: width 0.4s ease;
}
.sv-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}
.sv-metrics {
  display: flex;
  gap: 22px;
}
.sv-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sv-metric-n {
  font-size: 20px;
  font-weight: 700;
  color: var(--sv-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.sv-metric-l {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sv-ink-3);
}
.sv-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sv-chip {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--sv-ink-2);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--sv-border);
}
.sv-chip[data-tone='test'] {
  color: var(--sv-high);
  background: color-mix(in srgb, var(--sv-high) 12%, transparent);
  border-color: color-mix(in srgb, var(--sv-high) 26%, transparent);
}
.sv-chip[data-tone='prio'] {
  color: var(--sv-urgent);
  background: color-mix(in srgb, var(--sv-urgent) 12%, transparent);
  border-color: color-mix(in srgb, var(--sv-urgent) 26%, transparent);
}
.sv-chip[data-tone='debt'] {
  color: var(--sv-blocked);
  background: color-mix(in srgb, var(--sv-blocked) 12%, transparent);
  border-color: color-mix(in srgb, var(--sv-blocked) 26%, transparent);
}
</style>
