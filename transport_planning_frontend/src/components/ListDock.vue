<script setup lang="ts">
import { ArrowDown, ArrowUp, Download, Search, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { isDrivable, isOneway, parseProfile, withLanes } from '@/core/lanes'
import { parseSignalPlan } from '@/core/signals'
import { TRANSIT_MODE_LABELS } from '@/core/transit'
import { LOS_LABELS, parseSpeed } from '@/sim/macro'
import { type ListTab, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()

const MAX_ROWS = 400

type Cell = string | number | null

interface Column {
  key: string
  label: string
  numeric?: boolean
  /** Ячейку можно править прямо в таблице. */
  editable?: boolean
  width?: string
}

type Row = Record<string, Cell> & { _id: number }

const tabs: { id: ListTab; label: string }[] = [
  { id: 'links', label: 'Отрезки' },
  { id: 'nodes', label: 'Узлы' },
  { id: 'signals', label: 'Светофоры' },
  { id: 'lines', label: 'Линии ОТ' },
  { id: 'stops', label: 'Остановки' },
  { id: 'zones', label: 'Районы' },
  { id: 'matrix', label: 'Корреспонденции' },
]

const columnsByTab: Record<ListTab, Column[]> = {
  links: [
    { key: '_id', label: 'Номер', numeric: true, width: '96px' },
    { key: 'name', label: 'Название', editable: true },
    { key: 'type', label: 'Тип', width: '110px' },
    { key: 'dir', label: 'Напр.', width: '52px' },
    { key: 'lanes', label: 'Полос', numeric: true, editable: true, width: '56px' },
    { key: 'maxspeed', label: 'V доп.', editable: true, numeric: true, width: '62px' },
    { key: 'length', label: 'Длина, м', numeric: true, width: '66px' },
    { key: 'volume', label: 'Поток, авт/ч', numeric: true, width: '84px' },
    { key: 'capacity', label: 'Пропуск., авт/ч', numeric: true, width: '96px' },
    { key: 'vc', label: 'Загрузка, %', numeric: true, width: '80px' },
    { key: 'speed', label: 'V тек., км/ч', numeric: true, width: '78px' },
    { key: 'los', label: 'Уровень', width: '56px' },
  ],
  nodes: [
    { key: '_id', label: 'Номер', numeric: true, width: '110px' },
    { key: 'name', label: 'Улицы' },
    { key: 'arms', label: 'Подходов', numeric: true, width: '70px' },
    { key: 'control', label: 'Управление', width: '110px' },
    { key: 'restrictions', label: 'Запретов', numeric: true, width: '70px' },
  ],
  signals: [
    { key: '_id', label: 'Узел', numeric: true, width: '110px' },
    { key: 'name', label: 'Улицы' },
    { key: 'plan', label: 'План', width: '110px' },
    { key: 'phases', label: 'Фаз', numeric: true, width: '50px' },
    { key: 'cycle', label: 'Цикл, с', numeric: true, width: '64px' },
  ],
  lines: [
    { key: 'ref', label: 'Номер', width: '60px' },
    { key: 'mode', label: 'Вид', width: '90px' },
    { key: 'name', label: 'Название' },
    { key: 'interval', label: 'Интервал, мин', numeric: true, width: '90px' },
    { key: 'stops', label: 'Остановок', numeric: true, width: '70px' },
    { key: 'length', label: 'На участке, км', numeric: true, width: '96px' },
    { key: 'time', label: 'Время, мин', numeric: true, width: '76px' },
    { key: 'speed', label: 'Скорость, км/ч', numeric: true, width: '96px' },
  ],
  stops: [
    { key: '_id', label: 'Узел', numeric: true, width: '110px' },
    { key: 'name', label: 'Название' },
    { key: 'lines', label: 'Линий', numeric: true, width: '60px' },
    { key: 'refs', label: 'Маршруты' },
  ],
  zones: [
    { key: '_id', label: 'Номер', numeric: true, width: '60px' },
    { key: 'name', label: 'Название' },
    { key: 'kind', label: 'Тип', width: '130px' },
    { key: 'residents', label: 'Жители', numeric: true, width: '80px' },
    { key: 'jobs', label: 'Раб. места', numeric: true, width: '80px' },
    { key: 'production', label: 'Отправление, авт/ч', numeric: true, width: '120px' },
    { key: 'attraction', label: 'Прибытие, авт/ч', numeric: true, width: '110px' },
  ],
  matrix: [
    { key: 'from', label: 'Откуда' },
    { key: 'to', label: 'Куда' },
    { key: 'trips', label: 'Поездок в час', numeric: true, width: '100px' },
    { key: 'routes', label: 'Маршрутов', numeric: true, width: '76px' },
  ],
}

const search = ref('')
const sortKey = ref<string | null>(null)
const sortDown = ref(true)

watch(
  () => editor.listTab,
  () => {
    sortKey.value = null
    search.value = ''
  },
)

const columns = computed(() => columnsByTab[editor.listTab])

function nodeNames(id: number): string {
  const doc = editor.doc
  if (!doc) return ''
  const names = [...new Set(doc.waysOfNode(id).map((wayId) => doc.ways.get(wayId)?.tags?.name).filter(Boolean))]
  return names.join(' / ')
}

function linkRows(): Row[] {
  const doc = editor.doc
  if (!doc) return []
  const worst = new Map<number, { volume: number; capacity: number; vc: number; speed: number; los: number }>()
  for (const load of sim.macro?.loads.values() ?? []) {
    const id = load.edge.wayId
    const current = worst.get(id)
    if (!current || load.vc > current.vc) {
      worst.set(id, { volume: load.volume + load.transitPcu, capacity: load.capacity, vc: load.vc, speed: load.speedKmh, los: load.los })
    }
  }
  const projector = editor.projector!
  const rows: Row[] = []
  for (const way of doc.ways.values()) {
    if (!isDrivable(way.tags) || editor.hidden.ways.has(way.id)) continue
    const tags = way.tags ?? {}
    const profile = parseProfile(tags)
    let length = 0
    for (let i = 1; i < way.nds.length; i++) {
      const a = doc.nodes.get(way.nds[i - 1]!)
      const b = doc.nodes.get(way.nds[i]!)
      if (a && b) {
        const pa = projector.toXY(a)
        const pb = projector.toXY(b)
        length += Math.hypot(pa.x - pb.x, pa.y - pb.y)
      }
    }
    const result = worst.get(way.id)
    rows.push({
      _id: way.id,
      name: tags.name ?? '',
      type: tags.highway ?? '',
      dir: isOneway(tags) ? '→' : '↔',
      lanes: profile.forward + profile.backward,
      maxspeed: tags.maxspeed ?? parseSpeed(undefined, tags.highway ?? 'road'),
      length: Math.round(length),
      volume: result ? Math.round(result.volume) : null,
      capacity: result ? Math.round(result.capacity) : null,
      vc: result ? Math.round(result.vc * 100) : null,
      speed: result ? Math.round(result.speed) : null,
      los: result ? (LOS_LABELS[result.los] ?? null) : null,
    })
  }
  return rows
}

const rows = computed<Row[]>(() => {
  void editor.rev
  void sim.macro
  const doc = editor.doc
  if (!doc) return []
  switch (editor.listTab) {
    case 'links':
      return linkRows()
    case 'nodes': {
      const network = editor.network
      if (!network) return []
      const result: Row[] = []
      for (const [id, arms] of network.arms) {
        if (arms.length < 2) continue
        const restrictions = [...doc.relations.values()].filter(
          (relation) => relation.tags?.type === 'restriction' && relation.members.some(([type, ref, role]) => type === 'node' && ref === id && role === 'via'),
        ).length
        result.push({
          _id: id,
          name: nodeNames(id),
          arms: arms.length,
          control: doc.nodes.get(id)?.tags?.highway === 'traffic_signals' ? 'Светофор' : arms.length >= 3 ? 'Без светофора' : 'Стык',
          restrictions,
        })
      }
      return result
    }
    case 'signals':
      return [...doc.nodes.values()]
        .filter((node) => node.tags?.highway === 'traffic_signals')
        .map((node) => {
          const plan = parseSignalPlan(node.tags)
          const cycle = plan ? plan.phases.reduce((sum, phase) => sum + phase.green + plan.yellow + plan.allRed, 0) : null
          return {
            _id: node.id,
            name: nodeNames(node.id),
            plan: plan ? 'Свой' : 'Автоматический',
            phases: plan?.phases.length ?? null,
            cycle,
          }
        })
    case 'lines':
      return editor.lines.map((line) => {
        const result = sim.macro?.lines.find((item) => item.service.line.id === line.id)
        return {
          _id: line.id,
          ref: line.ref,
          mode: TRANSIT_MODE_LABELS[line.mode],
          name: line.name,
          interval: line.interval,
          stops: line.stops.length,
          length: Number((line.lengthM / 1000).toFixed(2)),
          time: result ? Math.round(result.timeS / 60) : null,
          speed: result ? Math.round(result.speedKmh) : null,
        }
      })
    case 'stops': {
      const byNode = new Map<number, { name: string; refs: Set<string> }>()
      for (const line of editor.lines) {
        for (const stop of line.stops) {
          const entry = byNode.get(stop.node) ?? { name: stop.name, refs: new Set<string>() }
          entry.refs.add(line.ref)
          byNode.set(stop.node, entry)
        }
      }
      return [...byNode.entries()].map(([id, entry]) => ({
        _id: id,
        name: entry.name,
        lines: entry.refs.size,
        refs: [...entry.refs].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })).join(', '),
      }))
    }
    case 'zones':
      return (sim.macro?.zones ?? []).map((zone) => ({
        _id: zone.id,
        name: zone.label,
        kind: zone.kind === 'gateway' ? 'Въезд на границе' : zone.userWay !== undefined ? 'Район (задан)' : 'Район по застройке',
        residents: zone.residents ?? '',
        jobs: zone.jobs ?? '',
        production: Math.round(zone.production),
        attraction: Math.round(zone.attraction),
      }))
    default:
      return (sim.macro?.flows ?? []).map((flow, index) => ({
        _id: index,
        from: flow.from.label,
        to: flow.to.label,
        trips: Math.round(flow.trips),
        routes: flow.routes.length,
      }))
  }
})

