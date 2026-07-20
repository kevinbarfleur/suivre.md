<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../board/board.store'
import { blockedTasks, directCycles, highImpact, parentGroups } from '../../lib/aggregate'
import { meter } from '../../lib/task-meta'

// Vue « deps » : ordre d'exécution. Bloqués (bloqueurs résolus/non résolus),
// bloqueurs à fort impact, sous-tâches, et signalement des cycles directs.
const { board, allTasks } = useBoard()

const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const blocked = computed(() => blockedTasks(allTasks.value, columns.value))
const impact = computed(() => highImpact(allTasks.value))
const parents = computed(() =>
  parentGroups(allTasks.value, columns.value).map((p) => ({
    ...p,
    meter: meter(p.done, p.total, 5),
  })),
)
const cycles = computed(() => directCycles(allTasks.value))
const empty = computed(
  () => blocked.value.length === 0 && impact.value.length === 0 && parents.value.length === 0,
)
</script>

<template>
  <div class="dp">
    <div v-if="cycles.length" class="dp-cycle">
      <span class="dp-cycle-mark">!</span>
      <span>
        Cycle detected:
        <span v-for="(c, i) in cycles" :key="c.a + c.b" class="dp-cycle-pair"
          >{{ c.a }} ⇄ {{ c.b }}<span v-if="i < cycles.length - 1">, </span></span
        >
        — cannot be ordered as-is.
      </span>
    </div>

    <div v-if="empty" class="dp-empty">no dependencies — nothing to order</div>

    <div v-else class="dp-grid">
      <div class="dp-col">
        <div class="dp-label">blocked tasks</div>
        <div v-if="blocked.length === 0" class="dp-none">no blocked task</div>
        <div v-for="b in blocked" :key="b.id" class="dp-blocked">
          <div class="dp-blocked-head">
            <span class="dp-blocked-title">{{ b.title }}</span>
            <span class="dp-blocked-id">{{ b.id }}</span>
          </div>
          <div class="dp-blockers">
            <span
              v-for="bl in b.blockers"
              :key="bl.id"
              class="dp-blocker"
              :class="bl.resolved ? 'dp-blocker--ok' : 'dp-blocker--ko'"
            >
              <template v-if="bl.resolved">{{ bl.id }} ✓</template>
              <template v-else>⤳ {{ bl.id }} · {{ bl.statusLabel }}</template>
            </span>
          </div>
        </div>
      </div>

      <div class="dp-col">
        <div class="dp-label">high-impact blockers</div>
        <div v-if="impact.length === 0" class="dp-none">no blocker</div>
        <div v-else class="dp-impact">
          <div v-for="im in impact" :key="im.id" class="dp-impact-row">
            <span class="dp-impact-id">{{ im.id }}</span>
            <span class="dp-impact-title">{{ im.title }}</span>
            <span class="dp-impact-n">unblocks {{ im.count }}</span>
          </div>
        </div>

        <div class="dp-label dp-label--mt">subtasks</div>
        <div v-if="parents.length === 0" class="dp-none">no subtask</div>
        <div v-for="p in parents" :key="p.id" class="dp-parent">
          <div class="dp-parent-head">
            <span class="dp-parent-title">{{ p.title }}</span>
            <span class="dp-parent-prog">
              <span class="dp-meter"
                ><span class="dp-meter-on">{{ p.meter.filled }}</span
                >{{ p.meter.empty }}</span
              >
              {{ p.done }}/{{ p.total }}
            </span>
          </div>
          <div class="dp-child" v-for="ch in p.children" :key="ch.id">
            <span class="dp-child-mark">
              <span v-if="ch.done" class="dp-child-done">✓</span>
              <span v-else class="dp-child-todo">·</span>
            </span>
            <span class="dp-child-title">{{ ch.title }}</span>
            <span class="dp-child-status">{{ ch.statusLabel }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dp {
  min-width: 0;
}
.dp-cycle {
  display: flex;
  gap: 9px;
  border: 1px solid var(--sv-warn-line);
  background: var(--sv-warn-bg);
  border-radius: 9px;
  padding: 11px 14px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--sv-warn);
}
.dp-cycle-pair {
  color: var(--sv-warn);
}
.dp-empty {
  border: 1px dashed var(--sv-line);
  border-radius: 8px;
  padding: 28px;
  text-align: center;
  color: var(--sv-fg-dim);
  font-size: 12px;
}
.dp-grid {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.dp-col {
  flex: 1;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dp-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
}
.dp-label--mt {
  margin-top: 8px;
}
.dp-none {
  font-size: 11.5px;
  color: var(--sv-fg-dim);
}
.dp-blocked {
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--sv-raised);
}
.dp-blocked-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 9px;
}
.dp-blocked-title {
  font-size: 12.5px;
  color: var(--sv-fg);
}
.dp-blocked-id {
  font-size: 10px;
  color: var(--sv-fg-dim);
}
.dp-blockers {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 10.5px;
}
.dp-blocker {
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.dp-blocker--ok {
  color: var(--sv-fg-dim);
  border: 1px solid var(--sv-line-soft);
  text-decoration: line-through;
}
.dp-blocker--ko {
  color: var(--sv-blocked);
  border: 1px solid var(--sv-danger-line);
}
.dp-impact {
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  overflow: hidden;
}
.dp-impact-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sv-line-soft);
  font-size: 12px;
}
.dp-impact-row:last-child {
  border-bottom: 0;
}
.dp-impact-id {
  color: var(--sv-fg-dim);
  width: 72px;
  flex: 0 0 auto;
}
.dp-impact-title {
  flex: 1;
  min-width: 0;
  color: var(--sv-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dp-impact-n {
  color: var(--sv-fg-mid);
  white-space: nowrap;
}
.dp-parent {
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 12px 14px;
}
.dp-parent-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 9px;
}
.dp-parent-title {
  font-size: 12.5px;
  color: var(--sv-fg);
}
.dp-parent-prog {
  font-size: 10px;
  color: var(--sv-fg-mid);
  font-variant-numeric: tabular-nums;
}
.dp-meter {
  letter-spacing: -0.05em;
}
.dp-meter-on {
  color: var(--sv-fg);
}
.dp-child {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 11px;
  color: var(--sv-fg-mid);
  margin-top: 6px;
}
.dp-child-mark {
  width: 14px;
  flex: 0 0 auto;
  text-align: center;
}
.dp-child-done {
  color: var(--sv-ok);
}
.dp-child-todo {
  color: var(--sv-line-strong);
}
.dp-child-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dp-child-status {
  color: var(--sv-fg-dim);
  white-space: nowrap;
}
</style>
