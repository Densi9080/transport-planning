import type { OsmDoc } from '@/core/doc'
import { dist, pointInPolygon } from '@/core/geo'
import { totalWidth } from '@/core/lanes'
import { greenShare } from '@/core/signals'
import type { XY } from '@/core/types'
import { countedVolume, M2_PER_JOB, M2_PER_RESIDENT, readUserZones, zoneContaining } from '@/core/zones'

import { classRank, type SimEdge, type SimNet } from './net'
import type { TransitService } from './transit'

/**
 * Макроуровень: загрузка сети за час без отдельных машин.
 * Пропускная способность считается по атрибутам дороги, спрос — по границам сети и зданиям,
 * распределение потоков — методом последовательных приближений с функцией BPR.
 */

export type Period = 'morning' | 'midday' | 'evening'

export interface MacroParams {
  period: Period
  /** Множитель спроса. */
  demand: number
}

export interface CapacityFactor {
  label: string
  value: string
}

export interface EdgeLoad {
  edge: SimEdge
  capacity: number
  freeSpeedKmh: number
  freeTimeS: number
  nodeDelayS: number
  volume: number
  /** Поток транспорта общего пользования, приведённые авт/ч. */
  transitPcu: number
  /** Автобусов и троллейбусов в час. */
  busesPerHour: number
  vc: number
  /** Интенсивность, введённая вручную по полосам, авт/ч: для сравнения с расчётом. */
  counted: number | null
  timeS: number
  speedKmh: number
  los: number
  factors: CapacityFactor[]
}

export interface Zone {
  id: number
  node: number
  kind: 'gateway' | 'internal'
  production: number
  attraction: number
  position: XY
  label: string
  /** Граница и центр района: только у районов из застройки, у въездов на границе их нет. */
  outline?: XY[]
  center?: XY
  /** Район задан вручную контуром tp:type=zone: его жители и рабочие места. */
  userWay?: number
  residents?: number
  jobs?: number
}

export interface OdRoute {
  edges: SimEdge[]
}

export interface OdFlow {
  from: Zone
  to: Zone
  /** Поездок в час. */
  trips: number
  routes: OdRoute[]
}

export interface LineResult {
  service: TransitService
  freeTimeS: number
  timeS: number
  speedKmh: number
  /** Самый загруженный участок маршрута. */
  worstVc: number
}

export interface MacroResult {
  params: MacroParams
  loads: Map<SimEdge, EdgeLoad>
  zones: Zone[]
  flows: OdFlow[]
  lines: LineResult[]
  totals: {
    trips: number
    unservedTrips: number
    vehKm: number
    vehHours: number
    avgSpeedKmh: number
    delayHours: number
    congestedKm: number
    totalKm: number
    losShares: number[]
  }
}

const BASE_CAPACITY: Record<string, number> = {
  motorway: 1900,
  trunk: 1700,
  primary: 1500,
  secondary: 1200,
  tertiary: 900,
  unclassified: 700,
  residential: 500,
  road: 500,
  living_street: 250,
  service: 300,
}
const LINK_CAPACITY = 1100

const DEFAULT_SPEED: Record<string, number> = {
  motorway: 110,
  trunk: 90,
  primary: 60,
  secondary: 60,
  tertiary: 50,
  unclassified: 40,
  residential: 40,
  road: 40,
  living_street: 20,
  service: 20,
}

const NAMED_SPEED: Record<string, number> = {
  'RU:urban': 60,
  'RU:rural': 90,
  'RU:living_street': 20,
  'RU:motorway': 110,
  walk: 5,
}

const UNPAVED = new Set(['unpaved', 'gravel', 'dirt', 'ground', 'sand', 'grass', 'compacted', 'fine_gravel'])

const BPR_ALPHA = 0.15
const BPR_BETA = 4
const MSA_ITERATIONS = 8
const FREE_FLOW_SHARE = 0.9
const PCU_PER_BUS = 2.5
const STOP_DWELL_S = 20
const MINOR_APPROACH_SHARE = 0.7
const MINOR_DELAY_S = 5
const TURN_DELAY_S = { left: 6, right: 3, through: 0, reverse: 12 }
const GRID_M = 280
const GRAVITY_BETA_PER_M = 0.00035
const MIN_TRIPS = 1
const ZONE_SEARCH_M = 220
const MAX_ROUTES_PER_OD = 3
const GATEWAY_MIN_RANK = 4
const ZONE_MIN_RANK = 3

