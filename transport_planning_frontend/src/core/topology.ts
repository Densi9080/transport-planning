import type { OsmDoc } from './doc'
import { dot, cross, Projector, pointAlong, polylineLength, sub, unit } from './geo'
import { isDrivable, type LaneProfile, parseProfile } from './lanes'
import type { XY } from './types'

/** Участок дороги между двумя узлами графа. */
export interface Link {
  wayId: number
  nodes: number[]
  points: XY[]
  length: number
  profile: LaneProfile
  level: number
  bridge: boolean
  tunnel: boolean
}

/** Подход участка к узлу графа. */
export interface Arm {
  node: number
  link: Link
  /** Участок начинается в этом узле, иначе заканчивается. */
  atStart: boolean
  /** Соседний узел по этому подходу: не меняется при разрезании дороги. */
  neighbor: number
  /** Единичный вектор от узла вдоль дороги. */
  dir: XY
  /** Полос, въезжающих в узел. */
  lanesIn: number
  /** Полос, выезжающих из узла. */
  lanesOut: number
}

export interface Network {
  projector: Projector
  links: Link[]
  arms: Map<number, Arm[]>
}

const DIRECTION_SAMPLE_M = 8

export function wayLevel(tags: Record<string, string>): number {
  const layer = Number.parseInt(tags.layer ?? '', 10)
  if (Number.isFinite(layer)) return layer
  if (tags.bridge && tags.bridge !== 'no') return 1
  if (tags.tunnel && tags.tunnel !== 'no') return -1
  return 0
}

export function buildNetwork(doc: OsmDoc, projector: Projector): Network {
  const visits = new Map<number, number>()
  const drivable = [...doc.ways.values()].filter((way) => isDrivable(way.tags))

  for (const way of drivable) {
    way.nds.forEach((nd, index) => {
      const isEnd = index === 0 || index === way.nds.length - 1
      visits.set(nd, (visits.get(nd) ?? 0) + (isEnd ? 1 : 2))
    })
  }

  const links: Link[] = []
  const arms = new Map<number, Arm[]>()

  for (const way of drivable) {
    const tags = way.tags ?? {}
    const profile = parseProfile(tags)
    const level = wayLevel(tags)
    const bridge = !!tags.bridge && tags.bridge !== 'no'
    const tunnel = !!tags.tunnel && tags.tunnel !== 'no'

    let piece: number[] = []
    const flush = () => {
      if (piece.length < 2) return
      const points = piece.map((id) => projector.toXY(doc.node(id)))
      const link: Link = {
        wayId: way.id,
        nodes: piece,
        points,
        length: polylineLength(points),
        profile,
        level,
        bridge,
        tunnel,
      }
      links.push(link)
      pushArm(arms, makeArm(link, true))
      pushArm(arms, makeArm(link, false))
    }

    way.nds.forEach((nd, index) => {
      if (!doc.nodes.has(nd)) return
      piece.push(nd)
      const isLast = index === way.nds.length - 1
      // Конец дороги весит 1, проход через узел — 2: больше двух значит, что сходятся дороги
      const isGraphNode = (visits.get(nd) ?? 0) > 2
      if (piece.length > 1 && (isLast || isGraphNode)) {
        flush()
        piece = [nd]
      }
    })
  }

  return { projector, links, arms }
}

function pushArm(arms: Map<number, Arm[]>, arm: Arm): void {
  const list = arms.get(arm.node)
  if (list) list.push(arm)
  else arms.set(arm.node, [arm])
}

function makeArm(link: Link, atStart: boolean): Arm {
  const node = atStart ? link.nodes[0]! : link.nodes.at(-1)!
  const neighbor = atStart ? link.nodes[1]! : link.nodes.at(-2)!
  const along = Math.min(DIRECTION_SAMPLE_M, link.length * 0.5)
  const origin = atStart ? link.points[0]! : link.points.at(-1)!
  const target = pointAlong(link.points, atStart ? along : link.length - along).point
  return {
    node,
    link,
    atStart,
    neighbor,
    dir: unit(sub(target, origin)),
    lanesIn: atStart ? link.profile.backward : link.profile.forward,
    lanesOut: atStart ? link.profile.forward : link.profile.backward,
  }
}

export type TurnKind = 'left' | 'through' | 'right' | 'reverse'

export function turnKind(inArm: Arm, outArm: Arm): TurnKind {
  if (inArm === outArm || inArm.neighbor === outArm.neighbor) return 'reverse'
  const travelIn: XY = { x: -inArm.dir.x, y: -inArm.dir.y }
  const angle = Math.atan2(cross(travelIn, outArm.dir), dot(travelIn, outArm.dir))
  const degrees = (angle * 180) / Math.PI
  if (Math.abs(degrees) < 35) return 'through'
  if (Math.abs(degrees) > 155) return 'reverse'
  return degrees > 0 ? 'left' : 'right'
}

