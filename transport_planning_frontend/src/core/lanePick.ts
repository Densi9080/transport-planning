import { cross, dist, nearestOnSegment, offsetPolyline, pointAlong, polylineLength, sub, unit } from './geo'
import { laneOffsets, totalWidth } from './lanes'
import { computeArmGeometries } from './scene'
import type { Arm, Link, Network } from './topology'
import type { XY } from './types'

/** Конец полосы у перекрёстка: за такие точки полосы соединяют перетаскиванием. */
export interface LanePort {
  node: number
  neighbor: number
  lane: number
  /** Полоса въезжает в узел, иначе выезжает из него. */
  incoming: boolean
  point: XY
  points: XY[]
}

export function lanePorts(network: Network): LanePort[] {
  const ports: LanePort[] = []
  const geometries = computeArmGeometries(network)
  for (const [node, arms] of network.arms) {
    if (arms.length < 2) continue
    for (const arm of arms) {
      const offsets = laneOffsets(arm.link.profile)
      const trim = geometries.get(arm)?.trim ?? 0
      const add = (list: number[], incoming: boolean) => {
        list.forEach((offset, lane) => {
          const points = offsetPolyline(arm.link.points, offset)
          const along = arm.atStart ? trim : polylineLength(points) - trim
          ports.push({ node, neighbor: arm.neighbor, lane, incoming, point: pointAlong(points, along).point, points })
        })
      }
      add(arm.atStart ? offsets.backward : offsets.forward, true)
      add(arm.atStart ? offsets.forward : offsets.backward, false)
    }
  }
  return ports
}

/** Полоса дороги под указателем: нужна, чтобы соединять полосы прямо на карте. */
export interface LaneHit {
  link: Link
  /** Движение по ходу порядка узлов дороги. */
  forward: boolean
  /** Индекс полосы слева направо по ходу движения: в этом порядке полосы лежат в тегах OSM. */
  lane: number
  /** Полос в этом направлении. */
  count: number
  offset: number
}

const PICK_MARGIN_M = 1.5

export function laneAtPoint(network: Network, point: XY): LaneHit | null {
  let best: { link: Link; lateral: number; distance: number } | null = null
  for (const link of network.links) {
    const reach = totalWidth(link.profile) / 2 + PICK_MARGIN_M
    for (let i = 1; i < link.points.length; i++) {
      const a = link.points[i - 1]!
      const b = link.points[i]!
      if (
        Math.min(a.x, b.x) - reach > point.x ||
        Math.max(a.x, b.x) + reach < point.x ||
        Math.min(a.y, b.y) - reach > point.y ||
        Math.max(a.y, b.y) + reach < point.y
      ) {
        continue
      }
      const hit = nearestOnSegment(point, a, b)
      if (hit.distance > reach || (best && hit.distance >= best.distance)) continue
      best = { link, distance: hit.distance, lateral: cross(unit(sub(b, a)), sub(point, hit.point)) }
    }
  }
  if (!best) return null

  const offsets = laneOffsets(best.link.profile)
  let result: LaneHit | null = null
  let closest = Number.POSITIVE_INFINITY
  const scan = (list: number[], forward: boolean) => {
    list.forEach((offset, lane) => {
      const gap = Math.abs(best!.lateral - offset)
      if (gap < closest) {
        closest = gap
        result = { link: best!.link, forward, lane, count: list.length, offset }
      }
    })
  }
  scan(offsets.forward, true)
  scan(offsets.backward, false)
  return result
}

/**
 * Номер полосы для человека: первая полоса крайняя правая по ходу движения, как в Visum и ПДД.
 * Индекс в тегах OSM идёт наоборот, слева направо.
 */
export function laneNumber(index: number, count: number): number {
  return count - index
}

export function lanePolyline(hit: Pick<LaneHit, 'link' | 'offset'>): XY[] {
  return offsetPolyline(hit.link.points, hit.offset)
}

/** Узел, в который полоса приводит, и её подход к этому узлу. */
export function arrivalArm(network: Network, hit: LaneHit): Arm | null {
  const node = hit.forward ? hit.link.nodes.at(-1)! : hit.link.nodes[0]!
  const arms = network.arms.get(node) ?? []
  const arm = arms.find((item) => item.link === hit.link && item.atStart === !hit.forward)
  return arm && hit.lane < arm.lanesIn ? arm : null
}

/** Подход, по которому полоса выходит из заданного узла, если она из него выходит. */
export function departureArm(network: Network, hit: LaneHit, node: number): Arm | null {
  const start = hit.forward ? hit.link.nodes[0]! : hit.link.nodes.at(-1)!
  if (start !== node) return null
  const arms = network.arms.get(node) ?? []
  const arm = arms.find((item) => item.link === hit.link && item.atStart === hit.forward)
  return arm && hit.lane < arm.lanesOut ? arm : null
}

/** Отрезок полосы у узла: подсвечивает варианты, не закрашивая всю дорогу. */
export function laneStubNearNode(points: XY[], atStart: boolean, length: number): XY[] {
  const ordered = atStart ? points : [...points].reverse()
  const result = [ordered[0]!]
  let walked = 0
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1]!
    const b = ordered[i]!
    const step = dist(a, b)
    if (walked + step >= length) {
      const t = step > 0 ? (length - walked) / step : 0
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      return result
    }
    result.push(b)
    walked += step
  }
  return result
}
