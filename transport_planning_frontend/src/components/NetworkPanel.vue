<script setup lang="ts">
import {
  Activity,
  ArrowDownToLine,
  Circle,
  CircleSlash,
  CornerUpRight,
  Eye,
  EyeOff,
  Gauge,
  Lock,
  LockOpen,
  MapPin,
  OctagonX,
  Route,
  Search,
  Signpost,
  Spline,
  SquareDashed,
  TrafficCone,
  Users,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { isDrivable } from '@/core/lanes'
import { matchesNode, matchesWay, type NetObject } from '@/core/netObjects'
import { junctionMovements } from '@/core/topology'
import type { LatLon } from '@/core/types'
import { type SelectedItem, useEditor } from '@/stores/editor'

import TransitPanel from './TransitPanel.vue'

const editor = useEditor()
const query = ref('')
const LIST_LIMIT = 300

type LayerKey = keyof typeof editor.layers

interface Row {
  id: NetObject
  label: string
  icon: typeof Circle
  layers?: LayerKey[]
}

const groups: { title: string; rows: Row[] }[] = [
  {
    title: 'Дорожная сеть',
    rows: [
      { id: 'nodes', label: 'Узлы', icon: Circle },
      { id: 'links', label: 'Отрезки', icon: Spline },
      { id: 'turns', label: 'Повороты', icon: CornerUpRight, layers: ['turnPaths'] },
    ],
  },
  {
    title: 'Общественный транспорт',
    rows: [
      { id: 'stopPoints', label: 'Пункты остановки', icon: MapPin, layers: ['transit'] },
      { id: 'stopAreas', label: 'Зоны остановок', icon: SquareDashed, layers: ['transit'] },
      { id: 'stops', label: 'Остановки', icon: Users, layers: ['transit'] },
      { id: 'routes', label: 'Маршруты', icon: Route, layers: ['transit'] },
    ],
  },
  {
    title: 'Организация движения',
    rows: [
      { id: 'desiredSpeed', label: 'Решения о желаемой скорости', icon: Gauge },
      { id: 'reducedSpeed', label: 'Зоны снижения скорости', icon: CircleSlash },
      { id: 'stopSigns', label: 'Знаки стоп', icon: OctagonX, layers: ['trafficSigns'] },
      { id: 'priorityRules', label: 'Правила приоритета', icon: Signpost },
      { id: 'signals', label: 'Светофоры', icon: TrafficCone, layers: ['signals'] },
      { id: 'detectors', label: 'Детекторы', icon: Activity },
      { id: 'inflows', label: 'Входящие потоки', icon: ArrowDownToLine },
    ],
  },
]

const mapLayers: { key: LayerKey; label: string }[] = [
  { key: 'buildings', label: 'Здания' },
  { key: 'landuse', label: 'Территории и вода' },
  { key: 'minor', label: 'Тротуары и тропы' },
  { key: 'rail', label: 'Железная дорога' },
  { key: 'other', label: 'Прочие линии' },
  { key: 'points', label: 'Точечные объекты' },
  { key: 'arrows', label: 'Стрелки на полосах' },
  { key: 'labels', label: 'Названия улиц' },
  { key: 'issues', label: 'Ошибки на карте' },
]

interface Item {
  key: string
  label: string
  sub?: string
  /** Сколько объектов стоит за строкой: в узле их может быть несколько. */
  weight?: number
  select?: SelectedItem
  position?: LatLon
}

const index = computed<Record<NetObject, Item[]>>(() => {
  void editor.rev
  const result = Object.fromEntries(groups.flatMap((group) => group.rows.map((row) => [row.id, [] as Item[]]))) as Record<NetObject, Item[]>
  const doc = editor.doc
  if (!doc) return result

  for (const node of doc.nodes.values()) {
    for (const type of ['stopPoints', 'stopAreas', 'stopSigns', 'signals', 'desiredSpeed', 'reducedSpeed', 'priorityRules', 'detectors', 'inflows'] as NetObject[]) {
      if (matchesNode(type, node, doc)) {
        result[type].push({ key: `n${node.id}`, label: node.tags?.name ?? `Узел ${node.id}`, sub: String(node.id), select: { kind: 'node', id: node.id }, position: node })
      }
    }
  }

  const network = editor.network
  for (const [id, arms] of network?.arms ?? []) {
    if (arms.length < 3) continue
    const node = doc.nodes.get(id)
    if (!node) continue
    result.nodes.push({ key: `j${id}`, label: `Узел ${id}`, sub: `подходов ${arms.length}`, select: { kind: 'node', id }, position: node })
    if (network) {
      const movements = junctionMovements(doc, network, id).length
      result.turns.push({ key: `t${id}`, label: `Узел ${id}`, sub: `поворотов ${movements}`, weight: movements, select: { kind: 'node', id }, position: node })
    }
  }

  for (const way of doc.ways.values()) {
    const middle = doc.nodes.get(way.nds[Math.floor(way.nds.length / 2)]!)
    if (isDrivable(way.tags)) {
      result.links.push({ key: `w${way.id}`, label: way.tags?.name ?? way.tags?.highway ?? 'Отрезок', sub: String(way.id), select: { kind: 'way', id: way.id }, position: middle })
    }
    if (matchesWay('stopAreas', way)) {
      result.stopAreas.push({ key: `w${way.id}`, label: way.tags?.name ?? `Платформа ${way.id}`, sub: String(way.id), select: { kind: 'way', id: way.id }, position: middle })
    }
  }

  for (const relation of doc.relations.values()) {
    if (relation.tags?.public_transport !== 'stop_area') continue
    const first = relation.members.find(([type, ref]) => type === 'node' && doc.nodes.has(ref))
    result.stops.push({ key: `r${relation.id}`, label: relation.tags.name ?? `Остановка ${relation.id}`, sub: `объектов ${relation.members.length}`, position: first ? doc.nodes.get(first[1]) : undefined })
  }
  return result
})

function countOf(id: NetObject): number {
  if (id === 'routes') return editor.lines.length
  return index.value[id].reduce((sum, item) => sum + (item.weight ?? 1), 0)
}

const activeLabel = computed(() => groups.flatMap((group) => group.rows).find((row) => row.id === editor.activeObject)?.label ?? '')

const items = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const list = index.value[editor.activeObject]
  return needle ? list.filter((item) => `${item.label} ${item.sub ?? ''}`.toLowerCase().includes(needle)) : list
})

