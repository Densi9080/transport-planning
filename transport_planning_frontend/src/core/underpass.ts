import type { OsmDoc } from './doc'
import { cross, dist, Projector, pointAlong, polylineLength, sub, unit } from './geo'
import { isDrivable, parseProfile, totalWidth } from './lanes'
import { insertNodeOnWay, setWayTags, splitWay } from './ops'
import { wayLevel } from './topology'
import type { XY } from './types'

/** Запас по краям настила: тоннель чуть длиннее ширины моста. */
const MARGIN_M = 3
/** Существующий узел ближе этого переиспользуется, чтобы не плодить точки рядом. */
const REUSE_NODE_M = 1.5
/** Под очень острым углом длина тоннеля ограничена: иначе он растянулся бы на всю дорогу. */
const MIN_SIN = 0.3

export interface UnderpassResult {
  /** Новые участки-тоннели. */
  tunnels: number[]
  /** Дороги, которые проходят под мостом. */
  crossed: number[]
}

interface Crossing {
  along: number
  sin: number
}

function segmentHit(a: XY, b: XY, c: XY, d: XY): number | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < 1e-9) return null
  const t = cross(sub(c, a), s) / denominator
  const u = cross(sub(c, a), r) / denominator
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}

function firstCrossing(road: XY[], bridge: XY[]): Crossing | null {
  let along = 0
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1]!
    const b = road[i]!
    for (let j = 1; j < bridge.length; j++) {
      const t = segmentHit(a, b, bridge[j - 1]!, bridge[j]!)
      if (t === null) continue
      const sin = Math.abs(cross(unit(sub(b, a)), unit(sub(bridge[j]!, bridge[j - 1]!))))
      return { along: along + dist(a, b) * t, sin }
    }
    along += dist(a, b)
  }
  return null
}

/** Узел дороги на расстоянии along от её начала: существующий рядом или новый. */
function nodeAt(doc: OsmDoc, projector: Projector, wayId: number, along: number): number {
  const way = doc.way(wayId)
  const points = way.nds.map((id) => projector.toXY(doc.node(id)))
  const { point } = pointAlong(points, along)
  const near = way.nds.find((id, index) => dist(points[index]!, point) < REUSE_NODE_M)
  return near ?? insertNodeOnWay(doc, projector, wayId, projector.toLatLon(point))
}

/** Участок между двумя узлами после разрезания: тот, у которого они на концах. */
function pieceBetween(doc: OsmDoc, candidates: number[], from: number, to: number): number | null {
  for (const id of candidates) {
    const nds = doc.ways.get(id)?.nds
    if (!nds) continue
    const [first, last] = [nds[0], nds.at(-1)]
    if ((first === from && last === to) || (first === to && last === from)) return id
  }
  return null
}

/**
 * Тоннель под мостом: каждая проезжая дорога, которая проходит под ним, режется по краям
 * настила, и кусок под мостом получает tunnel=yes и layer=-1. Так дорога под мостом
 * и в OSM, и в моделях лежит уровнем ниже, а мост над ней — отдельным уровнем.
 */
export function tunnelUnderBridge(doc: OsmDoc, projector: Projector, bridgeId: number): UnderpassResult {
  const bridge = doc.way(bridgeId)
  const bridgeLevel = wayLevel(bridge.tags ?? {})
  const bridgeNodes = new Set(bridge.nds)
  const bridgePoints = bridge.nds.map((id) => projector.toXY(doc.node(id)))
  const half = totalWidth(parseProfile(bridge.tags ?? {})) / 2 + MARGIN_M
  const result: UnderpassResult = { tunnels: [], crossed: [] }

  for (const way of [...doc.ways.values()]) {
    const tags = way.tags ?? {}
    if (way.id === bridgeId || !isDrivable(tags)) continue
    if (wayLevel(tags) >= bridgeLevel || (tags.tunnel && tags.tunnel !== 'no')) continue
    if (way.nds.some((id) => bridgeNodes.has(id))) continue
    const points = way.nds.map((id) => projector.toXY(doc.node(id)))
    const hit = firstCrossing(points, bridgePoints)
    if (!hit) continue
    result.crossed.push(way.id)

    const total = polylineLength(points)
    const reach = half / Math.max(MIN_SIN, hit.sin)
    const from = Math.max(0, hit.along - reach)
    const to = Math.min(total, hit.along + reach)
    const startNode = from < REUSE_NODE_M ? way.nds[0]! : nodeAt(doc, projector, way.id, from)
    const endNode = total - to < REUSE_NODE_M ? way.nds.at(-1)! : nodeAt(doc, projector, way.id, to)
    if (startNode === endNode) continue

    const pieces = [way.id]
    for (const node of [startNode, endNode]) {
      for (const id of [...pieces]) {
        const created = splitWay(doc, id, node)
        if (created !== null) {
          pieces.push(created)
          break
        }
      }
    }
    const tunnel = pieceBetween(doc, pieces, startNode, endNode)
    if (tunnel === null) continue
    setWayTags(doc, tunnel, { ...doc.way(tunnel).tags, tunnel: 'yes', layer: String(Math.min(-1, bridgeLevel - 2)) })
    result.tunnels.push(tunnel)
  }
  return result
}
