import type { OsmDoc } from './doc'
import { dist, nearestOnSegment, type Projector } from './geo'
import { matchesNode } from './netObjects'
import { lineSegments, type TransitLine, type TransitMode } from './transit'
import type { ONode, Tags, XY } from './types'

/**
 * Показатели маршрута в иерархии Visum: линия объединяет маршруты по направлениям,
 * профиль времени задаёт время хода и стоянки по пунктам маршрута.
 */

const DEFAULT_SPEED_KMH: Record<TransitMode, number> = { bus: 22, trolleybus: 20, tram: 18, minibus: 25, share_taxi: 25 }
const DEFAULT_CAPACITY: Record<TransitMode, number> = { bus: 80, trolleybus: 90, tram: 150, minibus: 20, share_taxi: 20 }
export const DEFAULT_DWELL_S = 20
export const DEFAULT_LAYOVER_MIN = 5
export const DEFAULT_HOURS = 16
const STOP_AREA_REACH_M = 60

export interface ProfilePoint {
  node: number
  name: string
  distanceM: number
  /** Время хода от предыдущего пункта, с. */
  runS: number
  dwellS: number
  arrivalS: number
  runTagged: boolean
}

export interface RouteParams {
  speedKmh: number
  vehicleCapacity: number
  layoverMin: number
  hoursPerDay: number
}

export interface RouteResult {
  profile: ProfilePoint[]
  lengthM: number
  totalS: number
  commercialKmh: number
  tripsPerHour: number
  capacityPerHour: number
  vehicleKmPerHour: number
  roundTripS: number
  vehicles: number
  tripsPerDay: number
  vehicleKmPerDay: number
  hasOpposite: boolean
}

function numberTag(tags: Tags, key: string, fallback: number): number {
  const value = Number.parseFloat(tags[key] ?? '')
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function routeParams(line: TransitLine): RouteParams {
  return {
    speedKmh: numberTag(line.tags, 'tp:speed', DEFAULT_SPEED_KMH[line.mode] ?? 20),
    vehicleCapacity: numberTag(line.tags, 'tp:vehcap', DEFAULT_CAPACITY[line.mode] ?? 80),
    layoverMin: numberTag(line.tags, 'tp:layover', DEFAULT_LAYOVER_MIN),
    hoursPerDay: numberTag(line.tags, 'tp:hours', DEFAULT_HOURS),
  }
}

/** Значения профиля времени лежат в теге списком по пунктам маршрута. Пустое место означает расчётное значение. */
export function readProfileList(tags: Tags, key: string): (number | null)[] {
  return (tags[key] ?? '').split(';').map((item) => {
    const value = Number.parseFloat(item)
    return item.trim() !== '' && Number.isFinite(value) ? value : null
  })
}

export function writeProfileValue(tags: Tags, key: string, index: number, value: number | null, count: number): Tags {
  const values = Array.from({ length: count }, (_, i) => readProfileList(tags, key)[i] ?? null)
  values[index] = value
  const next = { ...tags }
  if (values.every((item) => item === null)) delete next[key]
  else next[key] = values.map((item) => (item === null ? '' : String(item))).join(';')
  return next
}

function routePolyline(doc: OsmDoc, projector: Projector, line: TransitLine): XY[] {
  const points: XY[] = []
  for (const segment of lineSegments(doc, line.wayIds)) {
    for (const id of segment) {
      const node = doc.nodes.get(id)
      if (node) points.push(projector.toXY(node))
    }
  }
  return points
}

/** Расстояние вдоль маршрута. Пункты идут по порядку, поэтому поиск продолжается только вперёд. */
function alongRoute(polyline: XY[], point: XY, from: number): number {
  let walked = 0
  let best = from
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]!
    const b = polyline[i]!
    const step = dist(a, b)
    const hit = nearestOnSegment(point, a, b)
    const position = walked + dist(a, hit.point)
    if (position >= from && hit.distance < bestDistance) {
      bestDistance = hit.distance
      best = position
    }
    walked += step
  }
  return best
}

