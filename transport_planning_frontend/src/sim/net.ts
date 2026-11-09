import type { OsmDoc } from '@/core/doc'
import { heightAlong, linkHeights } from '@/core/elevation'
import { dist, leftNormal, offsetPolyline, polylineLength, Projector, sub, trimPolyline, unit } from '@/core/geo'
import { laneOffsets } from '@/core/lanes'
import {
  armsByLink,
  computeArmGeometries,
  type Connector,
  junctionConnectors,
} from '@/core/scene'
import { type Arm, buildNetwork, type Link, type Network, type TurnKind } from '@/core/topology'
import { signApplies } from '@/core/traffic'
import type { Tags, XY } from '@/core/types'

import type { Car } from './micro'

/** Путь, по которому машина едет непрерывно: полоса или соединение внутри узла. */
export class Track {
  readonly points: XY[]
  readonly cum: number[]
  readonly length: number
  readonly heights: number[]
  /** Машины по возрастанию положения: последняя в списке едет первой. */
  cars: Car[] = []

  constructor(points: XY[], heights: number[]) {
    this.points = points.length >= 2 ? points : [points[0] ?? { x: 0, y: 0 }, points[0] ?? { x: 0, y: 0 }]
    this.heights = heights
    this.cum = [0]
    for (let i = 1; i < this.points.length; i++) {
      this.cum.push(this.cum[i - 1]! + dist(this.points[i - 1]!, this.points[i]!))
    }
    this.length = Math.max(this.cum.at(-1) ?? 0, MIN_TRACK_M)
  }

  /** Записывает положение и направление на расстоянии s. Работает на каждой машине в каждом кадре. */
  sample(s: number, out: TrackPoint): void {
    const { cum, points, heights } = this
    const position = Math.max(0, Math.min(s, cum.at(-1) ?? 0))
    let low = 0
    let high = cum.length - 1
    while (high - low > 1) {
      const middle = (low + high) >> 1
      if (cum[middle]! <= position) low = middle
      else high = middle
    }
    const a = points[low]!
    const b = points[high]!
    const span = cum[high]! - cum[low]!
    const t = span > 1e-6 ? (position - cum[low]!) / span : 0
    out.x = a.x + (b.x - a.x) * t
    out.y = a.y + (b.y - a.y) * t
    out.z = heights[low]! + (heights[high]! - heights[low]!) * t
    if (span > 1e-6) out.heading = Math.atan2(b.x - a.x, b.y - a.y)
  }

  insert(car: Car): void {
    let index = this.cars.length
    while (index > 0 && this.cars[index - 1]!.s > car.s) index--
    this.cars.splice(index, 0, car)
  }

  remove(car: Car): void {
    const index = this.cars.indexOf(car)
    if (index >= 0) this.cars.splice(index, 1)
  }
}

export interface TrackPoint {
  x: number
  y: number
  z: number
  heading: number
}

const MIN_TRACK_M = 0.5

export class SimLane extends Track {
  connectors: SimConnector[] = []
  /** Соединения, по которым на полосу въезжают. */
  feeders: SimConnector[] = []

  constructor(
    readonly edge: SimEdge,
    /** Номер слева направо по ходу движения. */
    readonly index: number,
    points: XY[],
    heights: number[],
  ) {
    super(points, heights)
  }
}

export interface ConflictPoint {
  other: SimConnector
  /** Где на другом соединении находится точка конфликта. */
  atOther: number
  /** У другого соединения преимущество при проезде. */
  otherHasPriority: boolean
}

export class SimConnector extends Track {
  conflicts: ConflictPoint[] = []
  /** Машины, которым уже разрешён въезд. */
  reserved = new Set<Car>()
  signal: SignalGroup | null = null
  phase = 0
  readonly speedLimit: number

  constructor(
    readonly node: number,
    readonly fromLane: SimLane,
    readonly toLane: SimLane,
    readonly kind: TurnKind,
    readonly continuation: boolean,
    points: XY[],
    heights: number[],
  ) {
    super(points, heights)
    this.speedLimit = continuation ? Number.POSITIVE_INFINITY : TURN_SPEED_MPS[kind]
  }
}

const TURN_SPEED_MPS: Record<TurnKind, number> = {
  through: 14,
  left: 7,
  right: 5.5,
  reverse: 4,
}

/** Участок дороги в одном направлении. */
export class SimEdge {
  lanes: SimLane[] = []
  /** Разрешённые переходы на следующие участки. */
  moves = new Map<SimEdge, TurnKind>()
  /** Полная длина вместе с площадками перекрёстков: для макромодели. */
  readonly length: number
  outline: XY[] = []
  /** На подходе стоит знак «Стоп» или «Уступи дорогу». */
  yields = false

