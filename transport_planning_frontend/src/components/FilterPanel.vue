<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { collectKeyStats, countMatches, FILTER_OPS, type FilterOp, QUICK_FILTERS } from '@/core/filter'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
let nextId = 1

const keyStats = computed(() => {
  void editor.rev
  return editor.doc ? collectKeyStats(editor.doc) : []
})

const quick = computed(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return []
  return QUICK_FILTERS.map((filter) => ({ ...filter, count: countMatches(doc, filter) })).filter((filter) => filter.count > 0)
})

function ruleId(): number {
  return Date.now() + nextId++
}

function findQuickRule(filter: (typeof QUICK_FILTERS)[number]) {
  return editor.filterRules.find((rule) => rule.key === filter.key && rule.op === filter.op && rule.value === filter.value)
}

function toggleQuick(filter: (typeof QUICK_FILTERS)[number]): void {
  const existing = findQuickRule(filter)
  if (existing) {
    existing.enabled = !existing.enabled
    if (!existing.enabled) editor.filterRules = editor.filterRules.filter((rule) => rule !== existing)
    return
  }
  editor.filterRules.push({ id: ruleId(), enabled: true, key: filter.key, op: filter.op, value: filter.value })
}

const draftKey = ref('')
const draftOp = ref<FilterOp>('exists')
const draftValue = ref('')

const needsValue = computed(() => FILTER_OPS.find((op) => op.id === draftOp.value)?.needsValue ?? false)
const canAdd = computed(() => draftKey.value.trim() !== '' && (!needsValue.value || draftValue.value.trim() !== ''))
const valuesForDraft = computed(() => keyStats.value.find((stat) => stat.key === draftKey.value.trim())?.values ?? [])

const draftCount = computed(() => {
  const doc = editor.doc
  if (!doc || !canAdd.value) return null
  return countMatches(doc, { key: draftKey.value.trim(), op: draftOp.value, value: draftValue.value.trim() })
})

function addRule(): void {
  if (!canAdd.value) return
  editor.filterRules.push({
    id: ruleId(),
    enabled: true,
    key: draftKey.value.trim(),
    op: draftOp.value,
    value: needsValue.value ? draftValue.value.trim() : '',
  })
  draftKey.value = ''
  draftValue.value = ''
  draftOp.value = 'exists'
}

function removeRule(id: number): void {
  editor.filterRules = editor.filterRules.filter((rule) => rule.id !== id)
}

function needsValueFor(op: FilterOp): boolean {
  return FILTER_OPS.find((item) => item.id === op)?.needsValue ?? false
}

function ruleCount(rule: { key: string; op: FilterOp; value: string }): number {
  void editor.rev
  return editor.doc ? countMatches(editor.doc, rule) : 0
}

const hiddenTotal = computed(() => editor.hidden.ways.size + editor.hidden.nodes.size)
</script>

<template>
  <section class="section">
    <div class="eyebrow">Быстро скрыть</div>
    <label v-for="filter in quick" :key="filter.id" class="check quick">
      <input :checked="findQuickRule(filter)?.enabled ?? false" type="checkbox" @change="toggleQuick(filter)" />
      <span class="ellipsis">{{ filter.label }}</span>
      <span class="count faint">{{ filter.count }}</span>
    </label>
  </section>

  <section class="section">
    <div class="eyebrow">Своё условие</div>
    <div class="field">
      <label for="filter-key">Атрибут</label>
      <input id="filter-key" v-model="draftKey" class="input" list="filter-keys" placeholder="например, building" />
      <datalist id="filter-keys">
        <option v-for="stat in keyStats" :key="stat.key" :value="stat.key">{{ stat.ways + stat.nodes }} объектов</option>
      </datalist>
    </div>
    <div class="grid-2">
      <div class="field">
        <label for="filter-op">Условие</label>
        <select id="filter-op" v-model="draftOp" class="input">
          <option v-for="op in FILTER_OPS" :key="op.id" :value="op.id">{{ op.label }}</option>
        </select>
      </div>
      <div v-if="needsValue" class="field">
        <label for="filter-value">Значение</label>
        <input id="filter-value" v-model="draftValue" class="input" list="filter-values" />
        <datalist id="filter-values">
          <option v-for="item in valuesForDraft" :key="item.value" :value="item.value">{{ item.count }}</option>
        </datalist>
      </div>
    </div>
    <button class="btn block" :disabled="!canAdd" @click="addRule">
      <Plus :size="13" aria-hidden="true" />
      Скрыть{{ draftCount !== null ? `: ${draftCount} объектов` : '' }}
    </button>
  </section>

  <section v-if="editor.filterRules.length" class="section">
    <div class="row">
      <span class="eyebrow">Правила</span>
      <span class="spacer" />
      <button class="btn small" @click="editor.filterRules = []">Показать всё</button>
    </div>
    <div v-for="rule in editor.filterRules" :key="rule.id" class="rule">
      <input v-model="rule.enabled" type="checkbox" :aria-label="`Включить правило ${rule.key}`" />
      <input v-model="rule.key" class="input" :aria-label="`Атрибут правила`" />
      <select v-model="rule.op" class="input op" aria-label="Условие">
        <option v-for="op in FILTER_OPS" :key="op.id" :value="op.id">{{ op.label }}</option>
      </select>
      <input v-if="needsValueFor(rule.op)" v-model="rule.value" class="input" aria-label="Значение" />
      <span class="count faint" :title="`Подходит объектов: ${ruleCount(rule)}`">{{ ruleCount(rule) }}</span>
      <button class="btn ghost small remove" :aria-label="`Удалить правило ${rule.key}`" @click="removeRule(rule.id)"><X :size="12" /></button>
    </div>
    <p class="muted info">
      Скрыто объектов: {{ hiddenTotal }}. Скрытие меняет только вид карты: объекты остаются в графе, в расчётах и в экспорте.
    </p>
  </section>
</template>

<style scoped>
.quick {
  padding: 1px 0;
}
.count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.rule {
  display: flex;
  align-items: center;
  gap: 3px;
}
.rule .input {
  flex: 1;
  min-width: 0;
}
.rule .op {
  flex: 0 0 62px;
}
.remove {
  padding: 1px 2px;
}
.info {
  margin: 0;
  font-size: 11px;
}
</style>