/** Спрос: поездок в час с м² площади зданий в час пик. */
const RESIDENTIAL_TRIPS_PER_M2 = 0.0035
const JOB_TRIPS_PER_M2 = 0.005
const DEFAULT_LEVELS = 4
const GATEWAY_SHARE = 0.36
/** Транзит: въезды тяготеют друг к другу сильнее, чем к районам внутри сети. */
const THROUGH_WEIGHT = 3.5
/** Выше этой загрузки поток стоит в очереди, и формула BPR перестаёт что-либо описывать. */
const BPR_VC_LIMIT = 2.2

export const LOS_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const LOS_TITLES = [
  'Свободно',
  'Легко',
  'Плотно',
  'Тяжело',
  'На пределе',
  'Пробка',
] as const
const VC_THRESHOLDS = [0.35, 0.55, 0.75, 0.9, 1]

export function losFromVc(vc: number): number {
  for (let i = 0; i < VC_THRESHOLDS.length; i++) if (vc < VC_THRESHOLDS[i]!) return i
  return 5
}

export function parseSpeed(value: string | undefined, highway: string): number {
  const fallback = DEFAULT_SPEED[highway.replace('_link', '')] ?? 40
  if (!value) return fallback
  const named = NAMED_SPEED[value]
  if (named) return named
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return value.includes('mph') ? number * 1.609 : number
}

/** Доля зелёного и цикл светофора на выезде с участка: берётся лучший манёвр подхода. */
function signalOf(edge: SimEdge): { share: number; cycle: number } | null {
  let best: { share: number; cycle: number } | null = null
  for (const lane of edge.lanes) {
    for (const connector of lane.connectors) {
      const group = connector.signal
      if (!group) continue
      const share = greenShare(group.plan, connector.phases)
      if (!best || share > best.share) best = { share, cycle: group.cycle }
    }
  }
  return best
}

/** Пропускная способность и свободная скорость направления: всё берётся из атрибутов УДС. */
export function edgeBaseLoad(doc: OsmDoc, net: SimNet, edge: SimEdge): EdgeLoad {
  const tags = edge.tags
  const highway = tags.highway ?? 'road'
  const lanes = edge.laneCount
  const laneWidth = edge.link.profile.laneWidth
  const perLane = highway.endsWith('_link') ? LINK_CAPACITY : (BASE_CAPACITY[highway] ?? 500)
  const factors: CapacityFactor[] = [
    { label: `Полосы: ${lanes} × ${perLane} авт/ч (${highway})`, value: `${lanes * perLane}` },
  ]
  let capacity = lanes * perLane

  const apply = (share: number, label: string) => {
    capacity *= share
    factors.push({ label, value: `×${share.toFixed(2)}` })
  }
  if (laneWidth < 2.75) apply(0.8, `Узкая полоса: ${laneWidth.toFixed(2)} м`)
  else if (laneWidth < 3.25) apply(0.92, `Полоса ${laneWidth.toFixed(2)} м`)
  if (tags.surface && UNPAVED.has(tags.surface)) apply(0.7, `Покрытие: ${tags.surface}`)
  if (tags.incline && /^-?\d/.test(tags.incline) && Math.abs(Number.parseFloat(tags.incline)) >= 6) {
    apply(0.9, `Уклон: ${tags.incline}`)
  }

  const speed = parseSpeed(tags.maxspeed, highway)
  let nodeDelay = 0
  const signal = signalOf(edge)
  if (signal) {
    apply(Math.max(signal.share, 0.05), `Светофор: зелёный ${Math.round(signal.share * 100)}% цикла ${signal.cycle} с`)
    // Средняя задержка равномерно прибывающего потока по Вебстеру
    nodeDelay = (signal.cycle * (1 - signal.share) ** 2) / 2
  } else {
    const rank = classRank(tags)
    const others = (net.outgoing.get(edge.to) ?? []).filter((other) => other.wayId !== edge.wayId)
    const major = others.some((other) => classRank(other.tags) > rank)
    if (major) {
      apply(MINOR_APPROACH_SHARE, 'Выезд на главную: уступает дорогу')
      nodeDelay = MINOR_DELAY_S
    }
  }

  const freeSpeedKmh = speed * FREE_FLOW_SHARE
  const freeTimeS = edge.length / (freeSpeedKmh / 3.6)
  const cap = Math.max(capacity, 50)
  return {
    edge,
    capacity: cap,
    freeSpeedKmh,
    freeTimeS,
    nodeDelayS: nodeDelay,
    volume: 0,
    transitPcu: 0,
    busesPerHour: 0,
    vc: 0,
    counted: countedVolume(edge.tags, edge.forward),
    timeS: freeTimeS + nodeDelay,
    speedKmh: freeSpeedKmh,
    los: 0,
    factors,
  }
}

