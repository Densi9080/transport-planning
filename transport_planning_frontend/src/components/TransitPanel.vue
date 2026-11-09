<script setup lang="ts">
import { BusFront, MapPinPlus, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { DEFAULT_INTERVAL_MIN, TRANSIT_MODE_LABELS, type TransitMode } from '@/core/transit'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()
const query = ref('')
const modeFilter = ref<'all' | TransitMode>('all')
const creating = ref(false)
const newRef = ref('')
const newMode = ref<TransitMode>('bus')
const newInterval = ref(10)

const modes: TransitMode[] = ['bus', 'trolleybus', 'tram', 'minibus']

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return editor.lines
    .filter((line) => modeFilter.value === 'all' || line.mode === modeFilter.value)
    .filter((line) => !needle || line.ref.toLowerCase().includes(needle) || line.name.toLowerCase().includes(needle))
})

const line = computed(() => editor.selectedLine)

const lineResult = computed(() => {
  const id = editor.selectedLineId
  return sim.macro?.lines.find((item) => item.service.line.id === id) ?? null
})

function createLine(): void {
  const ref = newRef.value.trim()
  if (!ref) {
    editor.toast('Укажите номер маршрута', 'error')
    return
  }
  editor.createTransitLine({ ref, mode: newMode.value, interval: newInterval.value })
  creating.value = false
  newRef.value = ''
}

function setField(key: string, event: Event): void {
  if (!line.value) return
  const value = (event.target as HTMLInputElement).value.trim()
  const tags = { ...line.value.tags }
  if (value) tags[key] = value
  else delete tags[key]
  editor.updateLineTags(line.value.id, tags)
}

function setInterval(event: Event): void {
  if (!line.value) return
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) {
    editor.toast('Интервал должен быть положительным числом минут', 'error')
    return
  }
  editor.updateLineTags(line.value.id, { ...line.value.tags, interval: String(value) }, 'Интервал маршрута')
}

function toggleTool(tool: 'lineWay' | 'lineStop'): void {
  editor.setTool(editor.tool === tool ? 'select' : tool)
}

function wayName(id: number): string {
  return editor.doc?.ways.get(id)?.tags?.name ?? `Дорога ${id}`
}

/** Удаление отменяется через Ctrl+Z, поэтому отдельного подтверждения не нужно. */
function deleteSelected(): void {
  if (!line.value) return
  const name = line.value.name
  editor.deleteTransitLine(line.value.id)
  editor.toast(`Маршрут «${name}» удалён. Вернуть: Ctrl+Z`)
}
</script>

