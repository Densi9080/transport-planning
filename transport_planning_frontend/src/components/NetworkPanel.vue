<script setup lang="ts">
import {
  Bus,
  ChevronRight,
  Circle,
  CornerDownRight,
  Eye,
  EyeOff,
  Hexagon,
  MapPin,
  Search,
  Spline,
  TrafficCone,
} from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'

import { isDrivable } from '@/core/lanes'
import { type ActiveType, type ListTab, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()
const query = ref('')
const open = reactive({ roads: true, junctions: false, signals: false })

type LayerKey = keyof typeof editor.layers

interface NetworkObject {
  id: string
  label: string
  count: number
  icon: typeof Circle
  active?: ActiveType
  list?: ListTab
  layers?: LayerKey[]
}

const roads = computed(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return []
  const groups = new Map<string, number[]>()
  for (const way of doc.ways.values()) {
    if (!isDrivable(way.tags)) continue
    const name = way.tags?.name ?? 'Без названия'
    const list = groups.get(name)
    if (list) list.push(way.id)
    else groups.set(name, [way.id])
  }
  const needle = query.value.trim().toLowerCase()
  return [...groups.entries()]
    .map(([name, wayIds]) => ({ name, wayIds }))
    .filter((group) => !needle || group.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.name === 'Без названия' ? 1 : b.name === 'Без названия' ? -1 : a.name.localeCompare(b.name, 'ru')))
})

const signals = computed(() => {
  void editor.rev
  const doc = editor.doc
  return doc ? [...doc.nodes.values()].filter((node) => node.tags?.highway === 'traffic_signals') : []
})

const junctions = computed(() => {
  const network = editor.network
  const doc = editor.doc
  if (!network || !doc) return []
  const result: { id: number; degree: number; title: string }[] = []
  for (const [id, arms] of network.arms) {
    if (arms.length < 3) continue
    const names = [...new Set(arms.map((arm) => doc.ways.get(arm.link.wayId)?.tags?.name).filter(Boolean))]
    result.push({ id, degree: arms.length, title: names.slice(0, 2).join(' / ') || `Узел ${id}` })
  }
  return result.sort((a, b) => b.degree - a.degree)
})

const objects = computed<NetworkObject[]>(() => {
  void editor.rev
  const doc = editor.doc
  const drivable = doc ? [...doc.ways.values()].filter((way) => isDrivable(way.tags)).length : 0
  const stops = new Set(editor.lines.flatMap((line) => line.stops.map((stop) => stop.node)))
  const net = sim.net
  return [
    { id: 'nodes', label: 'Узлы', count: junctions.value.length, icon: Circle, active: 'nodes', list: 'nodes' },
    { id: 'links', label: 'Отрезки', count: drivable, icon: Spline, active: 'links', list: 'links' },
    { id: 'turns', label: 'Повороты', count: net?.connectors.length ?? 0, icon: CornerDownRight, list: 'links', layers: ['turnPaths'] },
    { id: 'signals', label: 'Светофоры', count: signals.value.length, icon: TrafficCone, active: 'nodes', list: 'signals', layers: ['signals'] },
    { id: 'zones', label: 'Районы', count: sim.macro?.zones.length ?? 0, icon: Hexagon, list: 'zones' },
    { id: 'lines', label: 'Линии ОТ', count: editor.lines.length, icon: Bus, list: 'lines', layers: ['transit'] },
    { id: 'stops', label: 'Остановки', count: stops.size, icon: MapPin, list: 'stops', layers: ['transit'] },
  ]
})

const activeObject = ref('auto')

function activate(item: NetworkObject): void {
  activeObject.value = item.id
  editor.activeType = item.active ?? 'auto'
  if (item.list) {
    editor.listOpen = true
    editor.listTab = item.list
  }
  if (item.id === 'lines' || item.id === 'stops') editor.leftTab = 'transit'
}

function isVisible(item: NetworkObject): boolean {
  return (item.layers ?? []).every((key) => editor.layers[key])
}

function toggleVisible(item: NetworkObject): void {
  const next = !isVisible(item)
  for (const key of item.layers ?? []) (editor.layers[key] as boolean) = next
}
</script>