  // Результаты микромодели
  speedRatio = 1
  carCount = 0
  queueCars = 0
  jamFor = 0
  queuePoint: XY | null = null

  constructor(
    readonly id: number,
    readonly link: Link,
    readonly forward: boolean,
    readonly from: number,
    readonly to: number,
    readonly tags: Tags,
  ) {
    this.length = link.length
  }

  get wayId(): number {
    return this.link.wayId
  }

  get laneCount(): number {
    return this.forward ? this.link.profile.forward : this.link.profile.backward
  }
}

export interface SignalGroup {
  nodes: number[]
  /** Длительность зелёного по фазам в секундах. */
  greens: number[]
  cycle: number
  offset: number
  /** Точки стоп-линий для отображения. */
  stops: { connector: SimConnector; x: number; y: number }[]
}

export interface SimNet {
  network: Network
  projector: Projector
  edges: SimEdge[]
  connectors: SimConnector[]
  outgoing: Map<number, SimEdge[]>
  incoming: Map<number, SimEdge[]>
  signals: SignalGroup[]
}

const CLASS_RANK: Record<string, number> = {
  motorway: 8,
  trunk: 7,
  primary: 6,
  secondary: 5,
  tertiary: 4,
  unclassified: 3,
  residential: 3,
  road: 3,
  living_street: 2,
  service: 1,
}

export function classRank(tags: Tags): number {
  return CLASS_RANK[(tags.highway ?? '').replace('_link', '')] ?? 1
}

const SIGNAL_CLUSTER_M = 45
const GREEN_MAIN_S = 32
const GREEN_SECOND_S = 22
export const YELLOW_S = 3
export const ALL_RED_S = 2
const GUESS_MIN_ARMS = 3
const GUESS_MIN_RANK = 5

function buildEdges(doc: OsmDoc, network: Network, net: SimNet): Map<Arm, { in?: SimEdge; out?: SimEdge }> {
  const geometries = computeArmGeometries(network)
  const linkArms = armsByLink(network)
  const byArm = new Map<Arm, { in?: SimEdge; out?: SimEdge }>()
  let nextId = 1

  for (const link of network.links) {
    const { start, end } = linkArms.get(link) ?? {}
    if (!start || !end) continue
    const tags = doc.ways.get(link.wayId)?.tags ?? {}
    if (tags.access === 'no' || tags.motor_vehicle === 'no' || tags.motorcar === 'no') continue

    const startGeometry = geometries.get(start)
    const endGeometry = geometries.get(end)
    const trimStart = startGeometry?.trim ?? 0
    const trimEnd = endGeometry?.trim ?? 0
    const trimmed = trimPolyline(link.points, trimStart, trimEnd)
    const offsets = laneOffsets(link.profile)
    const profile = linkHeights(doc, link)
    const trimmedLength = Math.max(polylineLength(trimmed), 1e-3)

    const makeEdge = (forward: boolean): void => {
      const count = forward ? link.profile.forward : link.profile.backward
      if (count === 0) return
      const edge = new SimEdge(
        nextId++,
        link,
        forward,
        forward ? link.nodes[0]! : link.nodes.at(-1)!,
        forward ? link.nodes.at(-1)! : link.nodes[0]!,
        tags,
      )
      edge.yields = link.nodes.some((id) => signApplies(doc.nodes.get(id)?.tags, forward))
      const startTangent = startGeometry?.mitreTangent ?? null
      const endTangent = endGeometry?.mitreTangent ?? null
      const list = forward ? offsets.forward : offsets.backward
      list.forEach((offset, index) => {
        let points = offsetPolyline(trimmed, offset, startTangent, endTangent)
        if (!forward) points = [...points].reverse()
        const laneLength = Math.max(polylineLength(points), 1e-3)
        let walked = 0
        const heights = points.map((point, i) => {
          if (i > 0) walked += dist(points[i - 1]!, point)
          const share = walked / laneLength
          const along = forward ? trimStart + share * trimmedLength : trimStart + (1 - share) * trimmedLength
          return heightAlong(profile, along)
        })
        edge.lanes.push(new SimLane(edge, index, points, heights))
      })
      // Контур всего направления: по нему подсвечивается загрузка
      const halfLane = link.profile.laneWidth / 2
      const outer = offsetPolyline(trimmed, list[list.length - 1]! + (forward ? -halfLane : halfLane), startTangent, endTangent)
      const inner = offsetPolyline(trimmed, list[0]! + (forward ? halfLane : -halfLane), startTangent, endTangent)
      edge.outline = [...outer, ...inner.reverse()]
      net.edges.push(edge)
      const inArm = forward ? end : start
      const outArm = forward ? start : end
      byArm.set(inArm, { ...byArm.get(inArm), in: edge })
      byArm.set(outArm, { ...byArm.get(outArm), out: edge })
    }
    makeEdge(true)
    makeEdge(false)
  }
  return byArm
}