export function buildingFloorArea(doc: OsmDoc, nds: number[], projector: SimNet['projector'], levelsTag: string | undefined): { area: number; center: XY } {
  const points = nds.map((id) => doc.nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => projector.toXY(n))
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    area += a.x * b.y - b.x * a.y
    cx += a.x
    cy += a.y
  }
  const count = Math.max(1, points.length - 1)
  const levels = Number.parseFloat(levelsTag ?? '')
  return {
    area: (Math.abs(area) / 2) * (Number.isFinite(levels) && levels > 0 ? levels : DEFAULT_LEVELS),
    center: { x: cx / count, y: cy / count },
  }
}

export const RESIDENTIAL_TYPES = new Set(['apartments', 'residential', 'house', 'detached', 'terrace', 'dormitory', 'semidetached_house'])
export const JOB_TYPES = new Set([
  'commercial', 'retail', 'office', 'university', 'school', 'college', 'kindergarten', 'hospital', 'public',
  'government', 'industrial', 'warehouse', 'civic', 'supermarket', 'hotel',
])

/**
 * Рёбра связного ядра сети: откуда можно доехать до большинства и куда можно вернуться.
 * Районы подключаются только к нему, иначе их поездкам просто некуда ехать.
 */
function coreEdges(net: SimNet): Set<SimEdge> {
  const backward = new Map<SimEdge, SimEdge[]>()
  for (const edge of net.edges) {
    for (const next of edge.moves.keys()) {
      const list = backward.get(next)
      if (list) list.push(edge)
      else backward.set(next, [edge])
    }
  }
  const walk = (start: SimEdge, neighbors: (edge: SimEdge) => Iterable<SimEdge>): Set<SimEdge> => {
    const seen = new Set<SimEdge>([start])
    const stack = [start]
    while (stack.length > 0) {
      for (const next of neighbors(stack.pop()!)) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return seen
  }
  let best = new Set<SimEdge>()
  const visited = new Set<SimEdge>()
  for (const edge of net.edges) {
    if (visited.has(edge)) continue
    const forward = walk(edge, (item) => item.moves.keys())
    const back = walk(edge, (item) => backward.get(item) ?? [])
    const component = new Set([...forward].filter((item) => back.has(item)))
    for (const item of component) visited.add(item)
    visited.add(edge)
    if (component.size > best.size) best = component
  }
  return best
}

/**
 * Въезды и выезды сети. Обрыв заметной дороги значит, что она продолжается за рамкой файла:
 * и тупик, и участок без продолжения, и участок, в который ничего не ведёт.
 */
function buildGateways(net: SimNet, doc: OsmDoc, loads: Map<SimEdge, EdgeLoad>, core: Set<SimEdge>): Zone[] {
  const entered = new Set<SimEdge>()
  for (const edge of net.edges) for (const next of edge.moves.keys()) entered.add(next)
  const reachableFromCore = new Set<SimEdge>(core)
  const stack = [...core]
  while (stack.length > 0) {
    for (const next of stack.pop()!.moves.keys()) {
      if (!reachableFromCore.has(next)) {
        reachableFromCore.add(next)
        stack.push(next)
      }
    }
  }
  const reachesCore = new Set<SimEdge>(core)
  let grew = true
  while (grew) {
    grew = false
    for (const edge of net.edges) {
      if (reachesCore.has(edge)) continue
      if ([...edge.moves.keys()].some((next) => reachesCore.has(next))) {
        reachesCore.add(edge)
        grew = true
      }
    }
  }

  const byNode = new Map<number, { production: number; attraction: number; name?: string }>()
  const entry = (node: number) => {
    const item = byNode.get(node) ?? { production: 0, attraction: 0 }
    byNode.set(node, item)
    return item
  }
  for (const edge of net.edges) {
    if (classRank(edge.tags) < GATEWAY_MIN_RANK) continue
    // Интенсивность, введённая по полосам, точнее оценки по пропускной способности
    const counted = loads.get(edge)?.counted ?? null
    if (edge.moves.size === 0 && reachableFromCore.has(edge)) {
      const item = entry(edge.to)
      item.attraction += counted ?? (loads.get(edge)?.capacity ?? 0) * GATEWAY_SHARE
      item.name ??= edge.tags.name
    }
    if (!entered.has(edge) && reachesCore.has(edge)) {
      const item = entry(edge.from)
      item.production += counted ?? (loads.get(edge)?.capacity ?? 0) * GATEWAY_SHARE
      item.name ??= edge.tags.name
    }
  }
  const zones: Zone[] = []
  for (const [node, item] of byNode) {
    const nodeData = doc.nodes.get(node)
    if (!nodeData) continue
    zones.push({
      id: zones.length,
      node,
      kind: 'gateway',
      production: item.production,
      attraction: item.attraction,
      position: net.projector.toXY(nodeData),
      label: item.name ?? `Въезд ${node}`,
    })
  }
  return zones
}

function buildInternalZones(net: SimNet, doc: OsmDoc, period: Period, startId: number, core: Set<SimEdge>): Zone[] {
  const projector = net.projector
  const userZones = readUserZones(doc, projector)
  const cells = new Map<string, { res: number; jobs: number; x: number; y: number; w: number; points: XY[] }>()
  for (const way of doc.ways.values()) {
    const tags = way.tags
    if (!tags?.building || tags.building === 'no' || way.nds.length < 4) continue
    const { area, center } = buildingFloorArea(doc, way.nds, projector, tags['building:levels'])
    if (area <= 0) continue
    // Застройку внутри района, заданного вручную, описывают его жители и рабочие места
    if (zoneContaining(userZones, center)) continue
    const key = `${Math.floor(center.x / GRID_M)}:${Math.floor(center.y / GRID_M)}`
    const cell = cells.get(key) ?? { res: 0, jobs: 0, x: 0, y: 0, w: 0, points: [] }
    for (const nd of way.nds) {
      const node = doc.nodes.get(nd)
      if (node) cell.points.push(projector.toXY(node))
    }
    if (RESIDENTIAL_TYPES.has(tags.building)) cell.res += area
    else if (JOB_TYPES.has(tags.building) || tags.amenity || tags.shop || tags.office) cell.jobs += area
    else {
      cell.res += area * 0.5
      cell.jobs += area * 0.5
    }
    cell.x += center.x * area
    cell.y += center.y * area
    cell.w += area
    cells.set(key, cell)
  }

  const shares: Record<Period, { resOut: number; resIn: number; jobOut: number; jobIn: number }> = {
    morning: { resOut: 1, resIn: 0.15, jobOut: 0.1, jobIn: 1 },
    midday: { resOut: 0.35, resIn: 0.35, jobOut: 0.5, jobIn: 0.5 },
    evening: { resOut: 0.2, resIn: 1, jobOut: 1, jobIn: 0.15 },
  }
  const share = shares[period]
  // Район подключается к улице, а не к внутридворовому проезду
  const candidates = [...net.outgoing.keys()].filter((node) => {
    const out = (net.outgoing.get(node) ?? []).filter((edge) => core.has(edge))
    const incoming = (net.incoming.get(node) ?? []).filter((edge) => core.has(edge))
    return out.length > 0 && incoming.length > 0
  })
  const streets = candidates.filter((node) =>
    (net.outgoing.get(node) ?? []).some((edge) => classRank(edge.tags) >= ZONE_MIN_RANK),
  )
  const zones: Zone[] = []
  for (const cell of cells.values()) {
    const center = { x: cell.x / cell.w, y: cell.y / cell.w }
    const nearest = (nodes: number[]): number | null => {
      let found: number | null = null
      let bestDistance = ZONE_SEARCH_M
      for (const node of nodes) {
        const nodeData = doc.nodes.get(node)
        if (!nodeData) continue
        const distance = dist(projector.toXY(nodeData), center)
        if (distance < bestDistance) {
          bestDistance = distance
          found = node
        }
      }
      return found
    }
    const best = nearest(streets) ?? nearest(candidates)
    if (best === null) continue
    const production = cell.res * RESIDENTIAL_TRIPS_PER_M2 * share.resOut + cell.jobs * JOB_TRIPS_PER_M2 * share.jobOut
    const attraction = cell.res * RESIDENTIAL_TRIPS_PER_M2 * share.resIn + cell.jobs * JOB_TRIPS_PER_M2 * share.jobIn
    zones.push({
      id: startId + zones.length,
      node: best,
      kind: 'internal',
      production,
      attraction,
      position: projector.toXY(doc.node(best)),
      label: `Район ${zones.length + 1}`,
      outline: convexHull(cell.points),
      center,
    })
  }
  // Районы пользователя: жители уезжают утром и возвращаются вечером, к рабочим местам наоборот
  for (const user of userZones) {
    if (user.residents + user.jobs <= 0) continue
    const nearest = (nodes: number[], reach: number): number | null => {
      let found: number | null = null
      let bestDistance = reach
      for (const node of nodes) {
        const nodeData = doc.nodes.get(node)
        if (!nodeData) continue
        const distance = dist(projector.toXY(nodeData), user.centroid)
        if (distance < bestDistance) {
          bestDistance = distance
          found = node
        }
      }
      return found
    }
    const best = nearest(streets, ZONE_SEARCH_M * 2) ?? nearest(candidates, Number.POSITIVE_INFINITY)
    if (best === null) continue
    const resM2 = user.residents * M2_PER_RESIDENT
    const jobM2 = user.jobs * M2_PER_JOB
    zones.push({
      id: startId + zones.length,
      node: best,
      kind: 'internal',
      production: resM2 * RESIDENTIAL_TRIPS_PER_M2 * share.resOut + jobM2 * JOB_TRIPS_PER_M2 * share.jobOut,
      attraction: resM2 * RESIDENTIAL_TRIPS_PER_M2 * share.resIn + jobM2 * JOB_TRIPS_PER_M2 * share.jobIn,
      position: projector.toXY(doc.node(best)),
      label: user.name,
      outline: user.polygon,
      center: user.centroid,
      userWay: user.wayId,
      residents: user.residents,
      jobs: user.jobs,
    })
  }
  return zones
}

/** Оценка жителей и рабочих мест района по площади этажей зданий внутри контура. */
export function estimateZonePopulation(doc: OsmDoc, projector: SimNet['projector'], polygon: XY[]): { residents: number; jobs: number } {
  let res = 0
  let jobs = 0
  for (const way of doc.ways.values()) {
    const tags = way.tags
    if (!tags?.building || tags.building === 'no' || way.nds.length < 4) continue
    const { area, center } = buildingFloorArea(doc, way.nds, projector, tags['building:levels'])
    if (area <= 0 || !pointInPolygon(center, polygon)) continue
    if (RESIDENTIAL_TYPES.has(tags.building)) res += area
    else if (JOB_TYPES.has(tags.building) || tags.amenity || tags.shop || tags.office) jobs += area
    else {
      res += area * 0.5
      jobs += area * 0.5
    }
  }
  return { residents: Math.round(res / M2_PER_RESIDENT), jobs: Math.round(jobs / M2_PER_JOB) }
}

/** Выпуклая оболочка застройки района: алгоритм монотонной цепочки. */
export function convexHull(points: XY[]): XY[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const turn = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: XY[]) => {
    const chain: XY[] = []
    for (const point of list) {
      while (chain.length >= 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop()
      chain.push(point)
    }
    chain.pop()
    return chain
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/** Двоичная куча на массивах: Дейкстра запускается сотни раз за один расчёт. */
class MinHeap {
  private items: number[] = []
  private keys: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, key: number): void {
    const items = this.items
    const keys = this.keys
    let i = items.length
    items.push(item)
    keys.push(key)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent]! <= key) break
      items[i] = items[parent]!
      keys[i] = keys[parent]!
      i = parent
    }
    items[i] = item
    keys[i] = key
  }

  pop(): number {
    const items = this.items
    const keys = this.keys
    const top = items[0]!
    const lastItem = items.pop()!
    const lastKey = keys.pop()!
    const size = items.length
    if (size > 0) {
      let i = 0
      while (true) {
        let child = 2 * i + 1
        if (child >= size) break
        if (child + 1 < size && keys[child + 1]! < keys[child]!) child++
        if (keys[child]! >= lastKey) break
        items[i] = items[child]!
        keys[i] = keys[child]!
        i = child
      }
      items[i] = lastItem
      keys[i] = lastKey
    }
    return top
  }
}