<template>
  <section class="objects" aria-label="Сетевые объекты">
    <div class="eyebrow head">Сетевые объекты</div>
    <div
      v-for="item in objects"
      :key="item.id"
      class="object"
      :class="{ active: activeObject === item.id }"
    >
      <button class="main" :aria-pressed="activeObject === item.id" @click="activate(item)">
        <component :is="item.icon" :size="14" aria-hidden="true" />
        <span class="ellipsis">{{ item.label }}</span>
        <span class="count">{{ item.count }}</span>
      </button>
      <button
        v-if="item.layers"
        class="eye"
        :aria-label="`${isVisible(item) ? 'Скрыть' : 'Показать'}: ${item.label}`"
        :title="isVisible(item) ? 'Скрыть на карте' : 'Показать на карте'"
        @click="toggleVisible(item)"
      >
        <Eye v-if="isVisible(item)" :size="13" />
        <EyeOff v-else :size="13" class="faint" />
      </button>
    </div>
    <button class="reset faint" :class="{ on: editor.activeType === 'auto' }" @click="(activeObject = 'auto'), (editor.activeType = 'auto')">
      Выбирать и узлы, и отрезки
    </button>
  </section>

  <section class="section">
    <div class="search">
      <Search :size="13" class="faint" aria-hidden="true" />
      <input v-model="query" class="input" placeholder="Поиск улицы" aria-label="Поиск улицы" />
    </div>

    <button class="group" :aria-expanded="open.roads" @click="open.roads = !open.roads">
      <ChevronRight :size="13" :class="{ turned: open.roads }" aria-hidden="true" />
      Дороги <span class="faint">{{ roads.length }}</span>
    </button>
    <template v-if="open.roads">
      <button v-for="group in roads" :key="group.name" class="item" @click="editor.focusWay(group.wayIds[0]!)">
        <span class="ellipsis">{{ group.name }}</span>
        <span class="faint">{{ group.wayIds.length }}</span>
      </button>
      <p v-if="roads.length === 0" class="empty">Ничего не найдено</p>
    </template>

    <button class="group" :aria-expanded="open.junctions" @click="open.junctions = !open.junctions">
      <ChevronRight :size="13" :class="{ turned: open.junctions }" aria-hidden="true" />
      Перекрёстки <span class="faint">{{ junctions.length }}</span>
    </button>
    <template v-if="open.junctions">
      <button v-for="item in junctions.slice(0, 100)" :key="item.id" class="item" @click="editor.focusNode(item.id)">
        <span class="ellipsis">{{ item.title }}</span>
        <span class="faint">{{ item.degree }}</span>
      </button>
    </template>

    <button class="group" :aria-expanded="open.signals" @click="open.signals = !open.signals">
      <ChevronRight :size="13" :class="{ turned: open.signals }" aria-hidden="true" />
      Светофоры <span class="faint">{{ signals.length }}</span>
    </button>
    <template v-if="open.signals">
      <button v-for="node in signals" :key="node.id" class="item" @click="editor.focusNode(node.id)">
        Узел {{ node.id }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.objects {
  padding: 4px 0 6px;
}
.head {
  padding: 2px 8px 4px;
}
.object {
  display: flex;
  align-items: center;
}
.object:hover {
  background: var(--row-hover);
}
.object.active {
  background: var(--row-selected);
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 4px 3px 10px;
  background: transparent;
  border: 0;
  text-align: left;
}
.count {
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.eye {
  display: grid;
  place-items: center;
  width: 24px;
  height: 22px;
  background: transparent;
  border: 0;
}
.reset {
  margin: 4px 8px 0;
  padding: 0;
  background: transparent;
  border: 0;
  font-size: 11px;
  text-decoration: underline;
}
.reset.on {
  text-decoration: none;
}
.section {
  gap: 1px;
}
.search {
  position: relative;
  margin-bottom: 4px;
}
.search svg {
  position: absolute;
  left: 6px;
  top: 5px;
}
.search input {
  padding-left: 23px;
}
.group {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 3px 2px;
  background: transparent;
  border: 0;
  font-weight: 600;
  text-align: left;
}
.group:hover {
  background: var(--row-hover);
}
.group svg {
  flex: none;
  transition: transform 0.1s;
}
.group svg.turned {
  transform: rotate(90deg);
}
.group > .faint {
  margin-left: auto;
  font-weight: 400;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 2px 6px 2px 20px;
  background: transparent;
  border: 0;
  text-align: left;
}
.item:hover {
  background: var(--row-hover);
}
.empty {
  margin: 4px 20px;
  color: var(--faint);
}
</style>