const needsCalculation = computed(
  () => !sim.macro && (editor.listTab === 'zones' || editor.listTab === 'matrix'),
)

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  let result = rows.value
  if (needle) {
    result = result.filter((row) =>
      columns.value.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle)),
    )
  }
  const key = sortKey.value
  if (key) {
    const direction = sortDown.value ? -1 : 1
    result = [...result].sort((a, b) => {
      const x = a[key] ?? null
      const y = b[key] ?? null
      if (x === null) return 1
      if (y === null) return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction
      return String(x).localeCompare(String(y), 'ru', { numeric: true }) * direction
    })
  }
  return result
})

const shown = computed(() => filtered.value.slice(0, MAX_ROWS))

function sortBy(key: string): void {
  if (sortKey.value === key) sortDown.value = !sortDown.value
  else {
    sortKey.value = key
    sortDown.value = true
  }
}

function isSelected(row: Row): boolean {
  if (editor.listTab === 'links') return editor.selection.some((item) => item.kind === 'way' && item.id === row._id)
  if (editor.listTab === 'lines') return editor.selectedLineId === row._id
  if (editor.listTab === 'nodes' || editor.listTab === 'signals' || editor.listTab === 'stops') {
    return editor.selection.some((item) => item.kind === 'node' && item.id === row._id)
  }
  return false
}

