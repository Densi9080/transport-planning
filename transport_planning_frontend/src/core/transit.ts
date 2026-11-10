import type { OsmDoc } from './doc'
import { dist, nearestOnSegment, Projector } from './geo'
import { insertNodeOnWay, setNodeTags } from './ops'
import type { LatLon, Member, ORelation, OWay, Tags, XY } from './types'

/** Маршруты общественного транспорта: отношения OSM type=route с дорогами и остановками. */

export type TransitMode = 'bus' | 'trolleybus' | 'tram' | 'minibus' | 'share_taxi'

export const TRANSIT_MODE_LABELS: Record<TransitMode, string> = {
  bus: 'Автобус',
  trolleybus: 'Троллейбус',
  tram: 'Трамвай',
  minibus: 'Маршрутка',
  share_taxi: 'Маршрутка',
}

const MODES = new Set<string>(Object.keys(TRANSIT_MODE_LABELS))

/** Движение идёт по дорогам: трамвай здесь показывается, но в машинном потоке не участвует. */
export const ROAD_MODES = new Set<TransitMode>(['bus', 'trolleybus', 'minibus', 'share_taxi'])

export const DEFAULT_INTERVAL_MIN = 20
const STOP_ROLE = /^(stop|platform)/

export interface TransitStop {
  node: number
  name: string
  role: string
  position: LatLon
}

export interface TransitLine {
  id: number
  ref: string
  name: string
  mode: TransitMode
  from: string
  to: string
  /** Интервал движения, мин. */
  interval: number
  /** Интервал задан в файле, а не взят по умолчанию. */
  intervalTagged: boolean
  color: string
  /** Участники-дороги, которые есть в этом файле, в порядке следования. */
  wayIds: number[]
  stops: TransitStop[]
  /** Сколько дорог маршрута лежит за рамкой файла. */
  outsideWays: number
  /** Сколько остановок маршрута лежит за рамкой файла. */
  outsideStops: number
  lengthM: number
  tags: Tags
}

const LINE_PALETTE = [
  '#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#8c564b', '#7f3fbf',
  '#c0392b', '#1f7a8c', '#6a8d00', '#b5179e',
]

/** Цвет линии зависит от её номера и не меняется, когда список фильтруют. */
export function lineColor(relation: ORelation): string {
  const tagged = relation.tags?.colour
  if (tagged && /^#[0-9a-f]{6}$/i.test(tagged)) return tagged
  const ref = relation.tags?.ref ?? String(relation.id)
  let hash = 0
  for (const char of ref) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return LINE_PALETTE[hash % LINE_PALETTE.length]!
}

export function parseInterval(tags: Tags | undefined): number | null {
  const raw = tags?.interval
  if (!raw) return null
  // Значение бывает в минутах или в виде HH:MM
  const clock = /^(\d+):(\d+)$/.exec(raw.trim())
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function isTransitRelation(relation: ORelation): boolean {
  return relation.tags?.type === 'route' && MODES.has(relation.tags.route ?? '')
}

export function readLine(doc: OsmDoc, relation: ORelation, projector: Projector): TransitLine {
  const tags = relation.tags ?? {}
  const wayIds: number[] = []
  const stops: TransitStop[] = []
  let outsideWays = 0
  let outsideStops = 0
  for (const [type, ref, role] of relation.members) {
    if (type === 'way') {
      if (STOP_ROLE.test(role)) continue
      if (doc.ways.has(ref)) wayIds.push(ref)
      else outsideWays++
    } else if (type === 'node') {
      const node = doc.nodes.get(ref)
      if (!node) {
        outsideStops++
        continue
      }
      stops.push({
        node: ref,
        name: node.tags?.name ?? node.tags?.['name:ru'] ?? `Остановка ${ref}`,
        role,
        position: { lat: node.lat, lon: node.lon },
      })
    }
  }
  const interval = parseInterval(tags)
  const segments = lineSegments(doc, wayIds)
  let lengthM = 0
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const a = doc.nodes.get(segment[i - 1]!)
      const b = doc.nodes.get(segment[i]!)
      if (a && b) lengthM += dist(projector.toXY(a), projector.toXY(b))
    }
  }
  return {
    id: relation.id,
    ref: tags.ref ?? '',
    name: tags.name ?? (tags.ref ? `Маршрут ${tags.ref}` : `Маршрут ${relation.id}`),
    mode: tags.route as TransitMode,
    from: tags.from ?? '',
    to: tags.to ?? '',
    interval: interval ?? DEFAULT_INTERVAL_MIN,
    intervalTagged: interval !== null,
    color: lineColor(relation),
    wayIds,
    stops,
    outsideWays,
    outsideStops,
    lengthM,
    tags,
  }
}

