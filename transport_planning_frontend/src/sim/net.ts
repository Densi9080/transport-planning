import type { OsmDoc } from '@/core/doc'
import { heightAlong, linkHeights } from '@/core/elevation'
import { dist, leftNormal, offsetPolyline, polylineLength, Projector, quadraticCurve, sub, trimPolyline, unit } from '@/core/geo'
import { laneOffsets } from '@/core/lanes'
import {
  armsByLink,
  computeArmGeometries,
  type Connector,
  junctionConnectors,
} from '@/core/scene'
import {
  colorAt,
  cycleLength,
  DEFAULT_ALL_RED_S,
  DEFAULT_YELLOW_S,
  movementKey,
  parseSignalPlan,
  type PhaseWindow,
  phaseWindows,
  type SignalColor,
  type SignalPlan,
} from '@/core/signals'
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
  /** Кривые, перед которыми нужно сбросить скорость: положение и допустимая скорость. */
  readonly curves: { s: number; speed: number }[] = []
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
    for (let i = 1; i < this.points.length - 1; i++) {
      const before = sub(this.points[i]!, this.points[i - 1]!)
      const after = sub(this.points[i + 1]!, this.points[i]!)
      const lengths = Math.hypot(before.x, before.y) + Math.hypot(after.x, after.y)
      const angle = Math.abs(Math.atan2(before.x * after.y - before.y * after.x, before.x * after.x + before.y * after.y))
      if (angle < MIN_CURVE_ANGLE || lengths < 1e-3) continue
      const radius = lengths / 2 / angle
      const speed = Math.sqrt(LATERAL_ACCEL * radius)
      if (speed < MAX_CURVE_SPEED) this.curves.push({ s: this.cum[i]!, speed })
    }
  }

  /** Самая низкая допустимая скорость на всём пути. */
  get slowestCurve(): number {
    return this.curves.reduce((low, curve) => Math.min(low, curve.speed), Number.POSITIVE_INFINITY)
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
const LATERAL_ACCEL = 2.4
const MIN_CURVE_ANGLE = 0.02
const MAX_CURVE_SPEED = 22
const CORNER_MAX_CUT_M = 9
const CORNER_MIN_ANGLE = 0.05
const CORNER_STEP_ANGLE = 0.14

/** Дороги в OSM — ломаные. По излому машина ехать не может, поэтому траектория скругляется. */
function roundCorners(points: XY[]): XY[] {
  if (points.length < 3) return points
  const result: XY[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const c = points[i + 1]!
    const toA = sub(a, b)
    const toC = sub(c, b)
    const lenA = Math.hypot(toA.x, toA.y)
    const lenC = Math.hypot(toC.x, toC.y)
    if (lenA < 1e-3 || lenC < 1e-3) continue
    const angle = Math.PI - Math.abs(Math.atan2(toA.x * toC.y - toA.y * toC.x, toA.x * toC.x + toA.y * toC.y))
    if (angle < CORNER_MIN_ANGLE) {
      result.push(b)
      continue
    }
    const cut = Math.min(CORNER_MAX_CUT_M, lenA * 0.45, lenC * 0.45)
    const start = { x: b.x + (toA.x / lenA) * cut, y: b.y + (toA.y / lenA) * cut }
    const end = { x: b.x + (toC.x / lenC) * cut, y: b.y + (toC.y / lenC) * cut }
    const steps = Math.max(3, Math.ceil(angle / CORNER_STEP_ANGLE))
    result.push(...quadraticCurve(start, b, end, steps))
  }
  result.push(points.at(-1)!)
  return result
}

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
  /** Номера фаз плана, в которых у манёвра зелёный. */
  phases: number[] = []
  readonly speedLimit: number
  readonly movement: string

  constructor(
    readonly node: number,
    readonly fromLane: SimLane,
    readonly toLane: SimLane,
    readonly kind: TurnKind,
    readonly continuation: boolean,
    readonly fromNeighbor: number,
    readonly toNeighbor: number,
    points: XY[],
    heights: number[],
  ) {
    super(points, heights)
    this.movement = movementKey(node, fromNeighbor, toNeighbor)
    this.speedLimit = Math.min(continuation ? Number.POSITIVE_INFINITY : TURN_SPEED_MPS[kind], this.slowestCurve)
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
  /** Узел, в теге которого хранится план. */
  owner: number
  nodes: number[]
  plan: SignalPlan
  /** План задан вручную, а не построен автоматически. */
  custom: boolean
  windows: PhaseWindow[]
  cycle: number
  /** Точки стоп-линий для отображения. */
  stops: { connector: SimConnector; x: number; y: number }[]
  connectors: SimConnector[]
  /** Манёвры, которых нет в заданном плане. */
  unassigned: number
  /** Сдвиг автоматического плана: чтобы соседние перекрёстки не переключались одновременно. */
  autoOffset: number
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
const GREEN_THROUGH_S = 40
const GREEN_PEDESTRIAN_S = 15
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
        let points = roundCorners(offsetPolyline(trimmed, offset, startTangent, endTangent))
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
      const widths = forward ? link.profile.widthsForward : link.profile.widthsBackward
      const halfOuter = widths[widths.length - 1]! / 2
      const halfInner = widths[0]! / 2
      const outer = offsetPolyline(trimmed, list[list.length - 1]! + (forward ? -halfOuter : halfOuter), startTangent, endTangent)
      const inner = offsetPolyline(trimmed, list[0]! + (forward ? halfInner : -halfInner), startTangent, endTangent)
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
      const connector = new SimConnector(
        node,
        fromLane,
        toLane,
        spec.kind,
        continuation,
        spec.from.neighbor,
        spec.to.neighbor,
        spec.points,
        heights,
      )
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

function approachHeading(connector: SimConnector): number {
  const lane = connector.fromLane
  const direction = unit(sub(lane.points.at(-1)!, lane.points.at(-2) ?? lane.points[0]!))
  return Math.atan2(direction.x, direction.y)
}

/** Фаза манёвра по оси движения: встречные потоки идут вместе, поперечные ждут. */
function axisPhase(connector: SimConnector, axis: number): number {
  const difference = Math.abs(((approachHeading(connector) - axis + Math.PI * 2.5) % Math.PI) - Math.PI / 2)
  return difference < Math.PI / 4 ? 0 : 1
}

/** План по умолчанию: две фазы. Если подходы все по одной оси, вторая фаза отдана пешеходам. */
export function autoPlan(connectors: SimConnector[]): SignalPlan {
  const axis = dominantAxis(connectors)
  const phases: string[][] = [[], []]
  for (const connector of connectors) {
    const list = phases[axisPhase(connector, axis)]!
    if (!list.includes(connector.movement)) list.push(connector.movement)
  }
  const pedestrianOnly = phases[1]!.length === 0
  return {
    offset: 0,
    yellow: DEFAULT_YELLOW_S,
    allRed: DEFAULT_ALL_RED_S,
    phases: [
      { green: pedestrianOnly ? GREEN_THROUGH_S : GREEN_MAIN_S, movements: phases[0]! },
      { green: pedestrianOnly ? GREEN_PEDESTRIAN_S : GREEN_SECOND_S, movements: phases[1]! },
    ],
  }
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
    members.sort((a, b) => a - b)
    const memberSet = new Set(members)
    const controlled = net.connectors.filter((connector) => memberSet.has(connector.node))
    if (controlled.length === 0) return

    const owner = planOwner(doc, members)
    const plan = autoPlan(controlled)
    const group: SignalGroup = {
      owner,
      nodes: members,
      plan,
      custom: false,
      windows: [],
      cycle: 0,
      stops: [],
      connectors: controlled,
      unassigned: 0,
      autoOffset: (groupIndex * 17) % 60,
    }
    const stored = parseSignalPlan(doc.node(owner).tags)
    assignPlan(group, stored ?? { ...plan, offset: group.autoOffset }, stored !== null)

    const stopLanes = new Set<SimLane>()
    for (const connector of controlled) {
      connector.signal = group
      if (!stopLanes.has(connector.fromLane)) {
        stopLanes.add(connector.fromLane)
        const end = connector.fromLane.points.at(-1)!
        group.stops.push({ connector, x: end.x, y: end.y })
      }
    }
    net.signals.push(group)
  })
}

