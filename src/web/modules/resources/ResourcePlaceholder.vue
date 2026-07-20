<script setup lang="ts">
import { computed } from 'vue'
import { useView } from '../shell/view.store'

// État honnête des vues ressources : leur backend (stores milestones / docs /
// drafts / decisions) est le prochain chantier. On ne simule pas de données.
const { view } = useView()

const INFO: Record<string, { title: string; blurb: string }> = {
  milestones: {
    title: 'Milestones',
    blurb: 'Group work into milestones and track their progress.',
  },
  docs: { title: 'Docs', blurb: 'Project markdown documentation, rendered for reading.' },
  drafts: { title: 'Drafts', blurb: 'Unpromoted ideas — off the board until promoted.' },
  decisions: { title: 'Decisions', blurb: 'ADR log: context, decision, consequences, status.' },
}
const info = computed(() => INFO[view.value] ?? { title: view.value, blurb: '' })
</script>

<template>
  <div class="rp">
    <div class="rp-title"><span class="rp-hash">#</span> {{ info.title }}</div>
    <div class="rp-blurb">{{ info.blurb }}</div>
    <div class="rp-note">
      <span class="rp-mark">$</span> backend coming — <span class="rp-code">{{ view }}</span> domain
      (<span class="rp-code">.md</span> store + endpoints + MCP). Next up.
    </div>
  </div>
</template>

<style scoped>
.rp {
  border: 1px dashed var(--sv-line);
  border-radius: 10px;
  padding: 34px 30px;
  max-width: 560px;
}
.rp-title {
  font-size: 15px;
  color: var(--sv-fg);
  margin-bottom: 8px;
}
.rp-hash {
  color: var(--sv-fg-dim);
}
.rp-blurb {
  font-size: 12.5px;
  color: var(--sv-fg-mid);
  line-height: 1.6;
  margin-bottom: 18px;
}
.rp-note {
  font-size: 11.5px;
  color: var(--sv-fg-dim);
  line-height: 1.7;
}
.rp-mark {
  color: var(--sv-prompt);
}
.rp-code {
  color: var(--sv-fg-mid);
}
</style>