interface RouterIndex {
  edges: SimEdge[]
  indexOf: Map<SimEdge, number>
  next: { to: number; delay: number }[][]
}

function buildRouterIndex(net: SimNet): RouterIndex {
  const edges = net.edges
  const indexOf = new Map<SimEdge, number>()
  edges.forEach((edge, index) => indexOf.set(edge, index))
  const next = edges.map((edge) =>
    [...edge.moves.entries()].map(([to, kind]) => ({ to: indexOf.get(to)!, delay: TURN_DELAY_S[kind] })),
  )
  return { edges, indexOf, next }
}

/** Кратчайшие пути по времени от всех участков, выходящих из узла. Учитывает манёвры, поэтому и запреты поворота. */
function shortestTree(
  router: RouterIndex,
  net: SimNet,
  origin: number,
  costs: Float64Array,
  distance: Float64Array,
  previous: Int32Array,
): void {
  distance.fill(Number.POSITIVE_INFINITY)
  previous.fill(-1)
  const heap = new MinHeap()
  for (const edge of net.outgoing.get(origin) ?? []) {
    const index = router.indexOf.get(edge)!
    distance[index] = costs[index]!
    heap.push(index, costs[index]!)
  }
  const done = new Uint8Array(router.edges.length)
  while (heap.size > 0) {
    const current = heap.pop()
    if (done[current]) continue
    done[current] = 1
    const base = distance[current]!
    for (const step of router.next[current]!) {
      const value = base + step.delay + costs[step.to]!
      if (value < distance[step.to]!) {
        distance[step.to] = value
        previous[step.to] = current
        heap.push(step.to, value)
      }
    }
  }
}