<template>
  <section class="section">
    <div class="row">
      <label class="check grow"><input v-model="editor.layers.transit" type="checkbox" /> Все линии на карте</label>
      <button class="btn small" @click="creating = !creating"><Plus :size="12" aria-hidden="true" /> Новая</button>
    </div>
    <form v-if="creating" class="create" @submit.prevent="createLine">
      <div class="grid-2">
        <div class="field">
          <label for="new-ref">Номер</label>
          <input id="new-ref" v-model="newRef" class="input" />
        </div>
        <div class="field">
          <label for="new-mode">Вид</label>
          <select id="new-mode" v-model="newMode" class="input">
            <option v-for="mode in modes" :key="mode" :value="mode">{{ TRANSIT_MODE_LABELS[mode] }}</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="new-interval">Интервал, мин</label>
        <input id="new-interval" v-model.number="newInterval" class="input" type="number" min="1" />
      </div>
      <button class="btn primary block" type="submit">Создать и выбрать дороги</button>
    </form>
    <div class="search">
      <Search :size="13" class="faint" aria-hidden="true" />
      <input v-model="query" class="input" placeholder="Номер или название" aria-label="Поиск маршрута" />
    </div>
    <select v-model="modeFilter" class="input" aria-label="Вид транспорта">
      <option value="all">Все виды</option>
      <option v-for="mode in modes" :key="mode" :value="mode">{{ TRANSIT_MODE_LABELS[mode] }}</option>
    </select>
  </section>

  <section class="list" aria-label="Маршруты">
    <button
      v-for="item in visible"
      :key="item.id"
      class="line-row"
      :class="{ active: editor.selectedLineId === item.id }"
      :aria-pressed="editor.selectedLineId === item.id"
      @click="editor.focusLine(item.id)"
    >
      <span class="chip" :style="{ background: item.color }">{{ item.ref || '—' }}</span>
      <span class="ellipsis">{{ item.from && item.to ? `${item.from} — ${item.to}` : item.name }}</span>
    </button>
    <p v-if="visible.length === 0" class="empty">Маршрутов не найдено</p>
  </section>

  <section v-if="line" class="section card">
    <div class="row">
      <span class="chip" :style="{ background: line.color }">{{ line.ref || '—' }}</span>
      <strong class="ellipsis">{{ TRANSIT_MODE_LABELS[line.mode] }}</strong>
      <span class="spacer" />
      <button class="btn ghost small" aria-label="Снять выбор маршрута" @click="editor.selectLine(null)"><X :size="12" /></button>
    </div>
    <div class="field">
      <label for="line-name">Название</label>
      <input id="line-name" class="input" :value="line.tags.name ?? ''" @change="setField('name', $event)" />
    </div>
    <div class="grid-2">
      <div class="field">
        <label for="line-ref">Номер</label>
        <input id="line-ref" class="input" :value="line.ref" @change="setField('ref', $event)" />
      </div>
      <div class="field">
        <label for="line-interval">Интервал, мин</label>
        <input id="line-interval" class="input" type="number" min="1" :value="line.interval" @change="setInterval" />
      </div>
    </div>
    <p v-if="!line.intervalTagged" class="muted info">Интервала нет в файле: принято {{ DEFAULT_INTERVAL_MIN }} минут.</p>

    <dl>
      <div><dt>На участке</dt><dd>{{ (line.lengthM / 1000).toFixed(2) }} км, {{ line.wayIds.length }} дорог</dd></div>
      <div><dt>За рамкой файла</dt><dd>{{ line.outsideWays }} дорог, {{ line.outsideStops }} остановок</dd></div>
      <div><dt>Остановок на участке</dt><dd>{{ line.stops.length }}</dd></div>
      <template v-if="lineResult">
        <div><dt>Рейсов в час</dt><dd>{{ lineResult.service.frequency.toFixed(1) }}</dd></div>
        <div><dt>Время по участку</dt><dd>{{ Math.round(lineResult.timeS / 60) }} мин</dd></div>
        <div><dt>Скорость сообщения</dt><dd>{{ Math.round(lineResult.speedKmh) }} км/ч</dd></div>
      </template>
    </dl>

    <div class="grid-2">
      <button class="btn small" :class="{ on: editor.tool === 'lineWay' }" :aria-pressed="editor.tool === 'lineWay'" @click="toggleTool('lineWay')">
        <BusFront :size="12" aria-hidden="true" /> Добавить дороги
      </button>
      <button class="btn small" :class="{ on: editor.tool === 'lineStop' }" :aria-pressed="editor.tool === 'lineStop'" @click="toggleTool('lineStop')">
        <MapPinPlus :size="12" aria-hidden="true" /> Добавить остановки
      </button>
    </div>

    <details>
      <summary>Остановки: {{ line.stops.length }}</summary>
      <div v-for="stop in line.stops" :key="`${stop.node}-${stop.role}`" class="member">
        <button class="link ellipsis" @click="editor.focusNode(stop.node)">{{ stop.name }}</button>
        <button class="btn ghost small" :aria-label="`Убрать остановку ${stop.name}`" @click="editor.removeStopFromLine(line!.id, stop.node)"><X :size="11" /></button>
      </div>
    </details>
    <details>
      <summary>Дороги: {{ line.wayIds.length }}</summary>
      <div v-for="(id, index) in line.wayIds" :key="`${id}-${index}`" class="member">
        <button class="link ellipsis" @click="editor.focusWay(id)">{{ wayName(id) }}</button>
        <button class="btn ghost small" :aria-label="`Убрать дорогу ${wayName(id)} из маршрута`" @click="editor.removeWayFromLine(line!.id, id)"><X :size="11" /></button>
      </div>
    </details>
    <button class="btn block small danger" @click="deleteSelected"><Trash2 :size="12" aria-hidden="true" /> Удалить маршрут</button>
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.create {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: var(--inset);
}
.search {
  position: relative;
}
.search svg {
  position: absolute;
  left: 6px;
  top: 5px;
}
.search input {
  padding-left: 23px;
}
.list {
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid var(--line);
}
.line-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 8px;
  background: transparent;
  border: 0;
  text-align: left;
}
.line-row:hover {
  background: var(--row-hover);
}
.line-row.active {
  background: var(--row-selected);
}
.chip {
  flex: none;
  min-width: 30px;
  padding: 0 4px;
  border-radius: 2px;
  color: #ffffff;
  font-weight: 600;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
.empty {
  margin: 6px 8px;
  color: var(--faint);
}
.info {
  margin: 0;
  font-size: 11px;
}
dl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  font-size: 11px;
}
dl > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
details summary {
  cursor: pointer;
  color: var(--muted);
}
.member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--select);
  text-align: left;
}
.member .btn {
  padding: 0 2px;
  min-height: 17px;
}
</style>
