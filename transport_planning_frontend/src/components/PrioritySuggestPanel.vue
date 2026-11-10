<script setup lang="ts">
import { Check, RefreshCw, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { CLASS_LABELS, type PrioritySummary, suggestPrioritySigns } from '@/core/prioritySuggest'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const summary = shallowRef<PrioritySummary | null>(null)
const chosen = ref<Set<string>>(new Set())
const focused = ref<string | null>(null)

function compute(): void {
  if (!editor.doc || !editor.projector || !editor.network) return
  summary.value = suggestPrioritySigns(editor.doc, editor.projector, editor.network)
  chosen.value = new Set(summary.value.suggestions.map((item) => item.id))
}
compute()

const items = computed(() => summary.value?.suggestions ?? [])
const selectedItems = computed(() => items.value.filter((item) => chosen.value.has(item.id)))

// Предлагаемые знаки видны на карте, пока окно открыто
watch(
  [items, chosen],
  () => {
    editor.signPreview = items.value.map((item) => ({ ...item.position, chosen: chosen.value.has(item.id), focused: item.id === focused.value }))
  },
  { immediate: true, deep: true },
)
watch(focused, () => {
  editor.signPreview = items.value.map((item) => ({ ...item.position, chosen: chosen.value.has(item.id), focused: item.id === focused.value }))
})
onBeforeUnmount(() => {
  editor.signPreview = []
})

function toggle(id: string): void {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}

function setAll(value: boolean): void {
  chosen.value = new Set(value ? items.value.map((item) => item.id) : [])
}

function show(id: string): void {
  const item = items.value.find((entry) => entry.id === id)
  if (!item) return
  focused.value = id
  editor.focusOn(item.position, 18.5)
}

function showJunction(node: number): void {
  editor.focusNode(node)
}

function apply(): void {
  editor.applyPrioritySuggestions(selectedItems.value)
  compute()
}

function classLabel(highway: string): string {
  const base = highway.replace(/_link$/, '')
  return (CLASS_LABELS[base] ?? highway) + (highway.endsWith('_link') ? ', съезд' : '')
}
</script>

<template>
  <section class="panel" aria-labelledby="ps-title" @keydown.esc="editor.prioritySuggestOpen = false">
    <header>
      <h2 id="ps-title">Знаки «Уступи дорогу»: черновик</h2>
      <button class="icon" aria-label="Пересчитать" title="Пересчитать" @click="compute"><RefreshCw :size="13" /></button>
      <button class="icon" aria-label="Закрыть" @click="editor.prioritySuggestOpen = false"><X :size="14" /></button>
    </header>
    <p class="muted note">
      Главная — дорога старшего класса OSM, если по ней на перекрёсток выходят два подхода. Это предложение, а не данные ПОДД:
      проверьте каждый знак по месту.
    </p>
    <dl v-if="summary" class="stats">
      <div><dt>Перекрёстков</dt><dd>{{ summary.junctions }}</dd></div>
      <div><dt>Со светофором</dt><dd>{{ summary.signalized }}</dd></div>
      <div><dt>Знак уже стоит</dt><dd>{{ summary.alreadySigned }}</dd></div>
      <div><dt>Равнозначные, правило правой руки</dt><dd>{{ summary.equal.length }}</dd></div>
    </dl>
    <details v-if="summary?.unclear.length" class="unclear">
      <summary>Решить вручную: {{ summary.unclear.length }}</summary>
      <p class="muted note">Главная по классу дорога подходит только с одной стороны: она здесь кончается или поворачивает.</p>
      <button v-for="node in summary.unclear" :key="node" class="link" @click="showJunction(node)">Узел {{ node }}</button>
    </details>

    <div class="bar">
      <span>Предложено: {{ items.length }}, отмечено: {{ selectedItems.length }}</span>
      <span class="spacer" />
      <button class="link" @click="setAll(true)">все</button>
      <button class="link" @click="setAll(false)">ни одного</button>
    </div>
    <ul class="list">
      <li v-for="item in items" :key="item.id" :class="{ focused: focused === item.id }">
        <input type="checkbox" :checked="chosen.has(item.id)" :aria-label="`Ставить знак на ${item.roadName}`" @change="toggle(item.id)" />
        <button class="row" @click="show(item.id)">
          <span class="road ellipsis">{{ item.roadName }}</span>
          <span class="faint ellipsis">
            {{ item.roundabout ? 'въезд на кольцо' : `${classLabel(item.roadClass)} → ${classLabel(item.mainClass)}` }}, {{ item.mainName }}{{ item.signNode === null ? ', новый узел' : '' }}
          </span>
        </button>
      </li>
      <li v-if="items.length === 0" class="faint">Предложений нет</li>
    </ul>
    <footer>
      <button class="btn primary" :disabled="selectedItems.length === 0" @click="apply"><Check :size="13" aria-hidden="true" /> Поставить отмеченные: {{ selectedItems.length }}</button>
      <button class="btn" @click="editor.prioritySuggestOpen = false">Закрыть</button>
    </footer>
  </section>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 12px;
  right: 56px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 360px;
  max-height: calc(100% - 120px);
  padding: 10px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}
header {
  display: flex;
  align-items: center;
  gap: 4px;
}
h2 {
  flex: 1;
  margin: 0;
  font-size: 13px;
}
.icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}
.note {
  margin: 0;
  font-size: 11px;
}
.stats {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  font-size: 11px;
}
.stats > div {
  display: flex;
  justify-content: space-between;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.unclear {
  font-size: 11px;
}
.unclear .link {
  margin-right: 8px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.spacer {
  flex: 1;
}
.list {
  flex: 1;
  min-height: 60px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--line);
}
.list li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-bottom: 1px solid var(--line);
}
.list li.focused {
  background: var(--row-selected);
}
.row {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  padding: 0;
  background: transparent;
  border: 0;
  text-align: left;
}
.road {
  font-size: 12px;
}
.row .faint {
  font-size: 10.5px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
}
footer {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
</style>
