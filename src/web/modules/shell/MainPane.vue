<script setup lang="ts">
import { computed, watch } from 'vue'
import { useBoard } from '../board/board.store'
import { useView } from './view.store'
import { viewById } from './view-registry'
import { slug } from '../../lib/task-meta'
import StatsPanel from '../stats/StatsPanel.vue'
import Toolbar from '../filter/Toolbar.vue'
import TaskDetailDialog from '../board/TaskDetailDialog.vue'

// Panneau principal : cadre FIXE (ligne d'invite + Bilan + toolbar pour les vues
// tâches) au-dessus d'une zone de contenu BORNÉE qui ne dépasse jamais l'écran.
// C'est le contenu qui scrolle, pas la page — `auto` scrolle la vue entière,
// `managed` laisse la vue gérer son scroll interne (master-détail, board, liste).
const { board, allTasks, loading, error, ensureLoaded, selected, openTask } = useBoard()
const { view, item } = useView()

const def = computed(() => viewById(view.value))
const host = computed(() => slug(board.value?.config.name ?? 'backlog'))
const promptCmd = computed(() => def.value?.promptCmd ?? 'suivre')
const showChrome = computed(() => def.value?.taskChrome === true && board.value != null)
const isManaged = computed(() => def.value?.scroll === 'managed')

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
      ><span class="main-prompt-sep">:</span><span class="main-prompt-path">~/.suivre</span
      ><span class="main-prompt-cmd">$ {{ promptCmd }}</span>
    </div>

    <div v-if="error" class="main-state main-state--err">
      <span class="main-err">ERR: {{ error }}</span>
      <button class="main-retry" type="button" @click="ensureLoaded">retry</button>
    </div>
    <div v-else-if="loading && !board" class="main-state">loading…</div>
    <div v-else-if="!board" class="main-state">Backlog not initialized.</div>
    <template v-else>
      <template v-if="showChrome">
        <div class="main-chrome-bilan"><StatsPanel /></div>
        <div class="main-chrome-tb"><Toolbar /></div>
      </template>
      <div class="main-body" :class="isManaged ? 'main-body--managed' : 'main-body--auto'">
        <component :is="def?.component" />
      </div>
    </template>

    <TaskDetailDialog v-if="selected" :task="selected" />
  </main>
</template>

<style scoped>
.main {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Pas de padding bas ici : la zone de contenu porte sa propre marge basse. */
  padding: 26px 30px 0;
}
.main-prompt {
  flex: 0 0 auto;
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
  flex: 0 0 auto;
  margin-bottom: 16px;
}
.main-chrome-tb {
  flex: 0 0 auto;
  margin-bottom: 22px;
}
/* Zone de contenu bornée : occupe le reste de l'écran, marge basse toujours. */
.main-body {
  flex: 1;
  min-height: 0;
  padding-bottom: 30px;
}
/* Contenu simple : la zone elle-même scrolle. */
.main-body--auto {
  overflow-y: auto;
  overflow-x: hidden;
}
/* Contenu géré : la vue remplit la zone et gère son propre scroll interne. */
.main-body--managed {
  overflow: hidden;
  display: flex;
}
.main-body--managed > * {
  flex: 1;
  min-width: 0;
}
.main-state {
  flex: 0 0 auto;
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
/* Étroit : on rend la page à son flux naturel (le shell repasse en scroll page). */
@media (max-width: 860px) {
  .main {
    height: auto;
    overflow: visible;
    padding-bottom: 30px;
  }
  .main-body {
    padding-bottom: 0;
  }
  .main-body--auto,
  .main-body--managed {
    overflow: visible;
    display: block;
  }
}
</style>