function isVisible(row: Row): boolean {
  if (row.layers) return row.layers.every((key) => editor.layers[key])
  return !editor.objectHidden[row.id]
}

function canHide(row: Row): boolean {
  return row.id !== 'links' && row.id !== 'nodes'
}

function toggleVisible(row: Row): void {
  const next = !isVisible(row)
  if (row.layers) for (const key of row.layers) (editor.layers[key] as boolean) = next
  else editor.objectHidden[row.id] = !next
}

function showItem(item: Item): void {
  if (item.select) editor.selectOne(item.select)
  if (item.position) editor.focusOn(item.position, 18)
}

function isSelected(item: Item): boolean {
  return !!item.select && editor.selection.some((entry) => entry.kind === item.select!.kind && entry.id === item.select!.id)
}
</script>

<template>
  <div class="panel-root">
    <div class="objects">
      <section v-for="group in groups" :key="group.title" :aria-label="group.title">
        <div class="eyebrow head">{{ group.title }}</div>
        <div v-for="row in group.rows" :key="row.id" class="row-item" :class="{ active: editor.activeObject === row.id }">
          <button
            class="square"
            :disabled="!canHide(row)"
            :aria-label="canHide(row) ? `${isVisible(row) ? 'Скрыть' : 'Показать'}: ${row.label}` : undefined"
            :title="canHide(row) ? (isVisible(row) ? 'Скрыть на карте' : 'Показать на карте') : undefined"
            @click="toggleVisible(row)"
          >
            <template v-if="canHide(row)">
              <Eye v-if="isVisible(row)" :size="13" />
              <EyeOff v-else :size="13" class="faint" />
            </template>
          </button>
          <button class="main" :class="{ off: !isVisible(row) }" :aria-pressed="editor.activeObject === row.id" @click="editor.setActiveObject(row.id)">
            <component :is="row.icon" :size="14" aria-hidden="true" />
            <span class="ellipsis">{{ row.label }}</span>
            <span class="count">{{ countOf(row.id) }}</span>
          </button>
          <button
            class="square"
            :aria-pressed="!!editor.objectLocked[row.id]"
            :aria-label="`${editor.objectLocked[row.id] ? 'Разрешить' : 'Запретить'} выбор: ${row.label}`"
            :title="editor.objectLocked[row.id] ? 'Выбор запрещён' : 'Запретить выбор на карте'"
            @click="editor.objectLocked[row.id] = !editor.objectLocked[row.id]"
          >
            <Lock v-if="editor.objectLocked[row.id]" :size="12" />
            <LockOpen v-else :size="12" class="faint" />
          </button>
        </div>
      </section>
      <details class="layers">
        <summary class="eyebrow">Слои карты</summary>
        <label v-for="layer in mapLayers" :key="layer.key" class="layer">
          <input v-model="editor.layers[layer.key]" type="checkbox" />
          {{ layer.label }}
        </label>
      </details>
    </div>

    <div class="list">
      <div class="list-head eyebrow">{{ activeLabel }}</div>
      <TransitPanel v-if="editor.activeObject === 'routes'" />
      <template v-else>
        <div class="search">
          <Search :size="13" class="faint" aria-hidden="true" />
          <input v-model="query" class="input" placeholder="Найти" aria-label="Найти объект" />
        </div>
        <div class="rows">
          <button v-for="item in items.slice(0, LIST_LIMIT)" :key="item.key" class="item" :class="{ selected: isSelected(item) }" @click="showItem(item)">
            <span class="ellipsis">{{ item.label }}</span>
            <span class="sub">{{ item.sub }}</span>
          </button>
          <p v-if="items.length === 0" class="empty">Объектов нет. Включите вставку (Insert) и добавьте на карте</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.panel-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.objects {
  flex: none;
  max-height: 62%;
  overflow-y: auto;
  border-bottom: 1px solid var(--line-strong);
}
.list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.list-head {
  flex: none;
  padding: 5px 8px 2px;
}
.search {
  position: relative;
  flex: none;
  padding: 2px 8px 4px;
}
.search svg {
  position: absolute;
  left: 14px;
  top: 7px;
}
.search input {
  padding-left: 23px;
}
.rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 2px 8px;
  background: transparent;
  border: 0;
  text-align: left;
}
.item:hover {
  background: var(--row-hover);
}
.item.selected {
  background: var(--row-selected);
}
.sub {
  flex: none;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.empty {
  margin: 6px 8px;
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
.layers {
  padding: 3px 8px 6px;
}
.layers summary {
  cursor: pointer;
}
.layer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
}
</style>
