<script setup lang="ts">
import { ChevronRight, Plus, Trash2, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { checkCrsDefinition, formatPosition, resolveCrs } from '@/core/crs'
import { CRS_CATALOG, CRS_GROUPS, type CrsEntry, WGS84_ID } from '@/core/crsCatalog'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const LIST_LIMIT = 200

const tab = ref<'predefined' | 'custom'>('predefined')
const query = ref('')
const chosen = ref(editor.crs)
const collapsed = ref<Record<string, boolean>>({})

const draftName = ref('')
const draftDef = ref('')
const draftResult = ref<{ ok: boolean; text: string } | null>(null)
const backdrop = ref<HTMLElement | null>(null)

// Фокус внутри окна нужен, чтобы Esc закрывал его сразу после открытия
onMounted(() => backdrop.value?.focus())

const samplePoint = computed(() => editor.cursor ?? (editor.camera ? { lat: editor.camera.center[1], lon: editor.camera.center[0] } : { lat: 52.26, lon: 104.26 }))
const current = computed(() => resolveCrs(chosen.value))

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const all = [...CRS_CATALOG, ...editor.customCrs]
  return needle ? all.filter((entry) => `${entry.name} ${entry.id}`.toLowerCase().includes(needle)) : all
})

const groups = computed(() => {
  const names = editor.customCrs.length ? ['Свои', ...CRS_GROUPS] : CRS_GROUPS
  return names
    .map((name) => ({ name, items: filtered.value.filter((entry) => (entry.custom ? 'Свои' : entry.group) === name) }))
    .filter((group) => group.items.length > 0)
})

const recent = computed(() => editor.recentCrs.map(resolveCrs).filter((entry): entry is CrsEntry => !!entry))

function isOpen(name: string): boolean {
  return query.value.trim() !== '' || !collapsed.value[name]
}

function verify(): void {
  const result = checkCrsDefinition(draftDef.value, samplePoint.value)
  draftResult.value = result.ok ? { ok: true, text: `Координаты точки: ${result.text}` } : { ok: false, text: result.text }
}

function addCustom(): void {
  const name = draftName.value.trim()
  const result = checkCrsDefinition(draftDef.value, samplePoint.value)
  if (!name) {
    draftResult.value = { ok: false, text: 'Укажите название системы' }
    return
  }
  if (!result.ok) {
    draftResult.value = { ok: false, text: result.text }
    return
  }
  chosen.value = editor.addCustomCrs(name, draftDef.value.trim())
  draftName.value = ''
  draftDef.value = ''
  draftResult.value = null
  tab.value = 'predefined'
}

function removeCustom(entry: CrsEntry): void {
  editor.removeCustomCrs(entry.id)
  if (chosen.value === entry.id) chosen.value = WGS84_ID
}

function apply(): void {
  editor.setCrs(chosen.value)
  editor.crsDialogOpen = false
}
</script>