export function computeRoute(doc: OsmDoc, projector: Projector, line: TransitLine, opposite: TransitLine | null): RouteResult {
  const params = routeParams(line)
  const polyline = routePolyline(doc, projector, line)
  const metersPerSecond = (params.speedKmh * 1000) / 3600
  const runs = readProfileList(line.tags, 'tp:run')
  const dwells = readProfileList(line.tags, 'tp:dwell')
  const stops = line.stops.filter((stop) => doc.nodes.has(stop.node))

  let previous = 0
  let clock = 0
  const profile = stops.map((stop, index): ProfilePoint => {
    const distanceM = alongRoute(polyline, projector.toXY(stop.position), previous)
    const tagged = runs[index] ?? null
    const runS = index === 0 ? 0 : (tagged ?? (distanceM - previous) / metersPerSecond)
    const dwellS = index === 0 || index === stops.length - 1 ? 0 : (dwells[index] ?? DEFAULT_DWELL_S)
    clock += runS
    const point = { node: stop.node, name: stop.name, distanceM, runS, dwellS, arrivalS: clock, runTagged: tagged !== null && index !== 0 }
    clock += dwellS
    previous = distanceM
    return point
  })

  const totalS = profile.at(-1)?.arrivalS ?? 0
  const lengthM = profile.at(-1)?.distanceM ?? 0
  const tripsPerHour = 60 / line.interval
  const otherS = opposite ? computeRoute(doc, projector, opposite, null).totalS : totalS
  const roundTripS = totalS + otherS + 2 * params.layoverMin * 60
  return {
    profile,
    lengthM,
    totalS,
    commercialKmh: totalS > 0 ? (lengthM / totalS) * 3.6 : 0,
    tripsPerHour,
    capacityPerHour: tripsPerHour * params.vehicleCapacity,
    vehicleKmPerHour: (tripsPerHour * lengthM) / 1000,
    roundTripS,
    vehicles: Math.ceil(roundTripS / (line.interval * 60)),
    tripsPerDay: tripsPerHour * params.hoursPerDay,
    vehicleKmPerDay: ((tripsPerHour * lengthM) / 1000) * params.hoursPerDay,
    hasOpposite: !!opposite,
  }
}

/** Линия объединяет маршруты с одним номером и видом транспорта: обычно это пара направлений. */
export function groupLines(lines: TransitLine[]): { key: string; ref: string; mode: TransitMode; color: string; routes: TransitLine[] }[] {
  const groups = new Map<string, { key: string; ref: string; mode: TransitMode; color: string; routes: TransitLine[] }>()
  for (const line of lines) {
    const key = `${line.mode}:${line.ref || line.id}`
    const group = groups.get(key)
    if (group) group.routes.push(line)
    else groups.set(key, { key, ref: line.ref, mode: line.mode, color: line.color, routes: [line] })
  }
  return [...groups.values()]
}

/** Встречный маршрут той же линии: конечные меняются местами. */
export function oppositeRoute(line: TransitLine, lines: TransitLine[]): TransitLine | null {
  const same = lines.filter((other) => other.id !== line.id && other.ref === line.ref && other.mode === line.mode)
  return same.find((other) => other.from === line.to && other.to === line.from) ?? same[0] ?? null
}

/** Зона остановки принадлежит пункту: явно заданному либо ближайшему. */
export function stopPointOfArea(doc: OsmDoc, projector: Projector, area: ONode): { node: ONode; explicit: boolean } | null {
  const explicit = doc.nodes.get(Number(area.tags?.['tp:stop_point']))
  if (explicit) return { node: explicit, explicit: true }
  const origin = projector.toXY(area)
  let best: ONode | null = null
  let bestDistance = STOP_AREA_REACH_M
  for (const node of doc.nodes.values()) {
    if (!matchesNode('stopPoints', node, doc)) continue
    const distance = dist(projector.toXY(node), origin)
    if (distance < bestDistance) {
      bestDistance = distance
      best = node
    }
  }
  return best ? { node: best, explicit: false } : null
}

export function nearStopPoints(doc: OsmDoc, projector: Projector, area: ONode, reachM: number): { node: ONode; distanceM: number }[] {
  const origin = projector.toXY(area)
  const found: { node: ONode; distanceM: number }[] = []
  for (const node of doc.nodes.values()) {
    if (!matchesNode('stopPoints', node, doc)) continue
    const distanceM = dist(projector.toXY(node), origin)
    if (distanceM <= reachM) found.push({ node, distanceM })
  }
  return found.sort((a, b) => a.distanceM - b.distanceM)
}