export interface Restriction {
  relationId: number
  kind: 'no' | 'only'
  value: string
  from: number
  to: number
  via: number
}

export function restrictionsAt(doc: OsmDoc, via: number): Restriction[] {
  const found: Restriction[] = []
  for (const relation of doc.relations.values()) {
    const value = relation.tags?.restriction
    if (relation.tags?.type !== 'restriction' || !value) continue
    let from: number | null = null
    let to: number | null = null
    let viaNode: number | null = null
    for (const [type, ref, role] of relation.members) {
      if (type === 'way' && role === 'from') from = ref
      else if (type === 'way' && role === 'to') to = ref
      else if (type === 'node' && role === 'via') viaNode = ref
    }
    if (viaNode !== via || from === null || to === null) continue
    found.push({
      relationId: relation.id,
      kind: value.startsWith('only_') ? 'only' : 'no',
      value,
      from,
      to,
      via,
    })
  }
  return found
}

/** Разрешён ли манёвр по отношениям type=restriction. Проверяется только запрет, не наличие полос. */
export function isMovementAllowed(inArm: Arm, outArm: Arm, restrictions: Restriction[]): boolean {
  const uTurn = inArm.neighbor === outArm.neighbor
  const fromWay = inArm.link.wayId
  const toWay = outArm.link.wayId
  const relevant = restrictions.filter((r) => r.from === fromWay)

  const applies = (r: Restriction) => {
    if (r.to !== toWay) return false
    // Запрет с from == to описывает только разворот, а не проезд прямо по той же дороге
    return r.from !== r.to || uTurn
  }

  const only = relevant.filter((r) => r.kind === 'only')
  if (only.length > 0 && !only.some(applies)) return false
  return !relevant.some((r) => r.kind === 'no' && applies(r))
}

export interface LaneConnectivity {
  relationId: number
  from: number
  to: number
  via: number
  /** Пары полос, нумерация с нуля слева по ходу движения. */
  pairs: [number, number][]
}

/** Разбирает значение тега: 1:1,2|2:3. В OSM полосы нумеруются с единицы, необязательные — в скобках. */
export function parseConnectivity(value: string | undefined): [number, number][] {
  const pairs: [number, number][] = []
  for (const part of (value ?? '').split('|')) {
    const [from, targets] = part.split(':')
    const fromLane = Number.parseInt(from ?? '', 10)
    if (!Number.isFinite(fromLane) || !targets) continue
    for (const target of targets.split(',')) {
      const toLane = Number.parseInt(target.replace(/[()]/g, ''), 10)
      if (Number.isFinite(toLane)) pairs.push([fromLane - 1, toLane - 1])
    }
  }
  return pairs
}

export function formatConnectivity(pairs: [number, number][]): string {
  const byLane = new Map<number, number[]>()
  for (const [from, to] of pairs) {
    const list = byLane.get(from)
    if (list) list.push(to)
    else byLane.set(from, [to])
  }
  return [...byLane.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, targets]) => `${from + 1}:${[...new Set(targets)].sort((a, b) => a - b).map((to) => to + 1).join(',')}`)
    .join('|')
}

export function connectivityAt(doc: OsmDoc, via: number): LaneConnectivity[] {
  const found: LaneConnectivity[] = []
  for (const relation of doc.relations.values()) {
    if (relation.tags?.type !== 'connectivity') continue
    let from: number | null = null
    let to: number | null = null
    let viaNode: number | null = null
    for (const [type, ref, role] of relation.members) {
      if (type === 'way' && role === 'from') from = ref
      else if (type === 'way' && role === 'to') to = ref
      else if (type === 'node' && role === 'via') viaNode = ref
    }
    if (viaNode !== via || from === null || to === null) continue
    found.push({ relationId: relation.id, from, to, via, pairs: parseConnectivity(relation.tags.connectivity) })
  }
  return found
}

export interface Movement {
  from: Arm
  to: Arm
  kind: TurnKind
  allowed: boolean
}

export function junctionMovements(doc: OsmDoc, network: Network, node: number): Movement[] {
  const arms = network.arms.get(node) ?? []
  const restrictions = restrictionsAt(doc, node)
  const movements: Movement[] = []
  for (const from of arms) {
    if (from.lanesIn === 0) continue
    for (const to of arms) {
      if (to.lanesOut === 0) continue
      movements.push({
        from,
        to,
        kind: turnKind(from, to),
        allowed: isMovementAllowed(from, to, restrictions),
      })
    }
  }
  return movements
}

/** Угол манёвра в тег restriction. */
export function restrictionValue(kind: TurnKind): string {
  switch (kind) {
    case 'left':
      return 'no_left_turn'
    case 'right':
      return 'no_right_turn'
    case 'through':
      return 'no_straight_on'
    default:
      return 'no_u_turn'
  }
}
