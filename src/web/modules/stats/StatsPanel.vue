<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBoard } from '../board/board.store'
import { meter } from '../../lib/task-meta'

// Bilan : état d'avancement d'un coup d'œil. Barre ASCII + comptes par colonne
// + indicateurs saillants (à tester / prioritaires / dette).
const { board, allTasks, ensureLoaded } = useBoard()
onMounted(ensureLoaded)

const cols = computed(() => board.value?.columns ?? [])
const total = computed(() => allTasks.value.length)
const done = computed(() => cols.value.find((c) => c.column.id === 'done')?.tasks.length ?? 0)
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const bar = computed(() => meter(done.value, total.value || 1, 25, '█', '░'))

const toTest = computed(() => cols.value.find((c) => c.column.id === 'test')?.tasks.length ?? 0)
const prio = computed(
  () =>
    allTasks.value.filter(
      (t) => t.frontmatter.priority === 'urgent' || t.frontmatter.priority === 'high',
    ).length,
)
const debt = computed(
  () => allTasks.value.filter((t) => t.frontmatter.labels.includes('debt')).length,
)
</script>

<template>
  <section v-if="board" class="bl">
    <div class="bl-head">
      <span class="bl-name">Summary</span>
      <span class="bl-sub">{{ done }}/{{ total }} · {{ pct }}%</span>
    </div>
    <div class="bl-bar">
      [<span class="bl-bar-on">{{ bar.filled }}</span
      >{{ bar.empty }}] {{ pct }}%
    </div>
    <div class="bl-foot">
      <span v-for="c in cols" :key="c.column.id" class="bl-col"
        >{{ c.column.label }}<span class="bl-col-n"> {{ c.tasks.length }}</span></span
      >
      <span class="bl-chips">
        <span class="bl-chip"
          >to_test=<span class="bl-chip-n">{{ toTest }}</span></span
        >
        <span class="bl-chip bl-chip--prio"
          >prio=<span class="bl-chip-n">{{ prio }}</span></span
        >
        <span class="bl-chip bl-chip--debt"
          >debt=<span class="bl-chip-n">{{ debt }}</span></span
        >
      </span>
    </div>
  </section>
</template>

<style scoped>
.bl {
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 18px 20px;
}
.bl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.bl-name {
  font-size: 16px;
  color: var(--sv-fg);
}
.bl-sub {
  font-size: 12px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.bl-bar {
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--sv-fg-mid);
  margin-bottom: 14px;
  white-space: nowrap;
  overflow-x: auto;
  font-variant-numeric: tabular-nums;
}
.bl-bar-on {
  color: var(--sv-fg);
}
.bl-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--sv-fg-mid);
  border-top: 1px solid var(--sv-line);
  padding-top: 12px;
}
.bl-col-n {
  color: var(--sv-fg);
  font-variant-numeric: tabular-nums;
}
.bl-chips {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.bl-chip {
  border: 1px solid var(--sv-line-strong);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--sv-fg-mid);
  font-variant-numeric: tabular-nums;
}
.bl-chip-n {
  color: inherit;
}
.bl-chip--prio {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
  border-color: var(--sv-accent);
}
.bl-chip--debt {
  border-color: var(--sv-warn-line);
  color: var(--sv-warn);
}
</style>
