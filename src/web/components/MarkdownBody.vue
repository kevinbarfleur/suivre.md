<script setup lang="ts">
import { computed } from 'vue'
import { toBlocks } from '../lib/markdown-blocks'

// Rendu markdown terminal (titres, paragraphes, listes, cases, code). Partagé
// par le lecteur de docs, le détail de décision et les archives.
// NB préfixe `mkd-` (et non `md-`) : `md` est le breakpoint UnoCSS, donc
// `md-h1` était interprété comme l'utility `md:h-1` (height 0.25rem) et
// écrasait la hauteur des titres. `mkd-*` ne matche aucune utility.
const props = defineProps<{ source: string }>()
const blocks = computed(() => toBlocks(props.source))
</script>

<template>
  <div class="mkd">
    <template v-for="(b, i) in blocks" :key="i">
      <div v-if="b.type === 'h1'" class="mkd-h1">{{ b.text }}</div>
      <div v-else-if="b.type === 'h2'" class="mkd-h2"><span class="mkd-hash">##</span> {{ b.text }}</div>
      <div v-else-if="b.type === 'h3'" class="mkd-h3"><span class="mkd-hash">###</span> {{ b.text }}</div>
      <pre v-else-if="b.type === 'code'" class="mkd-code">{{ b.text }}</pre>
      <div v-else-if="b.type === 'check'" class="mkd-check">
        <span v-if="b.done" class="mkd-check-on">[x]</span><span v-else class="mkd-check-off">[ ]</span>
        <span :class="{ 'mkd-check-done': b.done }">{{ b.text }}</span>
      </div>
      <div v-else-if="b.type === 'li'" class="mkd-li"><span class="mkd-bullet">–</span><span>{{ b.text }}</span></div>
      <div v-else-if="b.type === 'hr'" class="mkd-hr"></div>
      <p v-else class="mkd-p">{{ b.text }}</p>
    </template>
  </div>
</template>

<style scoped>
.mkd {
  font-size: 13px;
  line-height: 1.65;
  color: var(--sv-fg-body);
}
.mkd-h1 {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--sv-bright);
  margin: 4px 0 14px;
}
.mkd-h2 {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--sv-fg);
  margin: 22px 0 9px;
}
.mkd-h3 {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--sv-fg-card);
  margin: 16px 0 7px;
}
.mkd-hash {
  color: var(--sv-fg-dim);
}
.mkd-p {
  margin: 0 0 12px;
}
.mkd-li {
  display: flex;
  gap: 9px;
  margin: 0 0 5px;
}
.mkd-bullet {
  color: var(--sv-fg-dim);
  flex: 0 0 auto;
}
.mkd-check {
  display: flex;
  gap: 9px;
  margin: 0 0 5px;
}
.mkd-check-on {
  color: var(--sv-ok);
}
.mkd-check-off {
  color: var(--sv-fg-dim);
}
.mkd-check-done {
  color: var(--sv-fg-dim);
  text-decoration: line-through;
}
.mkd-code {
  font-family: inherit;
  font-size: 12px;
  background: var(--sv-rail-bg);
  border: 1px solid var(--sv-line);
  border-radius: 7px;
  padding: 12px 14px;
  color: var(--sv-fg-card);
  margin: 0 0 14px;
  overflow-x: auto;
  white-space: pre;
  line-height: 1.5;
}
.mkd-hr {
  height: 1px;
  background: var(--sv-line);
  margin: 16px 0;
}
</style>
