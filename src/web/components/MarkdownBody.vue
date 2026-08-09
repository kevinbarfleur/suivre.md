<script setup lang="ts">
import { computed } from 'vue'
import { numberGutter, toBlocks } from '../lib/markdown-blocks'

// Terminal markdown rendering. Headings keep their `##` marks so a document
// still reads as markdown while being typeset; depth is carried by the colour
// ladder rather than by a different glyph, so the bullet stays the house `–`.
// NB `mkd-` prefix (not `md-`): `md` is the UnoCSS breakpoint, so `md-h1` was
// read as the `md:h-1` utility and overrode heading heights.
const props = defineProps<{ source: string; measure?: string }>()

const blocks = computed(() => toBlocks(props.source))
const gutter = computed(() => numberGutter(blocks.value))
const indent = (depth: number): string => `${depth * 22}px`
</script>

<template>
  <div class="mkd" :style="{ maxWidth: props.measure ?? 'var(--sv-measure)', '--mkd-num': gutter }">
    <template v-for="(b, i) in blocks" :key="i">
      <component
        :is="b.type"
        v-if="b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'h4'"
        :class="`mkd-${b.type}`"
      >
        <span v-if="b.type !== 'h1'" class="mkd-hash">{{
          b.type === 'h2' ? '##' : b.type === 'h3' ? '###' : '####'
        }}</span>
        <template v-for="(r, j) in b.runs" :key="j">
          <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
          <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
          <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
          <s v-else-if="r.kind === 'strike'">{{ r.text }}</s>
          <a
            v-else-if="r.kind === 'link'"
            :href="r.href"
            :title="r.href"
            :target="r.external ? '_blank' : undefined"
            :rel="r.external ? 'noopener noreferrer' : undefined"
            >{{ r.text }}<span v-if="r.external" class="mkd-ext"> ↗</span></a
          >
          <template v-else>{{ r.text }}</template>
        </template>
      </component>

      <p v-else-if="b.type === 'p'" class="mkd-p">
        <template v-for="(r, j) in b.runs" :key="j">
          <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
          <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
          <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
          <s v-else-if="r.kind === 'strike'">{{ r.text }}</s>
          <a
            v-else-if="r.kind === 'link'"
            :href="r.href"
            :title="r.href"
            :target="r.external ? '_blank' : undefined"
            :rel="r.external ? 'noopener noreferrer' : undefined"
            >{{ r.text }}<span v-if="r.external" class="mkd-ext"> ↗</span></a
          >
          <template v-else>{{ r.text }}</template>
        </template>
      </p>

      <div v-else-if="b.type === 'li'" class="mkd-row" :style="{ paddingLeft: indent(b.depth) }">
        <span class="mkd-bullet" :class="{ 'mkd-bullet--deep': b.depth > 0 }">–</span>
        <span class="mkd-row-text">
          <template v-for="(r, j) in b.runs" :key="j">
            <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
            <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
            <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
            <s v-else-if="r.kind === 'strike'">{{ r.text }}</s>
            <a
              v-else-if="r.kind === 'link'"
              :href="r.href"
              :title="r.href"
              :target="r.external ? '_blank' : undefined"
              :rel="r.external ? 'noopener noreferrer' : undefined"
              >{{ r.text }}<span v-if="r.external" class="mkd-ext"> ↗</span></a
            >
            <template v-else>{{ r.text }}</template>
          </template>
        </span>
      </div>

      <div v-else-if="b.type === 'ol'" class="mkd-row" :style="{ paddingLeft: indent(b.depth) }">
        <span class="mkd-num">{{ b.num }}</span>
        <span class="mkd-row-text">
          <template v-for="(r, j) in b.runs" :key="j">
            <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
            <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
            <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
            <a
              v-else-if="r.kind === 'link'"
              :href="r.href"
              :title="r.href"
              :target="r.external ? '_blank' : undefined"
              :rel="r.external ? 'noopener noreferrer' : undefined"
              >{{ r.text }}<span v-if="r.external" class="mkd-ext"> ↗</span></a
            >
            <template v-else>{{ r.text }}</template>
          </template>
        </span>
      </div>

      <div v-else-if="b.type === 'check'" class="mkd-row" :style="{ paddingLeft: indent(b.depth) }">
        <span class="mkd-box" :class="{ 'mkd-box--on': b.done }">{{ b.done ? '[x]' : '[ ]' }}</span>
        <span class="mkd-row-text" :class="{ 'mkd-done': b.done }">
          <template v-for="(r, j) in b.runs" :key="j">
            <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
            <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
            <a
              v-else-if="r.kind === 'link'"
              :href="r.href"
              :title="r.href"
              :target="r.external ? '_blank' : undefined"
              :rel="r.external ? 'noopener noreferrer' : undefined"
              >{{ r.text }}</a
            >
            <template v-else>{{ r.text }}</template>
          </template>
        </span>
      </div>

      <blockquote v-else-if="b.type === 'quote'" class="mkd-quote">
        <p v-for="(q, j) in b.paragraphs" :key="j">
          <template v-for="(r, k) in q.runs" :key="k">
            <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
            <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
            <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
            <a
              v-else-if="r.kind === 'link'"
              :href="r.href"
              :title="r.href"
              :target="r.external ? '_blank' : undefined"
              :rel="r.external ? 'noopener noreferrer' : undefined"
              >{{ r.text }}</a
            >
            <template v-else>{{ r.text }}</template>
          </template>
        </p>
      </blockquote>

      <div v-else-if="b.type === 'table'" class="mkd-table-wrap">
        <table class="mkd-table">
          <thead>
            <tr>
              <th v-for="(h, j) in b.head" :key="j" :style="{ textAlign: h.align }">
                {{ h.text }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, j) in b.rows" :key="j">
              <td v-for="(c, k) in row.cells" :key="k" :style="{ textAlign: c.align }">
                <template v-for="(r, l) in c.runs" :key="l">
                  <strong v-if="r.kind === 'bold'">{{ r.text }}</strong>
                  <em v-else-if="r.kind === 'em'">{{ r.text }}</em>
                  <code v-else-if="r.kind === 'code'" class="mkd-code-span">{{ r.text }}</code>
                  <a
                    v-else-if="r.kind === 'link'"
                    :href="r.href"
                    :title="r.href"
                    :target="r.external ? '_blank' : undefined"
                    :rel="r.external ? 'noopener noreferrer' : undefined"
                    >{{ r.text }}</a
                  >
                  <template v-else>{{ r.text }}</template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="b.type === 'code'" class="mkd-code">
        <div v-if="b.lang" class="mkd-code-lang">{{ b.lang }}</div>
        <pre>{{ b.text }}</pre>
      </div>

      <div v-else-if="b.type === 'hr'" class="mkd-hr"></div>
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
  letter-spacing: -0.01em;
  color: var(--sv-bright);
  margin: 4px 0 14px;
}
.mkd-h2 {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--sv-fg);
  margin: 26px 0 9px;
}
.mkd-h3 {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--sv-fg-card);
  margin: 18px 0 7px;
}
.mkd-h4 {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--sv-fg-mid);
  margin: 14px 0 6px;
}
.mkd-hash {
  color: var(--sv-fg-dim);
  margin-right: 0.5ch;
}
.mkd-h4 .mkd-hash {
  color: var(--sv-faint);
}
.mkd-p {
  margin: 0 0 12px;
  text-wrap: pretty;
}
.mkd-row {
  display: flex;
  gap: 9px;
  margin: 0 0 5px;
}
.mkd-row-text {
  min-width: 0;
}
.mkd-bullet {
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
}
.mkd-bullet--deep {
  color: var(--sv-faint);
}
.mkd-num {
  flex: 0 0 auto;
  width: var(--mkd-num);
  text-align: right;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.mkd-box {
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
}
.mkd-box--on {
  color: var(--sv-ok);
}
.mkd-done {
  color: var(--sv-fg-dim);
  text-decoration: line-through;
}
.mkd strong {
  font-weight: 600;
  color: var(--sv-fg);
}
.mkd em {
  font-style: italic;
  color: var(--sv-fg-card);
}
.mkd s {
  color: var(--sv-fg-dim);
}
.mkd a {
  color: var(--sv-prompt);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}
.mkd a:hover {
  color: var(--sv-fg);
}
.mkd-ext {
  color: var(--sv-fg-dim);
}
.mkd-code-span {
  font-family: inherit;
  font-size: 0.92em;
  background: var(--sv-code-bg);
  border: 1px solid var(--sv-line-soft);
  border-radius: var(--sv-r-badge);
  padding: 0 5px;
  color: var(--sv-fg-card);
}
.mkd-quote {
  margin: 0 0 14px;
  padding: 2px 0 2px 18px;
  border-left: 1px solid var(--sv-line-strong);
  color: var(--sv-fg-mid);
}
.mkd-quote p {
  margin: 0 0 6px;
}
.mkd-quote p:last-child {
  margin-bottom: 0;
}
.mkd-table-wrap {
  margin: 0 0 16px;
  overflow-x: auto;
}
.mkd-table {
  border-collapse: collapse;
  font-size: 12.5px;
  min-width: 100%;
}
/* Column names use the app's one eyebrow template — same object as the list
   headers and the rail groups. */
.mkd-table th {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 400;
  color: var(--sv-fg-dim);
  padding: 0 18px 7px 0;
  border-bottom: 1px solid var(--sv-line);
  white-space: nowrap;
}
.mkd-table td {
  padding: 7px 18px 7px 0;
  border-bottom: 1px solid var(--sv-line-soft);
  vertical-align: top;
  color: var(--sv-fg-body);
  font-variant-numeric: tabular-nums;
}
.mkd-code {
  margin: 0 0 14px;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  background: var(--sv-rail-bg);
  overflow: hidden;
}
.mkd-code-lang {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  padding: 7px 14px 0;
}
.mkd-code pre {
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  padding: 12px 14px;
  margin: 0;
  color: var(--sv-fg-card);
  overflow-x: auto;
  white-space: pre;
}
.mkd-hr {
  height: 1px;
  background: var(--sv-line);
  margin: 20px 0;
}
</style>