function activate(row: Row): void {
  switch (editor.listTab) {
    case 'links':
      editor.focusWay(row._id)
      break
    case 'nodes':
    case 'signals':
    case 'stops':
      editor.focusNode(row._id)
      break
    case 'lines':
      editor.focusLine(row._id)
      editor.leftTab = 'transit'
      editor.navigatorOpen = true
      break
    case 'zones': {
      const zone = sim.macro?.zones[row._id]
      const node = zone && editor.doc?.nodes.get(zone.node)
      if (node) editor.focusOn(node, 16.5)
      break
    }
  }
}

function openJunction(row: Row): void {
  if (editor.listTab === 'nodes' || editor.listTab === 'signals') editor.openJunction(row._id)
}

function editCell(row: Row, key: string, event: Event): void {
  const way = editor.doc?.ways.get(row._id)
  if (!way) return
  const raw = (event.target as HTMLInputElement).value.trim()
  const tags = { ...way.tags }
  if (key === 'name') {
    if (raw) tags.name = raw
    else delete tags.name
    editor.updateWayTags(way.id, tags, 'Название дороги')
  } else if (key === 'maxspeed') {
    if (raw) tags.maxspeed = raw
    else delete tags.maxspeed
    editor.updateWayTags(way.id, tags, 'Скорость')
  } else if (key === 'lanes') {
    const lanes = Number.parseInt(raw, 10)
    if (!Number.isFinite(lanes) || lanes < 1) {
      editor.toast('Число полос должно быть целым и больше нуля', 'error')
      return
    }
    const profile = parseProfile(tags)
    if (profile.oneway) {
      const reversed = profile.forward === 0
      editor.updateWayTags(way.id, withLanes(tags, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос')
    } else {
      const forward = Math.max(1, Math.ceil(lanes / 2))
      editor.updateWayTags(way.id, withLanes(tags, forward, Math.max(1, lanes - forward)), 'Число полос')
    }
  }
}

function csvCell(value: Cell): string {
  const text = String(value ?? '')
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Таблица для Excel: разделитель и метка кодировки, которые он понимает без настройки. */
function exportCsv(): void {
  const header = columns.value.map((column) => csvCell(column.label)).join(';')
  const body = filtered.value.map((row) => columns.value.map((column) => csvCell(row[column.key] ?? null)).join(';'))
  const blob = new Blob(['﻿', [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${editor.listTab}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <section class="lists" aria-label="Списки">
    <div class="head">
      <div class="dock-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          role="tab"
          :class="{ active: editor.listTab === tab.id }"
          :aria-selected="editor.listTab === tab.id"
          @click="editor.listTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="tools">
        <span class="faint count">{{ filtered.length }}<template v-if="filtered.length > MAX_ROWS"> (показано {{ MAX_ROWS }})</template></span>
        <div class="search">
          <Search :size="12" class="faint" aria-hidden="true" />
          <input v-model="search" class="input" placeholder="Поиск в списке" aria-label="Поиск в списке" />
        </div>
        <button class="btn ghost small" title="Сохранить таблицу в CSV" aria-label="Сохранить таблицу в CSV" @click="exportCsv"><Download :size="13" /></button>
        <button class="btn ghost small" title="Закрыть списки" aria-label="Закрыть списки" @click="editor.listOpen = false"><X :size="13" /></button>
      </div>
    </div>

    <div class="table-wrap">
      <p v-if="needsCalculation" class="empty muted">
        Появится после расчёта. Откройте режим «Симуляция» на панели инструментов.
      </p>
      <table v-else>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="{ numeric: column.numeric }"
              :style="{ width: column.width }"
              :aria-sort="sortKey === column.key ? (sortDown ? 'descending' : 'ascending') : 'none'"
            >
              <button @click="sortBy(column.key)">
                {{ column.label }}
                <ArrowDown v-if="sortKey === column.key && sortDown" :size="11" aria-hidden="true" />
                <ArrowUp v-else-if="sortKey === column.key" :size="11" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in shown"
            :key="`${editor.listTab}-${row._id}`"
            :class="{ selected: isSelected(row) }"
            @click="activate(row)"
            @dblclick="openJunction(row)"
          >
            <td v-for="column in columns" :key="column.key" :class="{ numeric: column.numeric, los: column.key === 'los' }">
              <input
                v-if="column.editable"
                class="cell-input"
                :class="{ numeric: column.numeric }"
                :value="row[column.key] ?? ''"
                :aria-label="`${column.label} для ${row._id}`"
                @click.stop
                @change="editCell(row, column.key, $event)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <template v-else>{{ row[column.key] ?? '—' }}</template>
            </td>
          </tr>
          <tr v-if="shown.length === 0">
            <td :colspan="columns.length" class="empty muted">Нет объектов</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.lists {
  display: flex;
  flex-direction: column;
  flex: none;
  height: 226px;
  background: var(--panel);
  border-top: 1px solid var(--line-strong);
}
.head {
  display: flex;
  align-items: stretch;
  background: var(--titlebar);
  border-bottom: 1px solid var(--line-strong);
}
.head .dock-tabs {
  flex: 1;
  min-width: 0;
  border-bottom: 0;
}
.tools {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 4px;
}
.count {
  padding: 0 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.search {
  position: relative;
  width: 150px;
}
.search svg {
  position: absolute;
  left: 5px;
  top: 5px;
}
.search input {
  padding-left: 21px;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--raised);
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th {
  position: sticky;
  top: 0;
  padding: 0;
  background: var(--titlebar);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line-strong);
  z-index: 1;
}
th button {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 2px 5px;
  background: transparent;
  border: 0;
  font-weight: 600;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}
th.numeric button {
  justify-content: flex-end;
}
td {
  padding: 1px 5px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 16px;
}
td.numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
td.los {
  font-weight: 600;
  text-align: center;
}
tbody tr {
  cursor: default;
}
tbody tr:hover {
  background: var(--row-hover);
}
tbody tr.selected {
  background: var(--row-selected);
}
.cell-input {
  width: 100%;
  height: 16px;
  padding: 0;
  background: transparent;
  border: 0;
  font-size: 11px;
}
.cell-input.numeric {
  text-align: right;
}
.cell-input:hover {
  background: var(--inset);
}
.cell-input:focus {
  outline: 1px solid var(--select);
  background: var(--field-bg);
}
.empty {
  margin: 0;
  padding: 10px;
  text-align: center;
}
</style>
