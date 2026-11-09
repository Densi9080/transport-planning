<script setup lang="ts">
import {
  Bus,
  Circle,
  Eye,
  EyeOff,
  Footprints,
  Gauge,
  Hexagon,
  Landmark,
  List,
  Lock,
  LockOpen,
  MapPin,
  OctagonAlert,
  Search,
  Spline,
  TrafficCone,
  TrainFrontTunnel,
  Waves,
  Workflow,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { isDrivable } from '@/core/lanes'
import { reducedSections } from '@/core/traffic'
import { type ListTab, type Tool, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()
const query = ref('')

type LayerKey = keyof typeof editor.layers

interface Row {
  id: string
  label: string
  icon: typeof Circle
  count?: number
  /** Щелчок по названию включает вставку объектов этого типа, как в Vissim. */
  tool?: Tool
  layers?: LayerKey[]
  lock?: 'links' | 'nodes'
  list?: ListTab
}

const summary = computed(() => {
  void editor.rev
  const doc = editor.doc
  const result = { drivable: 0, bumps: 0, signs: 0, signals: 0, crossings: 0, bridges: 0, tunnels: 0, sections: 0 }
  if (!doc) return result
  for (const way of doc.ways.values()) {
    if (!isDrivable(way.tags)) continue
    result.drivable++
    if (way.tags?.bridge && way.tags.bridge !== 'no') result.bridges++
    if (way.tags?.tunnel && way.tags.tunnel !== 'no') result.tunnels++
  }
  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (!tags) continue
    if (tags.traffic_calming) result.bumps++
    if (tags.highway === 'stop' || tags.highway === 'give_way') result.signs++
    if (tags.highway === 'traffic_signals') result.signals++
    if (tags.highway === 'crossing') result.crossings++
  }
  if (editor.projector) result.sections = reducedSections(doc, editor.projector).length
  return result
})

const junctionCount = computed(() => {
  let count = 0
  for (const arms of editor.network?.arms.values() ?? []) if (arms.length >= 3) count++
  return count
})

const groups = computed<{ title: string; rows: Row[] }[]>(() => {
  const s = summary.value
  const stops = new Set(editor.lines.flatMap((line) => line.stops.map((stop) => stop.node)))
  return [
    {
      title: 'Дорожная сеть',
      rows: [
        { id: 'links', label: 'Отрезки', icon: Spline, count: s.drivable, tool: 'road', lock: 'links', list: 'links' },
        { id: 'connectors', label: 'Соединения полос', icon: Workflow, tool: 'connector', layers: ['turnPaths'] },
        { id: 'nodes', label: 'Узлы', icon: Circle, count: junctionCount.value, tool: 'node', lock: 'nodes', list: 'nodes' },
        { id: 'bridges', label: 'Мосты', icon: Landmark, count: s.bridges, tool: 'bridge' },
        { id: 'tunnels', label: 'Тоннели', icon: TrainFrontTunnel, count: s.tunnels, tool: 'tunnel' },
      ],
    },
    {
      title: 'Организация движения',
      rows: [
        { id: 'signals', label: 'Светофоры', icon: TrafficCone, count: s.signals, tool: 'signal', layers: ['signals'], list: 'signals' },
        { id: 'crossings', label: 'Пешеходные переходы', icon: Footprints, count: s.crossings, tool: 'crossing', layers: ['crossings'] },
        { id: 'sections', label: 'Участки скорости', icon: Gauge, count: s.sections, tool: 'speed', layers: ['trafficSigns'] },
        { id: 'bumps', label: 'Лежачие полицейские', icon: Waves, count: s.bumps, tool: 'bump', layers: ['trafficSigns'] },
        { id: 'signs', label: 'Знаки приоритета', icon: OctagonAlert, count: s.signs, tool: 'sign', layers: ['trafficSigns'] },
      ],
    },
    {
      title: 'Транспорт и районы',
      rows: [
        { id: 'lines', label: 'Линии ОТ', icon: Bus, count: editor.lines.length, layers: ['transit'], list: 'lines' },
        { id: 'stops', label: 'Остановки', icon: MapPin, count: stops.size, layers: ['transit'], list: 'stops' },
        { id: 'zones', label: 'Транспортные районы', icon: Hexagon, count: sim.macro?.zones.filter((zone) => zone.kind === 'internal').length ?? 0, layers: ['zones'], list: 'zones' },
      ],
    },
    {
      title: 'Карта',
      rows: [
        { id: 'buildings', label: 'Здания', icon: Hexagon, layers: ['buildings'] },
        { id: 'landuse', label: 'Территории и вода', icon: Hexagon, layers: ['landuse'] },
        { id: 'minor', label: 'Тротуары и тропы', icon: Spline, layers: ['minor'] },
        { id: 'rail', label: 'Железная дорога', icon: Spline, layers: ['rail'] },
        { id: 'other', label: 'Прочие линии', icon: Spline, layers: ['other'] },
        { id: 'points', label: 'Точечные объекты', icon: Circle, layers: ['points'] },
        { id: 'arrows', label: 'Стрелки на полосах', icon: Spline, layers: ['arrows'] },
        { id: 'labels', label: 'Названия улиц', icon: Spline, layers: ['labels'] },
        { id: 'issues', label: 'Ошибки на карте', icon: OctagonAlert, layers: ['issues'] },
      ],
    },
  ]
})

function activate(row: Row): void {
  if (row.id === 'lines' || row.id === 'stops') {
    editor.leftTab = 'transit'
    return
  }
  if (row.tool) {
    editor.setTool(editor.tool === row.tool ? 'select' : row.tool)
    return
  }
  if (row.id === 'zones') {
    toggleVisible(row)
    return
  }
  if (row.list) openList(row.list)
  else if (row.layers) toggleVisible(row)
}

function openList(tab: ListTab): void {
  editor.listOpen = true
  editor.listTab = tab
}

function isVisible(row: Row): boolean {
  return (row.layers ?? []).every((key) => editor.layers[key])
}

function toggleVisible(row: Row): void {
  const next = !isVisible(row)
  // Районы считает макромодель: при первом включении её нужно запустить
  if (row.id === 'zones' && next && !sim.macro) sim.enter()
  for (const key of row.layers ?? []) (editor.layers[key] as boolean) = next
}

/** Замок отрезков оставляет выбираемыми только узлы, и наоборот. */
function isLocked(row: Row): boolean {
  return (row.lock === 'links' && editor.activeType === 'nodes') || (row.lock === 'nodes' && editor.activeType === 'links')
}

function toggleLock(row: Row): void {
  if (isLocked(row)) editor.activeType = 'auto'
  else editor.activeType = row.lock === 'links' ? 'nodes' : 'links'
}

const results = computed(() => {
  void editor.rev
  const doc = editor.doc
  const needle = query.value.trim().toLowerCase()
  if (!doc || !needle) return []
  const groupsByName = new Map<string, number>()
  for (const way of doc.ways.values()) {
    const name = way.tags?.name
    if (isDrivable(way.tags) && name?.toLowerCase().includes(needle) && !groupsByName.has(name)) groupsByName.set(name, way.id)
  }
  return [...groupsByName.entries()].slice(0, 30)
})
</script>

<template>
  <div class="search">
    <Search :size="13" class="faint" aria-hidden="true" />
    <input v-model="query" class="input" placeholder="Найти улицу" aria-label="Найти улицу" />
  </div>
  <div v-if="query.trim()" class="results">
    <button v-for="[name, id] in results" :key="name" class="result ellipsis" @click="editor.focusWay(id)">{{ name }}</button>
    <p v-if="results.length === 0" class="empty">Ничего не найдено</p>
  </div>

  <section v-for="group in groups" :key="group.title" :aria-label="group.title">
    <div class="eyebrow head">{{ group.title }}</div>
    <div v-for="row in group.rows" :key="row.id" class="row-item" :class="{ active: row.tool && editor.tool === row.tool }">
      <button
        class="square"
        :disabled="!row.layers"
        :aria-label="row.layers ? `${isVisible(row) ? 'Скрыть' : 'Показать'}: ${row.label}` : undefined"
        :title="row.layers ? (isVisible(row) ? 'Скрыть на карте' : 'Показать на карте') : undefined"
        :tabindex="row.layers ? 0 : -1"
        @click="toggleVisible(row)"
      >
        <template v-if="row.layers">
          <Eye v-if="isVisible(row)" :size="13" />
          <EyeOff v-else :size="13" class="faint" />
        </template>
      </button>
      <button class="main" :class="{ off: row.layers && !isVisible(row) }" :aria-pressed="row.tool ? editor.tool === row.tool : undefined" :title="row.tool ? 'Щелчок включает вставку на карте' : undefined" @click="activate(row)">
        <component :is="row.icon" :size="14" aria-hidden="true" />
        <span class="ellipsis">{{ row.label }}</span>
        <span v-if="row.count !== undefined" class="count">{{ row.count }}</span>
      </button>
      <button v-if="row.list" class="square" :aria-label="`Открыть список: ${row.label}`" title="Открыть список" @click="openList(row.list)">
        <List :size="13" />
      </button>
      <span v-else class="square" aria-hidden="true" />
      <button v-if="row.lock" class="square" :aria-pressed="isLocked(row)" :aria-label="`${isLocked(row) ? 'Разрешить' : 'Запретить'} выбор: ${row.label}`" :title="isLocked(row) ? 'Выбор запрещён' : 'Запретить выбор на карте'" @click="toggleLock(row)">
        <Lock v-if="isLocked(row)" :size="12" />
        <LockOpen v-else :size="12" class="faint" />
      </button>
      <span v-else class="square" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.search {
  position: relative;
  padding: 6px 8px 2px;
}
.search svg {
  position: absolute;
  left: 14px;
  top: 11px;
}
.search input {
  padding-left: 23px;
}
.results {
  padding: 2px 8px 4px;
}
.result {
  display: block;
  width: 100%;
  padding: 2px 6px;
  background: transparent;
  border: 0;
  text-align: left;
}
.result:hover {
  background: var(--row-hover);
}
.empty {
  margin: 4px 6px;
  color: var(--faint);
}
section {
  padding: 3px 0;
}
.head {
  padding: 3px 8px 2px;
}
.row-item {
  display: flex;
  align-items: center;
}
.row-item:hover {
  background: var(--row-hover);
}
.row-item.active {
  background: var(--row-selected);
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 4px;
  background: transparent;
  border: 0;
  text-align: left;
}
.main.off {
  color: var(--faint);
}
.count {
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.square {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}
</style>
