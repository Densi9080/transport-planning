import type { OsmDoc } from './doc'
import { dist, nearestOnSegment, type Projector } from './geo'
import { matchesNode, matchesWay } from './netObjects'
import type { LatLon, ONode, ORelation, Tags, XY } from './types'

/**
 * Иерархия остановок, как в Visum: остановка → зоны остановки → пункты остановки.
 *
 * Пункт остановки — место на дороге, где встаёт транспорт (столб, край платформы). Только он связан с сетью.
 * Зона остановки объединяет соседние пункты и даёт подход пешеходам: платформа, сторона улицы.
 * Каждый пункт принадлежит одной зоне, каждая зона — одной остановке.
 * Остановка — весь комплекс с названием. У неё есть место на карте, но она не привязана к узлу или отрезку.
 *
 * В OSM пункт — узел public_transport=stop_position (или bus_stop), зона — public_transport=platform,
 * остановка — отношение public_transport=stop_area. Принадлежность пункта зоне в OSM не хранится,
 * поэтому её можно задать тегом tp:stop_area="node/ID" или "way/ID". Без него зона выбирается
 * среди платформ той же остановки, а если пункт ни в какую остановку не входит — ближайшая в радиусе.
 */

export const AREA_REACH_M = 60
export const STOP_AREA_TAG = 'tp:stop_area'

export type AreaKind = 'node' | 'way'

export interface StopAreaInfo {
  key: string
  kind: AreaKind
  id: number
  name: string
  position: LatLon
  /** Остановка (отношение stop_area), в которую входит зона. */
  stop: number | null
  points: number[]
}

export interface StopPointInfo {
  node: ONode
  area: string | null
  /** Зона задана тегом, а не выбрана по расстоянию. */
  explicit: boolean
}

export interface StopInfo {
  id: number
  name: string
  position: LatLon | null
  areas: string[]
  points: number[]
}

export interface StopHierarchy {
  areas: Map<string, StopAreaInfo>
  points: Map<number, StopPointInfo>
  stops: Map<number, StopInfo>
}

export function areaKey(kind: AreaKind, id: number): string {
  return `${kind}/${id}`
}

export function parseAreaKey(value: string | undefined): { kind: AreaKind; id: number } | null {
  const match = /^(node|way)\/(-?\d+)$/.exec(value?.trim() ?? '')
  return match ? { kind: match[1] as AreaKind, id: Number(match[2]) } : null
}

function average(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  }
}

export function isStopRelation(relation: ORelation): boolean {
  return relation.tags?.public_transport === 'stop_area'
}

