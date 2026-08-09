<script setup lang="ts">
import { computed } from 'vue'
import { useView } from '../shell/view.store'
import StateBlock from '../../components/StateBlock.vue'

// Honest state for the two resource views that still have no backend.
// Docs and decisions DO have one and render their own view — they are not here.
const { view } = useView()

interface Suggestion {
  cmd: string
  why: string
}
interface Placeholder {
  message: string
  domain: string
  meanwhile: readonly Suggestion[]
}

const INFO: Record<string, Placeholder> = {
  milestones: {
    message: 'Group work into milestones and track their progress.',
    domain: 'milestone',
    meanwhile: [
      {
        cmd: 'suivre sprint create "…"',
        why: 'a sprint already does the work of a short milestone',
      },
      {
        cmd: 'suivre edit <id> --add-label milestone/v1',
        why: 'or a label, to group tasks by hand',
      },
    ],
  },
  drafts: {
    message: 'Unpromoted ideas — off the board until they are worth a task.',
    domain: 'draft',
    meanwhile: [
      { cmd: 'suivre add "…" --label draft', why: 'a labelled task the toolbar can filter out' },
      { cmd: 'suivre doc create "…"', why: 'or a doc, when the idea outgrows a task' },
    ],
  },
}

const info = computed<Placeholder>(
  () => INFO[view.value] ?? { message: '', domain: view.value, meanwhile: [] },
)
</script>

<template>
  <div class="rp">
    <div class="rp-lead">
      <StateBlock :label="view" :message="info.message">
        <template #hint>
          No backend yet. The <span class="rp-code">{{ info.domain }}</span> domain —
          <span class="rp-code">.md</span> store, endpoints, MCP — is the next step.
        </template>
      </StateBlock>
    </div>

    <div v-if="info.meanwhile.length" class="rp-next">
      <div class="rp-l">meanwhile</div>
      <div v-for="s in info.meanwhile" :key="s.cmd" class="rp-cmd">
        <span class="rp-mark">$</span> {{ s.cmd }} <span class="rp-why">— {{ s.why }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The prose keeps the narrow measure; the suggestions are shell lines and are
   only allowed to wrap where a terminal would wrap them. */
.rp {
  max-width: 84ch;
}
.rp-lead {
  max-width: 56ch;
}
.rp-code {
  background: var(--sv-code-bg);
  border: 1px solid var(--sv-line-soft);
  border-radius: var(--sv-r-badge);
  padding: 0 5px;
  color: var(--sv-fg-card);
  font-size: 0.92em;
}
.rp-next {
  margin-top: 22px;
}
.rp-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 10px;
}
.rp-cmd {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--sv-fg-mid);
}
.rp-mark {
  color: var(--sv-prompt);
}
.rp-why {
  color: var(--sv-fg-dim);
}
</style>