<template>
  <div ref="backdrop" class="backdrop" role="dialog" aria-modal="true" aria-labelledby="crs-title" tabindex="-1" @keydown.esc="editor.crsDialogOpen = false" @click.self="editor.crsDialogOpen = false">
    <div class="box">
      <header>
        <h2 id="crs-title">Выбор системы координат</h2>
        <button class="icon" aria-label="Закрыть" @click="editor.crsDialogOpen = false"><X :size="15" /></button>
      </header>
      <div class="tabs" role="tablist">
        <button role="tab" :class="{ active: tab === 'predefined' }" :aria-selected="tab === 'predefined'" @click="tab = 'predefined'">Предопределённые</button>
        <button role="tab" :class="{ active: tab === 'custom' }" :aria-selected="tab === 'custom'" @click="tab = 'custom'">Своя система</button>
      </div>

      <div v-if="tab === 'predefined'" class="content">
        <input v-model="query" class="input" placeholder="Фильтр: название или код EPSG" aria-label="Фильтр систем координат" />

        <div v-if="recent.length && !query.trim()" class="block">
          <div class="eyebrow">Недавно использованные</div>
          <div class="table short">
            <button v-for="entry in recent" :key="entry.id" class="row" :class="{ selected: chosen === entry.id }" @click="chosen = entry.id" @dblclick="apply">
              <span class="ellipsis">{{ entry.name }}</span><span class="code">{{ entry.id }}</span>
            </button>
          </div>
        </div>

        <div class="block grow">
          <div class="eyebrow">Системы координат</div>
          <div class="table">
            <template v-for="group in groups" :key="group.name">
              <button class="group" :aria-expanded="isOpen(group.name)" @click="collapsed[group.name] = isOpen(group.name)">
                <ChevronRight :size="13" :class="{ turned: isOpen(group.name) }" aria-hidden="true" />
                {{ group.name }}
                <span class="code">{{ group.items.length }}</span>
              </button>
              <template v-if="isOpen(group.name)">
                <div v-for="entry in group.items.slice(0, LIST_LIMIT)" :key="entry.id" class="row-wrap">
                  <button class="row" :class="{ selected: chosen === entry.id }" @click="chosen = entry.id" @dblclick="apply">
                    <span class="ellipsis">{{ entry.name }}</span><span class="code">{{ entry.id }}</span>
                  </button>
                  <button v-if="entry.custom" class="icon" :aria-label="`Удалить ${entry.name}`" title="Удалить" @click="removeCustom(entry)"><Trash2 :size="13" /></button>
                </div>
              </template>
            </template>
            <p v-if="groups.length === 0" class="empty">Ничего не найдено</p>
          </div>
        </div>

        <div class="details">
          <strong>{{ current?.name ?? 'Система не выбрана' }}</strong>
          <span class="code">{{ current?.id }}</span>
          <code v-if="current?.def">{{ current.def }}</code>
          <span class="muted">Точка на карте: {{ formatPosition(samplePoint, chosen, editor.projector) }}</span>
        </div>
      </div>

      <div v-else class="content">
        <label class="field">
          <span>Название</span>
          <input v-model="draftName" class="input" placeholder="Например, МСК-38 зона 3" />
        </label>
        <label class="field grow">
          <span>Параметры: строка PROJ или WKT</span>
          <textarea v-model="draftDef" class="input area" spellcheck="false" placeholder="+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=3500000 +y_0=-5811057.63 +ellps=krass +towgs84=23.57,-140.95,-79.8,0,0.35,0.79,-0.22 +units=m +no_defs" />
        </label>
        <p v-if="draftResult" :class="draftResult.ok ? 'good' : 'bad'">{{ draftResult.text }}</p>
        <div class="row-actions">
          <button class="btn" @click="verify">Проверить</button>
          <button class="btn primary" @click="addCustom"><Plus :size="13" aria-hidden="true" /> Добавить в список</button>
        </div>
      </div>

      <p class="note muted">Система влияет только на показ координат. В файле .osm координаты всегда остаются в WGS 84.</p>
      <footer>
        <button class="btn primary" :disabled="!current" @click="apply">Применить</button>
        <button class="btn" @click="editor.crsDialogOpen = false">Отмена</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
  outline: none;
}
.box {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  /* Высота в единицах экрана: проценты не ограничивают строку сетки, и длинный список уводил окно за край */
  height: min(680px, calc(100vh - 32px));
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
footer {
  justify-content: flex-end;
  gap: 6px;
}
h2 {
  margin: 0;
  font-size: 15px;
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
.tabs {
  display: flex;
  margin: 8px 0;
  border-bottom: 1px solid var(--line-strong);
}
.tabs button {
  padding: 5px 12px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--text);
}
.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}
.grow {
  flex: 1;
}
.table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--line-strong);
}
.table.short {
  max-height: 96px;
}
.group,
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 8px;
  background: transparent;
  border: 0;
  text-align: left;
}
.group {
  font-weight: 500;
}
.group svg.turned {
  transform: rotate(90deg);
}
.row-wrap {
  display: flex;
  align-items: center;
}
.row {
  padding-left: 24px;
}
.table.short .row {
  padding-left: 8px;
}
.row:hover {
  background: var(--row-hover);
}
.row.selected {
  background: var(--row-selected);
}
.code {
  flex: none;
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.details {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 8px;
  padding: 6px 8px;
  background: var(--raised);
  border: 1px solid var(--line-strong);
}
.details code {
  width: 100%;
  font-size: 11px;
  word-break: break-all;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.area {
  flex: 1;
  min-height: 120px;
  resize: none;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.row-actions {
  display: flex;
  gap: 6px;
}
.good {
  margin: 0;
  color: var(--ok, #22c55e);
}
.bad {
  margin: 0;
  color: var(--err-text);
}
.empty {
  margin: 8px;
  color: var(--faint);
}
.note {
  margin: 8px 0;
  font-size: 12px;
}
</style>