export function buildStopHierarchy(doc: OsmDoc, projector: Projector): StopHierarchy {
  const areas = new Map<string, StopAreaInfo>()
  for (const node of doc.nodes.values()) {
    if (!matchesNode('stopAreas', node, doc)) continue
    const key = areaKey('node', node.id)
    areas.set(key, { key, kind: 'node', id: node.id, name: node.tags?.name ?? `Зона ${node.id}`, position: node, stop: null, points: [] })
  }
  for (const way of doc.ways.values()) {
    if (!matchesWay('stopAreas', way)) continue
    const position = average(way.nds.map((id) => doc.nodes.get(id)).filter((n): n is ONode => !!n))
    if (!position) continue
    const key = areaKey('way', way.id)
    areas.set(key, { key, kind: 'way', id: way.id, name: way.tags?.name ?? `Зона ${way.id}`, position, stop: null, points: [] })
  }

  const stops = new Map<number, StopInfo>()
  const stopsOfPoint = new Map<number, number[]>()
  for (const relation of doc.relations.values()) {
    if (!isStopRelation(relation)) continue
    const info: StopInfo = { id: relation.id, name: relation.tags?.name ?? `Остановка ${relation.id}`, position: null, areas: [], points: [] }
    for (const [type, ref] of relation.members) {
      if (type === 'relation') continue
      const key = areaKey(type, ref)
      const area = areas.get(key)
      if (area) {
        if (area.stop === null) area.stop = relation.id
        if (area.stop === relation.id) info.areas.push(key)
        continue
      }
      const node = type === 'node' ? doc.nodes.get(ref) : undefined
      if (node && matchesNode('stopPoints', node, doc)) stopsOfPoint.set(ref, [...(stopsOfPoint.get(ref) ?? []), relation.id])
    }
    stops.set(relation.id, info)
  }

  const nearest = (node: ONode, candidates: StopAreaInfo[], reach: number): StopAreaInfo | null => {
    const origin = projector.toXY(node)
    let best: StopAreaInfo | null = null
    let bestDistance = reach
    for (const area of candidates) {
      const distance = dist(projector.toXY(area.position), origin)
      if (distance < bestDistance) {
        bestDistance = distance
        best = area
      }
    }
    return best
  }

  const points = new Map<number, StopPointInfo>()
  const allAreas = [...areas.values()]
  for (const node of doc.nodes.values()) {
    if (!matchesNode('stopPoints', node, doc)) continue
    const tagged = parseAreaKey(node.tags?.[STOP_AREA_TAG])
    let area = tagged ? (areas.get(areaKey(tagged.kind, tagged.id)) ?? null) : null
    const explicit = area !== null
    if (!area) {
      const ownStops = stopsOfPoint.get(node.id) ?? []
      const candidates = allAreas.filter((item) => item.stop !== null && ownStops.includes(item.stop))
      area = candidates.length > 0 ? nearest(node, candidates, Number.POSITIVE_INFINITY) : nearest(node, allAreas, AREA_REACH_M)
    }
    points.set(node.id, { node, area: area?.key ?? null, explicit })
    area?.points.push(node.id)
  }

  for (const stop of stops.values()) {
    const pointIds = new Set<number>()
    for (const key of stop.areas) for (const id of areas.get(key)!.points) pointIds.add(id)
    for (const [id, owners] of stopsOfPoint) if (owners.includes(stop.id) && !points.get(id)?.area) pointIds.add(id)
    stop.points = [...pointIds]
    stop.position = average([
      ...stop.areas.map((key) => areas.get(key)!.position),
      ...stop.points.map((id) => doc.node(id)),
    ])
  }
  return { areas, points, stops }
}

export function nearAreas(hierarchy: StopHierarchy, projector: Projector, origin: LatLon, reachM: number): { area: StopAreaInfo; distanceM: number }[] {
  const at = projector.toXY(origin)
  return [...hierarchy.areas.values()]
    .map((area) => ({ area, distanceM: dist(projector.toXY(area.position), at) }))
    .filter((item) => item.distanceM <= reachM)
    .sort((a, b) => a.distanceM - b.distanceM)
}

export function nearStops(hierarchy: StopHierarchy, projector: Projector, origin: LatLon, reachM: number): { stop: StopInfo; distanceM: number }[] {
  const at = projector.toXY(origin)
  return [...hierarchy.stops.values()]
    .filter((stop) => stop.position)
    .map((stop) => ({ stop, distanceM: dist(projector.toXY(stop.position!), at) }))
    .filter((item) => item.distanceM <= reachM)
    .sort((a, b) => a.distanceM - b.distanceM)
}

/** Точка сбоку от дороги напротив узла: справа по направлению линии дороги. */
export function sideOfRoad(doc: OsmDoc, projector: Projector, wayId: number, at: LatLon, offsetM: number): LatLon {
  const way = doc.ways.get(wayId)
  const origin = projector.toXY(at)
  const points = (way?.nds ?? []).map((id) => doc.nodes.get(id)).filter((n): n is ONode => !!n).map((n) => projector.toXY(n))
  let best: { dx: number; dy: number; distance: number } | null = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const hit = nearestOnSegment(origin, a, b)
    if (!best || hit.distance < best.distance) best = { dx: b.x - a.x, dy: b.y - a.y, distance: hit.distance }
  }
  const length = best ? Math.hypot(best.dx, best.dy) : 0
  if (!best || length === 0) return { lat: at.lat, lon: at.lon }
  // Правая нормаль к направлению (dx, dy) — это (dy, -dx)
  return projector.toLatLon({ x: origin.x + (best.dy / length) * offsetM, y: origin.y - (best.dx / length) * offsetM })
}

