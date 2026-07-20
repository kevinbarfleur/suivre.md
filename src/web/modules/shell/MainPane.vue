<script setup lang="ts">
import { computed, watch } from 'vue'
import { useBoard } from '../board/board.store'
import { useView } from './view.store'
import { viewById } from './view-registry'
import { slug } from '../../lib/task-meta'
import StatsPanel from '../stats/StatsPanel.vue'
import Toolbar from '../filter/Toolbar.vue'
import TaskDetailDialog from '../board/TaskDetailDialog.vue'

// Panneau principal : ligne d'invite + (pour les vues tâches) Bilan + toolbar +
// la vue active. La modale de fiche est globale (ouverte quelle que soit la vue).
const { board, allTasks, loading, error, ensureLoaded, selected, openTask } = useBoard()
const { view, item } = useView()

const def = computed(() => viewById(view.value))
const host = computed(() => slug(board.value?.config.name ?? 'backlog'))
const promptCmd = computed(() => def.value?.promptCmd ?? 'suivre')
const showChrome = computed(() => def.value?.taskChrome === true && board.value != null)

// Deep-link vers une tâche : `#board/task-012` ouvre directement sa fiche.
const TASK_VIEWS = new Set(['board', 'list', 'deps', 'overview'])
watch(
  [view, item, board],
  () => {
    if (!board.value || !item.value || !TASK_VIEWS.has(view.value)) return
    const task = allTasks.value.find((t) => t.frontmatter.id === item.value)
    if (task && selected.value?.frontmatter.id !== task.frontmatter.id) openTask(task)
  },
  { immediate: true },
)
</script>

<template>
  <main class="main">
    <div class="main-prompt">
      <span class="main-prompt-user">kevin@{{ host }}</span
      ><span class="main-prompt-sep">:</span
      ><span class="main-prompt-path">~/.suivre</span
      ><span class="main-prompt-cmd">$ {{ promptCmd }}</span>
    </div>

    <div v-if="error" class="main-state main-state--err">
      <span class="main-err">ERR: {{ error }}</span>
      <button class="main-retry" type="button" @click="ensureLoaded">retry</button>
    </div>
    <div v-else-if="loading && !board" class="main-state">loading…</div>
    <div v-else-if="!board" class="main-state">Backlog non initialisé.</div>
    <template v-else>
      <template v-if="showChrome">
        <div class="main-chrome-bilan"><StatsPanel /></div>
        <div class="main-chrome-tb"><Toolbar /></div>
      </template>
      <component :is="def?.component" />
    </template>

    <TaskDetailDialog v-if="selected" :task="selected" />
  </main>
</template>

<style scoped>
.main {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 26px 30px 40px;
  overflow-y: auto;
  overflow-x: hidden;
}
.main-prompt {
  font-size: 12.5px;
  color: var(--sv-fg-dim);
  margin-bottom: 20px;
}
.main-prompt-user {
  color: var(--sv-prompt);
}
.main-prompt-sep {
  color: var(--sv-fg-dim);
}
.main-prompt-path {
  color: var(--sv-fg-mid);
}
.main-prompt-cmd {
  color: var(--sv-fg-dim);
}
.main-chrome-bilan {
  margin-bottom: 16px;
}
.main-chrome-tb {
  margin-bottom: 22px;
}
.main-state {
  padding: 22px;
  font-size: 13px;
  color: var(--sv-fg-dim);
}
.main-state--err {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--sv-danger-line);
  border-radius: 8px;
  background: var(--sv-danger-bg);
}
.main-err {
  color: var(--sv-danger);
}
.main-retry {
  color: var(--sv-fg-mid);
  border: 1px solid var(--sv-line);
  background: transparent;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.main-retry:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
</style>
