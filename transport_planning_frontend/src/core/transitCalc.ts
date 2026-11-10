import type { OsmDoc } from './doc'
import { dist, nearestOnSegment, type Projector } from './geo'
import { departures, type IntervalPeriod, parseIntervalPeriods, peakInterval, serviceWindow, type ServiceWindow } from './timetable'
import { lineSegments, type TransitLine, type TransitMode } from './transit'
import type { LatLon, Tags, XY } from './types'

/**
 * Показатели маршрута в иерархии Visum: линия объединяет маршруты по направлениям,
 * профиль времени задаёт время хода и стоянки по пунктам маршрута.
 */

const DEFAULT_SPEED_KMH: Record<TransitMode, number> = { bus: 22, trolleybus: 20, tram: 18, minibus: 25, share_taxi: 25 }
const DEFAULT_CAPACITY: Record<TransitMode, number> = { bus: 80, trolleybus: 90, tram: 150, minibus: 20, share_taxi: 20 }
export const DEFAULT_DWELL_S = 20
export const DEFAULT_LAYOVER_MIN = 5

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
  window: ServiceWindow
  periods: IntervalPeriod[]
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
  /** Отправления с начального пункта за день, мин от полуночи. */
  departures: number[]
  peakIntervalMin: number
  /** Провозная способность при наименьшем интервале, чел/ч. */
  peakCapacityPerHour: number
}

function numberTag(tags: Tags, key: string, fallback: number): number {
  const value = Number.parseFloat(tags[key] ?? '')
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function routeParams(line: TransitLine): RouteParams {
  const window = serviceWindow(line.tags)
  return {
    speedKmh: numberTag(line.tags, 'tp:speed', DEFAULT_SPEED_KMH[line.mode] ?? 20),
    vehicleCapacity: numberTag(line.tags, 'tp:vehcap', DEFAULT_CAPACITY[line.mode] ?? 80),
    layoverMin: numberTag(line.tags, 'tp:layover', DEFAULT_LAYOVER_MIN),
    hoursPerDay: (window.lastMin - window.firstMin) / 60,
    window,
    periods: parseIntervalPeriods(line.tags),
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

/** Участки линии маршрута между соседними пунктами: по ним рисуется эпюра наполнения. */
export function profileSpans(doc: OsmDoc, projector: Projector, line: TransitLine, distances: number[]): LatLon[][] {
  const polyline = routePolyline(doc, projector, line)
  const walked: number[] = [0]
  for (let i = 1; i < polyline.length; i++) walked.push(walked[i - 1]! + dist(polyline[i - 1]!, polyline[i]!))

  const pointAt = (position: number): XY => {
    for (let i = 1; i < polyline.length; i++) {
      if (walked[i]! >= position) {
        const a = polyline[i - 1]!
        const b = polyline[i]!
        const step = walked[i]! - walked[i - 1]!
        const t = step > 0 ? (position - walked[i - 1]!) / step : 0
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      }
    }
    return polyline.at(-1)!
  }

  const spans: LatLon[][] = []
  for (let k = 0; k + 1 < distances.length; k++) {
    const from = distances[k]!
    const to = distances[k + 1]!
    if (polyline.length < 2 || to <= from) {
      spans.push([])
      continue
    }
    const points = [pointAt(from)]
    for (let i = 0; i < polyline.length; i++) if (walked[i]! > from && walked[i]! < to) points.push(polyline[i]!)
    points.push(pointAt(to))
    spans.push(points.map((p) => projector.toLatLon(p)))
  }
  return spans
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
  const starts = departures(params.window, line.interval, params.periods)
  const peak = peakInterval(line.interval, params.periods)
  return {
    profile,
    lengthM,
    totalS,
    commercialKmh: totalS > 0 ? (lengthM / totalS) * 3.6 : 0,
    tripsPerHour,
    capacityPerHour: tripsPerHour * params.vehicleCapacity,
    vehicleKmPerHour: (tripsPerHour * lengthM) / 1000,
    roundTripS,
    // Машин нужно столько, чтобы держать самый частый интервал дня
    vehicles: Math.ceil(roundTripS / (peak * 60)),
    tripsPerDay: starts.length,
    vehicleKmPerDay: (starts.length * lengthM) / 1000,
    hasOpposite: !!opposite,
    departures: starts,
    peakIntervalMin: peak,
    peakCapacityPerHour: (60 / peak) * params.vehicleCapacity,
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
