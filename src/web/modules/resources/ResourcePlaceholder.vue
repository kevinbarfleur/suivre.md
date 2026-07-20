<script setup lang="ts">
import { computed } from 'vue'
import { useView } from '../shell/view.store'

// État honnête des vues ressources : leur backend (stores milestones / docs /
// drafts / decisions) est le prochain chantier. On ne simule pas de données.
const { view } = useView()

const INFO: Record<string, { title: string; blurb: string }> = {
  milestones: {
    title: 'Milestones',
    blurb: 'Regrouper les efforts en jalons et suivre leur avancement.',
  },
  docs: { title: 'Docs', blurb: 'Documentation markdown du projet, rendue en lecture.' },
  drafts: { title: 'Drafts', blurb: 'Idées non promues — hors du board tant qu’elles ne sont pas promues.' },
  decisions: { title: 'Décisions', blurb: 'Registre ADR : contexte, décision, conséquences, statut.' },
}
const info = computed(() => INFO[view.value] ?? { title: view.value, blurb: '' })
</script>

<template>
  <div class="rp">
    <div class="rp-title"><span class="rp-hash">#</span> {{ info.title }}</div>
    <div class="rp-blurb">{{ info.blurb }}</div>
    <div class="rp-note">
      <span class="rp-mark">$</span> backend à venir — domaine <span class="rp-code">{{ view }}</span>
      (store <span class="rp-code">.md</span> + endpoints + MCP). Prochain chantier.
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