/** Контур вокруг точек с отступом: выпуклая оболочка окружностей радиуса padding. */
export function paddedHull(points: XY[], padding: number, steps = 12): XY[] {
  const cloud: XY[] = []
  for (const p of points) {
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      cloud.push({ x: p.x + Math.cos(angle) * padding, y: p.y + Math.sin(angle) * padding })
    }
  }
  const sorted = cloud.sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const turn = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: XY[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && turn(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: XY[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && turn(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Привязка пункта к зоне. Пустое значение возвращает выбор по расстоянию. */
export function withStopArea(tags: Tags | undefined, key: string | null): Tags {
  const next = { ...(tags ?? {}) }
  if (key) next[STOP_AREA_TAG] = key
  else delete next[STOP_AREA_TAG]
  return next
}

/** Зона входит в одну остановку: из прежней она убирается, в новую добавляется с ролью platform. */
export function moveAreaToStop(doc: OsmDoc, kind: AreaKind, id: number, stopId: number | null): void {
  for (const relation of [...doc.relations.values()]) {
    if (!isStopRelation(relation)) continue
    const has = relation.members.some(([type, ref]) => type === kind && ref === id)
    if (relation.id === stopId) {
      if (!has) doc.putRelation({ ...relation, members: [...relation.members, [kind, id, 'platform']] })
    } else if (has) {
      doc.putRelation({ ...relation, members: relation.members.filter(([type, ref]) => !(type === kind && ref === id)) })
    }
  }
}

/** Новая остановка из зоны: зона и её пункты становятся участниками отношения stop_area. */
export function createStopForArea(doc: OsmDoc, hierarchy: StopHierarchy, key: string, name: string): number {
  const area = hierarchy.areas.get(key)
  if (!area) throw new Error('Зона не найдена')
  moveAreaToStop(doc, area.kind, area.id, null)
  const id = doc.newId()
  doc.putRelation({
    id,
    members: [[area.kind, area.id, 'platform'], ...area.points.map((point): [AreaKind, number, string] => ['node', point, 'stop'])],
    tags: { type: 'public_transport', public_transport: 'stop_area', name: name.trim() || area.name },
  })
  return id
}

/** Маршруты, которые обслуживают пункт: он входит в отношение маршрута. */
export function linesAtPoint(doc: OsmDoc, nodeId: number): ORelation[] {
  return [...doc.relations.values()].filter(
    (relation) => relation.tags?.type === 'route' && relation.members.some(([type, ref]) => type === 'node' && ref === nodeId),
  )
}

export interface StopIssue {
  kind: 'point-without-area' | 'area-without-stop' | 'area-without-points' | 'stop-without-points'
  title: string
  target: { kind: 'node' | 'way' | 'relation'; id: number }
}

/** Нарушения иерархии. В Visum у остановки всегда есть хотя бы один пункт, у пункта — зона. */
export function stopIssues(hierarchy: StopHierarchy): StopIssue[] {
  const issues: StopIssue[] = []
  for (const point of hierarchy.points.values()) {
    if (!point.area) issues.push({ kind: 'point-without-area', title: `Пункт «${point.node.tags?.name ?? point.node.id}» не входит ни в одну зону`, target: { kind: 'node', id: point.node.id } })
  }
  for (const area of hierarchy.areas.values()) {
    if (area.stop === null) issues.push({ kind: 'area-without-stop', title: `Зона «${area.name}» не входит ни в одну остановку`, target: { kind: area.kind, id: area.id } })
    if (area.points.length === 0) issues.push({ kind: 'area-without-points', title: `В зоне «${area.name}» нет пунктов остановки`, target: { kind: area.kind, id: area.id } })
  }
  for (const stop of hierarchy.stops.values()) {
    if (stop.points.length === 0) issues.push({ kind: 'stop-without-points', title: `У остановки «${stop.name}» нет ни одного пункта`, target: { kind: 'relation', id: stop.id } })
  }
  return issues
}