function buildConnectors(doc: OsmDoc, network: Network, net: SimNet, byArm: Map<Arm, { in?: SimEdge; out?: SimEdge }>): void {
  const geometries = computeArmGeometries(network)
  for (const [node, arms] of network.arms) {
    if (arms.length < 2) continue
    const local: SimConnector[] = []
    const continuation = arms.length === 2
    const specs: Connector[] = junctionConnectors(doc, node, arms, geometries)
    for (const spec of specs) {
      const fromEdge = byArm.get(spec.from)?.in
      const toEdge = byArm.get(spec.to)?.out
      const fromLane = fromEdge?.lanes[spec.fromLane]
      const toLane = toEdge?.lanes[spec.toLane]
      if (!fromEdge || !toEdge || !fromLane || !toLane) continue
      const zFrom = fromLane.heights.at(-1) ?? 0
      const zTo = toLane.heights[0] ?? 0
      const heights = spec.points.map((_, i) => zFrom + ((zTo - zFrom) * i) / Math.max(1, spec.points.length - 1))
      const connector = new SimConnector(node, fromLane, toLane, spec.kind, continuation, spec.points, heights)
      fromLane.connectors.push(connector)
      toLane.feeders.push(connector)
      fromEdge.moves.set(toEdge, spec.kind)
      local.push(connector)
      net.connectors.push(connector)
    }
    computeConflicts(local)
  }
}

function crossingPoint(a: SimConnector, b: SimConnector): { onA: number; onB: number } | null {
  for (let i = 1; i < a.points.length; i++) {
    for (let j = 1; j < b.points.length; j++) {
      const p1 = a.points[i - 1]!
      const p2 = a.points[i]!
      const q1 = b.points[j - 1]!
      const q2 = b.points[j]!
      const r = sub(p2, p1)
      const s = sub(q2, q1)
      const denominator = r.x * s.y - r.y * s.x
      if (Math.abs(denominator) < 1e-9) continue
      const dx = q1.x - p1.x
      const dy = q1.y - p1.y
      const t = (dx * s.y - dy * s.x) / denominator
      const u = (dx * r.y - dy * r.x) / denominator
      if (t < 0 || t > 1 || u < 0 || u > 1) continue
      return { onA: a.cum[i - 1]! + t * (a.cum[i]! - a.cum[i - 1]!), onB: b.cum[j - 1]! + u * (b.cum[j]! - b.cum[j - 1]!) }
    }
  }
  return null
}

const TURN_ORDER: Record<TurnKind, number> = { through: 3, right: 2, left: 1, reverse: 0 }

/** Преимущество по правилам: главная дорога, затем прямо перед поворотом, затем помеха справа. */
function hasPriority(a: SimConnector, b: SimConnector): boolean {
  const yieldsA = a.fromLane.edge.yields
  if (yieldsA !== b.fromLane.edge.yields) return !yieldsA
  const rankA = classRank(a.fromLane.edge.tags)
  const rankB = classRank(b.fromLane.edge.tags)
  if (rankA !== rankB) return rankA > rankB
  if (TURN_ORDER[a.kind] !== TURN_ORDER[b.kind] && a.kind !== 'through' && b.kind !== 'through') {
    return TURN_ORDER[a.kind] > TURN_ORDER[b.kind]
  }
  if (a.kind === 'through' && b.kind === 'left') return true
  if (b.kind === 'through' && a.kind === 'left') return false
  const dirA = unit(sub(a.points[1] ?? a.points[0]!, a.points[0]!))
  const toB = sub(b.points[0]!, a.points[0]!)
  return leftNormal(dirA).x * toB.x + leftNormal(dirA).y * toB.y > 0 ? false : true
}

function computeConflicts(connectors: SimConnector[]): void {
  for (let i = 0; i < connectors.length; i++) {
    for (let j = i + 1; j < connectors.length; j++) {
      const a = connectors[i]!
      const b = connectors[j]!
      if (a.fromLane === b.fromLane) continue
      let onA: number
      let onB: number
      if (a.toLane === b.toLane) {
        onA = a.length
        onB = b.length
      } else {
        const crossing = crossingPoint(a, b)
        if (!crossing) continue
        onA = crossing.onA
        onB = crossing.onB
      }
      const aFirst = hasPriority(a, b)
      a.conflicts.push({ other: b, atOther: onB, otherHasPriority: !aFirst })
      b.conflicts.push({ other: a, atOther: onA, otherHasPriority: aFirst })
    }
  }
}