function extractPath(router: RouterIndex, net: SimNet, destination: number, distance: Float64Array, previous: Int32Array): number[] | null {
  let best = -1
  let bestValue = Number.POSITIVE_INFINITY
  for (const edge of net.incoming.get(destination) ?? []) {
    const index = router.indexOf.get(edge)!
    if (distance[index]! < bestValue) {
      bestValue = distance[index]!
      best = index
    }
  }
  if (best < 0) return null
  const path: number[] = []
  for (let current = best; current >= 0; current = previous[current]!) path.push(current)
  return path.reverse()
}

function updateLoad(load: EdgeLoad): void {
  load.vc = (load.volume + load.transitPcu) / load.capacity
  const running = load.freeTimeS * (1 + BPR_ALPHA * Math.min(load.vc, BPR_VC_LIMIT) ** BPR_BETA)
  load.timeS = running + load.nodeDelayS
  load.speedKmh = (load.edge.length / running) * 3.6
  load.los = losFromVc(load.vc)
}

/** Гравитационная модель: поездок тем больше, чем крупнее районы и чем они ближе. */
function gravity(zones: Zone[], demand: number): { from: Zone; to: Zone; trips: number }[] {
  const sumProduction = zones.reduce((sum, zone) => sum + zone.production, 0)
  const sumAttraction = zones.reduce((sum, zone) => sum + zone.attraction, 0)
  if (sumProduction <= 0 || sumAttraction <= 0) return []
  const scaleAttraction = sumProduction / sumAttraction
  const pairs: { from: Zone; to: Zone; trips: number }[] = []
  for (const from of zones) {
    if (from.production <= 0) continue
    const weights = zones.map((to) => {
      if (to === from || to.node === from.node) return 0
      const through = from.kind === 'gateway' && to.kind === 'gateway' ? THROUGH_WEIGHT : 1
      return to.attraction * scaleAttraction * through * Math.exp(-GRAVITY_BETA_PER_M * dist(from.position, to.position))
    })
    const total = weights.reduce((sum, value) => sum + value, 0)
    if (total <= 0) continue
    zones.forEach((to, index) => {
      const trips = (from.production * weights[index]! * demand) / total
      if (trips >= MIN_TRIPS) pairs.push({ from, to, trips })
    })
  }
  return pairs
}