/** План лежит на узле с настоящим светофором: узлы рядом могут быть лишь предположением модели. */
function planOwner(doc: OsmDoc, members: number[]): number {
  return (
    members.find((id) => parseSignalPlan(doc.node(id).tags)) ??
    members.find((id) => doc.node(id).tags?.highway === 'traffic_signals') ??
    members[0]!
  )
}

function assignPlan(group: SignalGroup, plan: SignalPlan, custom: boolean): void {
  group.plan = plan
  group.custom = custom
  group.windows = phaseWindows(plan)
  group.cycle = cycleLength(plan)
  const axis = dominantAxis(group.connectors)
  const unassigned = new Set<string>()
  for (const connector of group.connectors) {
    connector.phases = plan.phases.flatMap((phase, index) => (phase.movements.includes(connector.movement) ? [index] : []))
    if (connector.phases.length === 0) {
      // Новый манёвр, которого нет в плане: без зелёного он заблокировал бы подход навсегда
      unassigned.add(connector.movement)
      connector.phases = [Math.min(axisPhase(connector, axis), plan.phases.length - 1)]
    }
  }
  group.unassigned = unassigned.size
}

/** Перечитывает планы из тегов, не трогая остальную сеть: машины на дорогах остаются на своих местах. */
export function refreshSignalPlans(doc: OsmDoc, net: SimNet): void {
  for (const group of net.signals) {
    group.owner = planOwner(doc, group.nodes)
    const stored = parseSignalPlan(doc.node(group.owner).tags)
    assignPlan(group, stored ?? { ...autoPlan(group.connectors), offset: group.autoOffset }, stored !== null)
  }
}

function dominantAxis(connectors: SimConnector[]): number {
  const weights = new Map<number, number>()
  for (const connector of connectors) {
    const bucket = Math.round(((approachHeading(connector) + Math.PI) % Math.PI) / (Math.PI / 12))
    weights.set(bucket, (weights.get(bucket) ?? 0) + classRank(connector.fromLane.edge.tags))
  }
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

/** Сигнал манёвра в момент времени. */
export function signalState(connector: SimConnector, time: number): SignalColor {
  const group = connector.signal
  if (!group) return 'green'
  const cycleTime = (time + group.plan.offset) % group.cycle
  return colorAt(group.plan, group.windows, connector.phases, cycleTime)
}

/** Момент цикла светофора во время модели. */
export function signalCycleTime(group: SignalGroup, time: number): number {
  return (time + group.plan.offset) % group.cycle
}

/** Сколько секунд назад манёвру включился красный: только что сменившийся сигнал ещё пробуют проскочить. */
export function secondsSinceRed(connector: SimConnector, time: number): number {
  const group = connector.signal
  if (!group) return Number.POSITIVE_INFINITY
  for (let back = 0; back < group.cycle; back++) {
    if (signalState(connector, time - back) !== 'red') return back
  }
  return group.cycle
}

/** Светофорный объект, в который входит узел. Для редактора фаз. */
export function signalGroupAt(net: SimNet, node: number): SignalGroup | null {
  return net.signals.find((group) => group.nodes.includes(node)) ?? null
}