function signalNodes(doc: OsmDoc, network: Network, guess: boolean): number[] {
  const nodes: number[] = []
  for (const [id, arms] of network.arms) {
    const tags = doc.nodes.get(id)?.tags
    if (tags?.highway === 'traffic_signals' && arms.length >= 2) {
      nodes.push(id)
      continue
    }
    if (!guess || arms.length < GUESS_MIN_ARMS) continue
    // Светофор нужен там, где пересекаются две крупные дороги, а не там, где одна в них продолжается
    const major = arms.filter((arm) => classRank(doc.ways.get(arm.link.wayId)?.tags ?? {}) >= GUESS_MIN_RANK)
    const crossing = major.some((a) => major.some((b) => Math.abs(a.dir.x * b.dir.x + a.dir.y * b.dir.y) < 0.7))
    if (crossing) nodes.push(id)
  }
  return nodes
}

/** Светофоры рядом работают как один объект: иначе соседние стоп-линии спорили бы друг с другом. */
function buildSignals(doc: OsmDoc, net: SimNet, guess: boolean): void {
  const projector = net.projector
  const nodes = signalNodes(doc, net.network, guess)
  const seen = new Set<number>()
  nodes.forEach((start, groupIndex) => {
    if (seen.has(start)) return
    const members = [start]
    seen.add(start)
    for (let i = 0; i < members.length; i++) {
      const origin = projector.toXY(doc.node(members[i]!))
      for (const candidate of nodes) {
        if (seen.has(candidate)) continue
        if (dist(origin, projector.toXY(doc.node(candidate))) <= SIGNAL_CLUSTER_M) {
          seen.add(candidate)
          members.push(candidate)
        }
      }
    }
    const memberSet = new Set(members)
    const controlled = net.connectors.filter((connector) => memberSet.has(connector.node))
    if (controlled.length === 0) return

    const headings = controlled.map((connector) => {
      const lane = connector.fromLane
      const direction = unit(sub(lane.points.at(-1)!, lane.points.at(-2) ?? lane.points[0]!))
      return Math.atan2(direction.x, direction.y)
    })
    const axis = dominantAxis(controlled, headings)
    const group: SignalGroup = {
      nodes: members,
      greens: [GREEN_MAIN_S, GREEN_SECOND_S],
      cycle: GREEN_MAIN_S + GREEN_SECOND_S + 2 * (YELLOW_S + ALL_RED_S),
      offset: (groupIndex * 17) % 60,
      stops: [],
    }
    const stopLanes = new Set<SimLane>()
    controlled.forEach((connector, index) => {
      connector.signal = group
      const difference = Math.abs(((headings[index]! - axis + Math.PI * 2.5) % Math.PI) - Math.PI / 2)
      connector.phase = difference < Math.PI / 4 ? 1 : 0
      if (!stopLanes.has(connector.fromLane)) {
        stopLanes.add(connector.fromLane)
        const end = connector.fromLane.points.at(-1)!
        group.stops.push({ connector, x: end.x, y: end.y })
      }
    })
    net.signals.push(group)
  })
}

function dominantAxis(connectors: SimConnector[], headings: number[]): number {
  const weights = new Map<number, number>()
  connectors.forEach((connector, index) => {
    const bucket = Math.round(((headings[index]! + Math.PI) % Math.PI) / (Math.PI / 12))
    weights.set(bucket, (weights.get(bucket) ?? 0) + classRank(connector.fromLane.edge.tags))
  })
  let best = 0
  let weight = -1
  for (const [bucket, value] of weights) {
    if (value > weight) {
      weight = value
      best = bucket
    }
  }
  return best * (Math.PI / 12)
}

export function buildSimNet(doc: OsmDoc, projector: Projector, guessSignals: boolean): SimNet {
  const network = buildNetwork(doc, projector)
  const net: SimNet = {
    network,
    projector,
    edges: [],
    connectors: [],
    outgoing: new Map(),
    incoming: new Map(),
    signals: [],
  }
  const byArm = buildEdges(doc, network, net)
  buildConnectors(doc, network, net, byArm)
  for (const edge of net.edges) {
    const out = net.outgoing.get(edge.from)
    if (out) out.push(edge)
    else net.outgoing.set(edge.from, [edge])
    const incoming = net.incoming.get(edge.to)
    if (incoming) incoming.push(edge)
    else net.incoming.set(edge.to, [edge])
  }
  buildSignals(doc, net, guessSignals)
  return net
}

/** Состояние сигнала для фазы в момент времени. */
export function signalState(group: SignalGroup, phase: number, time: number): 'green' | 'yellow' | 'red' {
  const t = (time + group.offset) % group.cycle
  const main = group.greens[0]!
  const second = group.greens[1]!
  const phaseStart = phase === 0 ? 0 : main + YELLOW_S + ALL_RED_S
  const green = phase === 0 ? main : second
  const local = t - phaseStart
  if (local < 0 || local >= green + YELLOW_S) return 'red'
  return local < green ? 'green' : 'yellow'
}