export function runMacro(doc: OsmDoc, net: SimNet, params: MacroParams, services: TransitService[] = []): MacroResult {
  const loads = new Map<SimEdge, EdgeLoad>()
  for (const edge of net.edges) loads.set(edge, edgeBaseLoad(doc, net, edge))
  // Автобусы идут по расписанию и занимают дорогу ещё до того, как распределятся машины
  for (const service of services) {
    for (const edge of service.edges) {
      const load = loads.get(edge)
      if (!load) continue
      load.busesPerHour += service.frequency
      load.transitPcu += service.frequency * PCU_PER_BUS
    }
  }
  for (const load of loads.values()) updateLoad(load)

  const core = coreEdges(net)
  const gateways = buildGateways(net, doc, loads, core)
  const internal = buildInternalZones(net, doc, params.period, gateways.length, core)
  const zones = [...gateways, ...internal]
  const pairs = gravity(zones, params.demand)

  const router = buildRouterIndex(net)
  const count = router.edges.length
  const costs = new Float64Array(count)
  const volumes = new Float64Array(count)
  const auxiliary = new Float64Array(count)
  const distance = new Float64Array(count)
  const previous = new Int32Array(count)
  router.edges.forEach((edge, index) => (costs[index] = loads.get(edge)!.timeS))

  const byOrigin = new Map<number, { from: Zone; to: Zone; trips: number }[]>()
  for (const pair of pairs) {
    const list = byOrigin.get(pair.from.node)
    if (list) list.push(pair)
    else byOrigin.set(pair.from.node, [pair])
  }

  const routeSets = new Map<(typeof pairs)[number], Map<string, number[]>>()
  const unserved = new Set<(typeof pairs)[number]>()
  for (let iteration = 1; iteration <= MSA_ITERATIONS; iteration++) {
    auxiliary.fill(0)
    unserved.clear()
    for (const [origin, list] of byOrigin) {
      shortestTree(router, net, origin, costs, distance, previous)
      for (const pair of list) {
        const path = extractPath(router, net, pair.to.node, distance, previous)
        if (!path) {
          unserved.add(pair)
          continue
        }
        for (const index of path) auxiliary[index]! += pair.trips
        const routes = routeSets.get(pair) ?? new Map<string, number[]>()
        routes.set(path.join(','), path)
        routeSets.set(pair, routes)
      }
    }
    const step = 1 / iteration
    for (let i = 0; i < count; i++) {
      volumes[i]! += step * (auxiliary[i]! - volumes[i]!)
      const load = loads.get(router.edges[i]!)!
      load.volume = volumes[i]!
      updateLoad(load)
      costs[i] = load.timeS
    }
  }

  const flows: OdFlow[] = []
  for (const pair of pairs) {
    const routes = routeSets.get(pair)
    if (!routes || unserved.has(pair)) continue
    // Последние найденные пути ближе всего к равновесию
    const paths = [...routes.values()].slice(-MAX_ROUTES_PER_OD)
    flows.push({
      from: pair.from,
      to: pair.to,
      trips: pair.trips,
      routes: paths.map((path) => ({ edges: path.map((index) => router.edges[index]!) })),
    })
  }

  let vehKm = 0
  let vehHours = 0
  let delayHours = 0
  let congestedKm = 0
  let totalKm = 0
  const shareKm = [0, 0, 0, 0, 0, 0]
  for (const load of loads.values()) {
    const km = load.edge.length / 1000
    vehKm += load.volume * km
    const hours = (load.volume * load.timeS) / 3600
    vehHours += hours
    delayHours += (load.volume * Math.max(0, load.timeS - load.freeTimeS)) / 3600
    totalKm += km
    shareKm[load.los]! += km
    if (load.los >= 4) congestedKm += km
  }

  const lines: LineResult[] = services.map((service) => {
    let freeTimeS = 0
    let timeS = 0
    let worstVc = 0
    for (const edge of service.edges) {
      const load = loads.get(edge)
      if (!load) continue
      freeTimeS += load.freeTimeS
      timeS += load.timeS
      worstVc = Math.max(worstVc, load.vc)
    }
    const dwell = service.stops.length * STOP_DWELL_S
    timeS += dwell
    freeTimeS += dwell
    return { service, freeTimeS, timeS, speedKmh: timeS > 0 ? (service.lengthM / timeS) * 3.6 : 0, worstVc }
  })

  return {
    params,
    loads,
    zones,
    flows,
    lines,
    totals: {
      trips: pairs.reduce((sum, pair) => sum + pair.trips, 0),
      unservedTrips: [...unserved].reduce((sum, pair) => sum + pair.trips, 0),
      vehKm,
      vehHours,
      avgSpeedKmh: vehHours > 0 ? vehKm / vehHours : 0,
      delayHours,
      congestedKm,
      totalKm,
      losShares: shareKm.map((km) => (totalKm > 0 ? km / totalKm : 0)),
    },
  }
}

export function roadWidth(edge: SimEdge): number {
  return totalWidth(edge.link.profile)
}
