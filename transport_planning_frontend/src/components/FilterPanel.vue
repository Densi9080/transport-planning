<script setup lang="ts">
import { MousePointerClick, Plus, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
  collectKeyStats,
  countMatches,
  fieldOf,
  FILTER_FIELDS,
  type FilterOp,
  matchingWays,
  OPS_BY_KIND,
  opLabel,
  opNeedsValue,
  valueLabel,
} from '@/core/filter'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
let nextId = 1

const keyStats = computed(() => {
  void editor.rev
  return editor.doc ? collectKeyStats(editor.doc) : []
})

const draftField = ref('highway')
const customKey = ref('')
const draftOp = ref<FilterOp>('eq')
const draftValue = ref('')

const field = computed(() => fieldOf(draftField.value))
const draftKey = computed(() => (draftField.value === '*' ? customKey.value.trim() : draftField.value))
const ops = computed(() => OPS_BY_KIND[field.value.kind])
const needsValue = computed(() => opNeedsValue(draftOp.value))

watch(draftField, () => {
  draftOp.value = ops.value[0]!
  draftValue.value = ''
})

const suggestions = computed(() => keyStats.value.find((stat) => stat.key === draftKey.value)?.values ?? [])
const canAdd = computed(() => draftKey.value !== '' && (!needsValue.value || draftValue.value.trim() !== ''))

const draftCount = computed(() => {
  const doc = editor.doc
  if (!doc || !canAdd.value) return null
  return countMatches(doc, { key: draftKey.value, op: draftOp.value, value: draftValue.value.trim() })
})

function addRule(): void {
  if (!canAdd.value) return
  editor.filterRules.push({
    id: Date.now() + nextId++,
    enabled: true,
    key: draftKey.value,
    op: draftOp.value,
    value: needsValue.value ? draftValue.value.trim() : '',
  })
  draftValue.value = ''
}

function removeRule(id: number): void {
  editor.filterRules = editor.filterRules.filter((rule) => rule.id !== id)
}

function ruleCount(rule: { key: string; op: FilterOp; value: string }): number {
  void editor.rev
  return editor.doc ? countMatches(editor.doc, rule) : 0
}

function describe(rule: { key: string; op: FilterOp; value: string }): string {
  const name = fieldOf(rule.key).key === '*' ? rule.key : fieldOf(rule.key).label
  const value = opNeedsValue(rule.op) ? ` ${valueLabel(rule.key, rule.value)}` : ''
  return `${name} ${opLabel(rule.op, fieldOf(rule.key).kind)}${value}`
}

const matched = computed(() => {
  void editor.rev
  return editor.doc ? matchingWays(editor.doc, editor.filterRules, editor.filterLogic) : []
})

function selectMatched(): void {
  editor.select(matched.value.map((id) => ({ kind: 'way' as const, id })))
  editor.toast(`Выделено дорог: ${matched.value.length}`, 'success')
}

const hiddenTotal = computed(() => editor.hidden.ways.size + editor.hidden.nodes.size)
</script>

<template>
  <section class="section">
    <div class="eyebrow">Условие</div>
    <div class="field">
      <label for="filter-field">Атрибут</label>
      <select id="filter-field" v-model="draftField" class="input">
        <option v-for="item in FILTER_FIELDS" :key="item.key" :value="item.key">{{ item.label }}</option>
      </select>
    </div>
    <div v-if="draftField === '*'" class="field">
      <label for="filter-key">Тег OSM</label>
      <input id="filter-key" v-model="customKey" class="input" list="filter-keys" placeholder="например, surface" />
      <datalist id="filter-keys">
        <option v-for="stat in keyStats" :key="stat.key" :value="stat.key">{{ stat.ways + stat.nodes }} объектов</option>
      </datalist>
    </div>
    <div class="grid-2">
      <div class="field">
        <label for="filter-op">Условие</label>
        <select id="filter-op" v-model="draftOp" class="input">
          <option v-for="op in ops" :key="op" :value="op">{{ opLabel(op, field.kind) }}</option>
        </select>
      </div>
      <div v-if="needsValue" class="field">
        <label for="filter-value">Значение</label>
        <select v-if="field.kind === 'enum'" id="filter-value" v-model="draftValue" class="input">
          <option value="" disabled>Выберите</option>
          <option v-for="item in suggestions" :key="item.value" :value="item.value">{{ valueLabel(draftKey, item.value) }} ({{ item.count }})</option>
        </select>
        <input v-else id="filter-value" v-model="draftValue" class="input" :inputmode="field.kind === 'number' ? 'decimal' : 'text'" list="filter-values" />
        <datalist id="filter-values">
          <option v-for="item in suggestions" :key="item.value" :value="item.value">{{ item.count }}</option>
        </datalist>
      </div>
    </div>
    <button class="btn block" :disabled="!canAdd" @click="addRule">
      <Plus :size="13" aria-hidden="true" />
      Добавить{{ draftCount !== null ? `: подходит ${draftCount}` : '' }}
    </button>
  </section>

  <section v-if="editor.filterRules.length" class="section">
    <div class="row">
      <span class="eyebrow">Фильтр</span>
      <span class="spacer" />
      <button class="btn small" @click="editor.filterRules = []">Сбросить</button>
    </div>
    <div class="segmented" role="group" aria-label="Действие фильтра">
      <button :class="{ active: editor.filterMode === 'hide' }" :aria-pressed="editor.filterMode === 'hide'" @click="editor.filterMode = 'hide'">Скрыть найденное</button>
      <button :class="{ active: editor.filterMode === 'only' }" :aria-pressed="editor.filterMode === 'only'" @click="editor.filterMode = 'only'">Оставить только их</button>
    </div>
    <div v-if="editor.filterRules.length > 1" class="segmented" role="group" aria-label="Сочетание условий">
      <button :class="{ active: editor.filterLogic === 'any' }" :aria-pressed="editor.filterLogic === 'any'" @click="editor.filterLogic = 'any'">Любое условие</button>
      <button :class="{ active: editor.filterLogic === 'all' }" :aria-pressed="editor.filterLogic === 'all'" @click="editor.filterLogic = 'all'">Все условия</button>
    </div>
    <div v-for="rule in editor.filterRules" :key="rule.id" class="rule">
      <input v-model="rule.enabled" type="checkbox" :aria-label="`Включить условие: ${describe(rule)}`" />
      <span class="ellipsis text" :title="describe(rule)">{{ describe(rule) }}</span>
      <span class="count faint" :title="`Подходит объектов: ${ruleCount(rule)}`">{{ ruleCount(rule) }}</span>
      <button class="btn ghost small remove" :aria-label="`Удалить условие: ${describe(rule)}`" @click="removeRule(rule.id)"><X :size="12" /></button>
    </div>
    <button class="btn block small" :disabled="matched.length === 0" @click="selectMatched">
      <MousePointerClick :size="13" aria-hidden="true" /> Выделить найденные дороги: {{ matched.length }}
    </button>
    <p class="muted info">
      Скрыто объектов: {{ hiddenTotal }}. Фильтр меняет только вид карты: объекты остаются в графе, в расчётах и в экспорте.
    </p>
  </section>
  <section v-else class="section">
    <p class="muted info">Задайте условие, например «Число полос ≥ 4», чтобы увидеть только магистрали или выделить их разом.</p>
  </section>
</template>

<style scoped>
.count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.rule {
  display: flex;
  align-items: center;
  gap: 4px;
}
.text {
  flex: 1;
  min-width: 0;
}
.remove {
  padding: 1px 2px;
}
.info {
  margin: 0;
  font-size: 11px;
}
</style>