export function listLines(doc: OsmDoc, projector: Projector): TransitLine[] {
  const lines: TransitLine[] = []
  for (const relation of doc.relations.values()) {
    if (isTransitRelation(relation)) lines.push(readLine(doc, relation, projector))
  }
  return lines.sort((a, b) => {
    const numeric = Number.parseInt(a.ref, 10) - Number.parseInt(b.ref, 10)
    return Number.isFinite(numeric) && numeric !== 0 ? numeric : a.ref.localeCompare(b.ref, 'ru') || a.id - b.id
  })
}

/**
 * Узлы маршрута по порядку. Порядок дорог берётся из отношения, а направление каждой дороги
 * определяется по стыку с соседней. Там, где маршрут уходит за рамку файла, начинается новый кусок.
 */
export function lineSegments(doc: OsmDoc, wayIds: number[]): number[][] {
  const segments: number[][] = []
  let current: number[] = []
  const ways = wayIds.map((id) => doc.ways.get(id)).filter((way): way is OWay => !!way)

  ways.forEach((way, index) => {
    const nds = way.nds.filter((nd) => doc.nodes.has(nd))
    if (nds.length < 2) return
    const last = current.at(-1)
    if (last !== undefined && nds[0] === last) {
      current.push(...nds.slice(1))
      return
    }
    if (last !== undefined && nds.at(-1) === last) {
      current.push(...[...nds].reverse().slice(1))
      return
    }
    // Первая дорога куска: направление подсказывает следующая
    const next = ways[index + 1]
    let oriented = nds
    if (next) {
      const nextEnds = [next.nds[0], next.nds.at(-1)]
      if (nextEnds.includes(nds[0]) && !nextEnds.includes(nds.at(-1))) oriented = [...nds].reverse()
    }
    if (current.length > 1) segments.push(current)
    current = [...oriented]
  })
  if (current.length > 1) segments.push(current)
  return segments
}

export function setLineTags(doc: OsmDoc, id: number, tags: Tags): void {
  const relation = doc.relations.get(id)
  if (!relation) throw new Error('Маршрут не найден')
  doc.putRelation({ ...relation, tags })
}

export function createLine(doc: OsmDoc, fields: { ref: string; mode: TransitMode; name?: string; interval?: number }): number {
  const id = doc.newId()
  const ref = fields.ref.trim()
  const label = TRANSIT_MODE_LABELS[fields.mode]
  doc.putRelation({
    id,
    members: [],
    tags: {
      type: 'route',
      route: fields.mode,
      ref,
      name: fields.name?.trim() || `${label} ${ref}`,
      'public_transport:version': '2',
      ...(fields.interval ? { interval: String(fields.interval) } : {}),
    },
  })
  return id
}

export function deleteLine(doc: OsmDoc, id: number): void {
  doc.removeRelation(id)
}

function lastWayIndex(members: Member[]): number {
  for (let i = members.length - 1; i >= 0; i--) {
    if (members[i]![0] === 'way' && !STOP_ROLE.test(members[i]![2])) return i
  }
  return -1
}

