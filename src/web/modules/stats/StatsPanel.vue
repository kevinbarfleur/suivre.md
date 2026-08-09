<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useBoard } from '../board/board.store'
import { finalColumnId } from '../../lib/aggregate'
import { meter } from '../../lib/task-meta'

// Summary: progress at a glance. ASCII bar + counts per column
// + salient indicators (high priority / debt).
const { board, allTasks, ensureLoaded } = useBoard()
onMounted(ensureLoaded)

const cols = computed(() => board.value?.columns ?? [])
const total = computed(() => allTasks.value.length)
const doneId = computed(() => finalColumnId(cols.value.map((c) => c.column)))
const done = computed(() => cols.value.find((c) => c.column.id === doneId.value)?.tasks.length ?? 0)
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const bar = computed(() => meter(done.value, total.value || 1, 25, '█', '░'))

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
      <span class="bl-name">summary</span>
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
  padding: 16px 20px;
}
.bl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
/* An eyebrow, not a heading: this block is only numbers, so the numbers have
   to be the largest thing in it. */
.bl-name {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
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
  margin-bottom: 12px;
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
/* The gap is a margin, not a text node: whitespace between an interpolation
   and its label does not survive the template compiler reliably, and `Backlog11`
   is what that looks like. */
.bl-col-n {
  margin-left: 0.5ch;
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
  border-radius: var(--sv-r-badge);
  color: var(--sv-fg-mid);
  font-variant-numeric: tabular-nums;
}
.bl-chip-n {
  color: inherit;
}
/* No flat --sv-accent here: that fill is reserved for maximum priority. */
.bl-chip--prio .bl-chip-n {
  color: var(--sv-fg);
}
.bl-chip--debt {
  border-color: var(--sv-warn-line);
  background: var(--sv-warn-bg-2);
  color: var(--sv-warn);
}
</style>
