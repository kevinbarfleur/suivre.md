<script setup lang="ts">
import { computed } from 'vue'
import type { Priority } from '../../../domain'
import { useBoard } from '../board/board.store'
import { useFilter } from './filter.store'
import FilterMenu, { type FilterOption } from './FilterMenu.vue'

const { board } = useBoard()
const { text, status, priority, label, assignee, labels, assignees, activeCount, resultCount } =
  useFilter()

const PRIORITIES: FilterOption[] = [
  { value: 'urgent', label: 'urgent' },
  { value: 'high', label: 'high' },
  { value: 'medium', label: 'medium' },
  { value: 'low', label: 'low' },
]
const statusOptions = computed<FilterOption[]>(
  () => board.value?.columns.map((c) => ({ value: c.column.id, label: c.column.label })) ?? [],
)
const labelOptions = computed<FilterOption[]>(() => labels.value.map((l) => ({ value: l, label: l })))
const assigneeOptions = computed<FilterOption[]>(() =>
  assignees.value.map((a) => ({ value: a, label: a })),
)

// Casts dans le script (jamais dans une expression de template).
function setPriority(value: string | null): void {
  priority.value = value as Priority | null
}
</script>

<template>
  <div class="tb">
    <div class="tb-search">
      <span class="tb-slash">/</span>
      <input v-model="text" class="tb-input" type="text" placeholder="grep tâches…" />
    </div>
    <FilterMenu label="--status" :model-value="status" :options="statusOptions" @update:model-value="status = $event" />
    <FilterMenu
      label="--priority"
      :model-value="priority"
      :options="PRIORITIES"
      @update:model-value="setPriority"
    />
    <FilterMenu label="--label" :model-value="label" :options="labelOptions" @update:model-value="label = $event" />
    <FilterMenu
      label="--assignee"
      :model-value="assignee"
      :options="assigneeOptions"
      @update:model-value="assignee = $event"
    />
    <span class="tb-count">
      {{ resultCount }} results<template v-if="activeCount"> · {{ activeCount }} filter{{ activeCount > 1 ? 's' : '' }}</template>
    </span>
  </div>
</template>

<style scoped>
.tb {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
}
.tb-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 250px;
  max-width: 100%;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 8px 11px;
  transition: border-color 0.15s ease;
}
.tb-search:focus-within {
  border-color: var(--sv-line-strong);
}
.tb-slash {
  color: var(--sv-fg-dim);
}
.tb-input {
  border: 0;
  background: transparent;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--sv-fg);
}
.tb-count {
  margin-left: auto;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