/** Дорога добавляется в конец маршрута: остановки по схеме PTv2 идут перед дорогами. */
export function addLineWay(doc: OsmDoc, id: number, wayId: number): { connected: boolean } {
  const relation = doc.relations.get(id)
  if (!relation) throw new Error('Маршрут не найден')
  const wayIds = relation.members.filter(([type, , role]) => type === 'way' && !STOP_ROLE.test(role)).map(([, ref]) => ref)
  const members = [...relation.members]
  const index = lastWayIndex(members)
  members.splice(index >= 0 ? index + 1 : members.length, 0, ['way', wayId, ''])
  doc.putRelation({ ...relation, members })

  const way = doc.way(wayId)
  const previous = wayIds.at(-1) !== undefined ? doc.ways.get(wayIds.at(-1)!) : undefined
  const connected =
    !previous || [previous.nds[0], previous.nds.at(-1)].some((nd) => nd === way.nds[0] || nd === way.nds.at(-1))
  return { connected }
}

export function removeLineWay(doc: OsmDoc, id: number, wayId: number): void {
  const relation = doc.relations.get(id)
  if (!relation) return
  doc.putRelation({
    ...relation,
    members: relation.members.filter(([type, ref]) => !(type === 'way' && ref === wayId)),
  })
}

/** Положение точки вдоль маршрута: нужно, чтобы остановки шли в порядке следования. */
function positionAlong(doc: OsmDoc, projector: Projector, segments: number[][], point: XY): number {
  let walked = 0
  let best = Number.POSITIVE_INFINITY
  let bestAlong = 0
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const a = doc.nodes.get(segment[i - 1]!)
      const b = doc.nodes.get(segment[i]!)
      if (!a || !b) continue
      const pa = projector.toXY(a)
      const pb = projector.toXY(b)
      const hit = nearestOnSegment(point, pa, pb)
      const span = dist(pa, pb)
      if (hit.distance < best) {
        best = hit.distance
        bestAlong = walked + hit.t * span
      }
      walked += span
    }
  }
  return bestAlong
}

/** Добавляет остановку маршрута на своё место по ходу движения. */
export function addLineStop(doc: OsmDoc, projector: Projector, id: number, nodeId: number): void {
  const relation = doc.relations.get(id)
  if (!relation) throw new Error('Маршрут не найден')
  if (relation.members.some(([type, ref]) => type === 'node' && ref === nodeId)) return

  const wayIds = relation.members.filter(([type, , role]) => type === 'way' && !STOP_ROLE.test(role)).map(([, ref]) => ref)
  const segments = lineSegments(doc, wayIds)
  const target = positionAlong(doc, projector, segments, projector.toXY(doc.node(nodeId)))

  const members = [...relation.members]
  let insertAt = 0
  members.forEach((member, index) => {
    const [type, ref] = member
    if (type !== 'node') return
    const node = doc.nodes.get(ref)
    if (node && positionAlong(doc, projector, segments, projector.toXY(node)) <= target) insertAt = index + 1
  })
  members.splice(insertAt, 0, ['node', nodeId, 'stop'])
  doc.putRelation({ ...relation, members })
}

export function removeLineStop(doc: OsmDoc, id: number, nodeId: number): void {
  const relation = doc.relations.get(id)
  if (!relation) return
  doc.putRelation({
    ...relation,
    members: relation.members.filter(([type, ref]) => !(type === 'node' && ref === nodeId)),
  })
}

/** Новая остановка: узел на дороге с тегами, которые понимают и OSM, и SUMO. */
export function createStopOnWay(
  doc: OsmDoc,
  projector: Projector,
  wayId: number,
  position: LatLon,
  name: string,
): number {
  const nodeId = insertNodeOnWay(doc, projector, wayId, position)
  setNodeTags(doc, nodeId, {
    ...doc.node(nodeId).tags,
    public_transport: 'stop_position',
    bus: 'yes',
    ...(name.trim() ? { name: name.trim() } : {}),
  })
  return nodeId
}
