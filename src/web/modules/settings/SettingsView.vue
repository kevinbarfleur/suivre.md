<script setup lang="ts">
import { computed } from 'vue'
import type { Theme } from '../../lib/api'
import { views } from '../shell/view-registry'
import { usePreferences } from './prefs.store'

// Page de préférences. Deux niveaux : machine (thème, vue par défaut — mêmes
// pour tous les projets) et projet (surcharge de la vue par défaut).
const { global, project, setTheme, setGlobalDefaultView, setProjectDefaultView } = usePreferences()

const THEMES: { value: Theme; label: string }[] = [
  { value: 'terminal', label: 'terminal' },
  { value: 'dark', label: 'dark · neutre' },
  { value: 'light', label: 'light' },
]

// Toutes les vues navigables (hors « system ») comme choix de vue par défaut.
const viewOptions = computed(() =>
  views()
    .filter((v) => v.group !== 'system')
    .map((v) => ({ value: v.id, label: v.label })),
)
</script>

<template>
  <div class="st">
    <div class="st-lead">Préférences — réglages machine (tous projets) et propres à ce projet.</div>

    <section class="st-section">
      <div class="st-scope st-scope--machine">machine</div>
      <div class="st-row">
        <div class="st-row-head">
          <div class="st-row-l">Thème</div>
          <div class="st-row-hint">appliqué partout, ne change pas d'un projet à l'autre</div>
        </div>
        <div class="st-seg">
          <button
            v-for="t in THEMES"
            :key="t.value"
            class="st-opt"
            :class="{ 'st-opt--on': global.theme === t.value }"
            type="button"
            @click="setTheme(t.value)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="st-row">
        <div class="st-row-head">
          <div class="st-row-l">Vue par défaut</div>
          <div class="st-row-hint">vue ouverte à l'arrivée dans l'app</div>
        </div>
        <div class="st-seg st-seg--wrap">
          <button
            v-for="v in viewOptions"
            :key="v.value"
            class="st-opt"
            :class="{ 'st-opt--on': global.defaultView === v.value }"
            type="button"
            @click="setGlobalDefaultView(v.value)"
          >
            {{ v.label }}
          </button>
        </div>
      </div>
    </section>

    <section class="st-section">
      <div class="st-scope st-scope--project">projet</div>
      <div class="st-row">
        <div class="st-row-head">
          <div class="st-row-l">Vue par défaut — surcharge</div>
          <div class="st-row-hint">pour CE projet uniquement ; sinon la préférence machine s'applique</div>
        </div>
        <div class="st-seg st-seg--wrap">
          <button
            class="st-opt"
            :class="{ 'st-opt--on': project.defaultView === null }"
            type="button"
            @click="setProjectDefaultView(null)"
          >
            (globale)
          </button>
          <button
            v-for="v in viewOptions"
            :key="v.value"
            class="st-opt"
            :class="{ 'st-opt--on': project.defaultView === v.value }"
            type="button"
            @click="setProjectDefaultView(v.value)"
          >
            {{ v.label }}
          </button>
        </div>
      </div>
    </section>

    <div class="st-store">
      <div class="st-store-l">stockage</div>
      <div class="st-store-row"><span class="st-store-tag">machine</span> <span class="st-store-path">~/.config/suivre/config.json</span></div>
      <div class="st-store-row"><span class="st-store-tag">projet</span> <span class="st-store-path">.suivre/preferences.json</span></div>
    </div>
  </div>
</template>

<style scoped>
.st {
  max-width: 720px;
}
.st-lead {
  font-size: 12.5px;
  color: var(--sv-fg-mid);
  margin-bottom: 26px;
}
.st-section {
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  padding: 8px 18px 18px;
  margin-bottom: 16px;
}
.st-scope {
  display: inline-block;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 20px;
  margin: 14px 0 4px;
}
.st-scope--machine {
  color: var(--sv-fg-mid);
  border: 1px solid var(--sv-line-strong);
}
.st-scope--project {
  color: var(--sv-prompt);
  border: 1px solid var(--sv-ok-line);
  background: var(--sv-ok-bg);
}
.st-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 0;
  border-top: 1px solid var(--sv-line-soft);
}
.st-row:first-of-type {
  border-top: 0;
}
.st-row-head {
  min-width: 200px;
}
.st-row-l {
  font-size: 13px;
  color: var(--sv-fg);
}
.st-row-hint {
  font-size: 10.5px;
  color: var(--sv-fg-dim);
  margin-top: 4px;
  line-height: 1.5;
}
.st-seg {
  display: flex;
  gap: 7px;
}
.st-seg--wrap {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.st-opt {
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 7px 12px;
  border-radius: var(--sv-r);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.st-opt:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.st-opt--on,
.st-opt--on:hover {
  background: var(--sv-accent);
  border-color: var(--sv-accent);
  color: var(--sv-on-accent);
}
.st-store {
  margin-top: 8px;
  font-size: 11px;
  color: var(--sv-fg-dim);
}
.st-store-l {
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 9.5px;
  margin-bottom: 8px;
}
.st-store-row {
  margin-bottom: 5px;
}
.st-store-tag {
  display: inline-block;
  width: 64px;
  color: var(--sv-fg-mid);
}
.st-store-path {
  color: var(--sv-fg-mid);
}
</style>
