import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'

import type { OsmDoc } from './doc'
import { heightAlong, linkHeights } from './elevation'
import {
  add,
  bearing,
  dist,
  dot,
  leftNormal,
  lineIntersection,
  offsetPolyline,
  pointAlong,
  Projector,
  quadraticCurve,
  scale,
  sub,
  trimPolyline,
  unit,
  cross,
  nearestOnSegment,
} from './geo'
import {
  type DividerMode,
  dividerMode,
  DRIVABLE,
  isOneway,
  laneOffsets,
  type LaneProfile,
  totalWidth,
  turnAllows,
} from './lanes'
import {
  type Arm,
  buildNetwork,
  isMovementAllowed,
  type Link,
  type Network,
  restrictionsAt,
  connectivityAt,
  type TurnKind,
  turnKind,
} from './topology'
import { reducedSections, SECTION_SPEEDS } from './traffic'
import type { OWay, XY } from './types'

export type SceneLayer =
  | 'surface'
  | 'junctions'
  | 'markings'
  | 'turnPaths'
  | 'arrows'
  | 'crossings'
  | 'signals'
  | 'trafficSigns'
  | 'minor'
  | 'graphLinks'
  | 'graphNodes'
  | 'labels'
  | 'elevated'

export type Scene = Record<SceneLayer, FeatureCollection>

export interface StaticScene {
  buildings: FeatureCollection
  landuse: FeatureCollection
  rail: FeatureCollection
  water: FeatureCollection
  /** Прочие площадные и линейные объекты: ограды, платформы и всё, что не вошло в слои выше. */
  other: FeatureCollection
  /** Точечные объекты с атрибутами: магазины, остановки, шлагбаумы. */
  points: FeatureCollection
}

const EMPTY = (): Feature[] => []
const CORNER_MARGIN_M = 2.5
const MAX_TRIM_SHARE = 0.45
const COLLINEAR_COS = -0.92
const LANE_ARROW_INTERVAL_M = 70
const LANE_ARROW_FROM_END_M = 7
const ZEBRA_STRIPE_M = 0.55
const ZEBRA_GAP_M = 0.65
const ZEBRA_DEPTH_M = 3.2
const HALF_LANE_M = 1.75
const ZIGZAG_LENGTH_M = 20
const ZIGZAG_STEPS = 16
const ZIGZAG_DEPTH_M = 0.9
const STOP_ROAD_REACH_M = 30
const ELEVATED_STEP_M = 4
const HALF_DIVIDER_M = 0.12
const MIN_VISIBLE_HEIGHT_M = 0.15
const DECK_THICKNESS_M = 0.5

export interface ArmGeometry {
  arm: Arm
  trim: number
  /** Подрезанная часть начинается здесь: ось и поперечная нормаль считаются от узла наружу. */
  center: XY
  dir: XY
  halfLeft: number
  halfRight: number
  mitreTangent: XY | null
}

function polygonFeature(
  ring: XY[],
  projector: Projector,
  properties: Record<string, unknown>,
): Feature<Polygon> {
  const coordinates = ring.map((p) => projector.toLngLat(p))
  if (coordinates.length > 0) coordinates.push(coordinates[0]!)
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [coordinates] } }
}

function lineFeature(
  points: XY[],
  projector: Projector,
  properties: Record<string, unknown>,
): Feature<LineString> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: points.map((p) => projector.toLngLat(p)) },
  }
}

function pointFeature(
  point: XY,
  projector: Projector,
  properties: Record<string, unknown>,
): Feature<Point> {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: projector.toLngLat(point) } }
}

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features }
}

function levelOf(link: Link): number {
  if (link.level > 0 || link.bridge) return 1
  if (link.level < 0 || link.tunnel) return -1
  return 0
}

/** Сколько отрезать от конца дороги, чтобы её края не заходили на соседние дороги. */
function armGeometry(arms: Arm[]): Map<Arm, ArmGeometry> {
  const result = new Map<Arm, ArmGeometry>()
  const sorted = [...arms].sort(
    (a, b) => Math.atan2(a.dir.y, a.dir.x) - Math.atan2(b.dir.y, b.dir.x),
  )
  const seamless = isSeamless(sorted)

  sorted.forEach((arm, index) => {
    const width = totalWidth(arm.link.profile)
    let trim = 0
    if (!seamless && sorted.length > 1) {
      trim = 1.5
      for (const delta of [-1, 1]) {
        const other = sorted[(index + delta + sorted.length) % sorted.length]!
        if (other === arm) continue
        const cos = dot(arm.dir, other.dir)
        const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
        if (cos < COLLINEAR_COS) continue
        const otherWidth = totalWidth(other.link.profile)
        const needed = (otherWidth / 2 + (width / 2) * cos) / Math.max(sin, 0.3) + CORNER_MARGIN_M
        trim = Math.max(trim, needed)
      }
      trim = Math.min(trim, arm.link.length * MAX_TRIM_SHARE)
    }
    const along = arm.atStart ? trim : arm.link.length - trim
    const { point } = pointAlong(arm.link.points, along)
    const offsets = laneOffsets(arm.link.profile)
    // Смещения считаются по ходу дороги: для подхода со стороны конца лево и право меняются местами
    const halfLeft = arm.atStart ? offsets.left : -offsets.right
    const halfRight = arm.atStart ? -offsets.right : offsets.left

    let mitreTangent: XY | null = null
    if (seamless) {
      const other = sorted[(index + 1) % 2]!
      const outward = unit(sub(arm.dir, other.dir))
      // Касательная задаётся по ходу дороги, а arm.dir смотрит от узла наружу
      mitreTangent = arm.atStart ? outward : scale(outward, -1)
    }

    result.set(arm, { arm, trim, center: point, dir: arm.dir, halfLeft, halfRight, mitreTangent })
  })
  return result
}

/** Две дороги одной ширины, идущие почти по прямой, стыкуются без отдельной площадки. */
function isSeamless(arms: Arm[]): boolean {
  if (arms.length !== 2) return false
  const [a, b] = arms as [Arm, Arm]
  if (dot(a.dir, b.dir) > COLLINEAR_COS * 0.75) return false
  return Math.abs(totalWidth(a.link.profile) - totalWidth(b.link.profile)) < 0.01
}

/** Правый и левый углы конца дороги, если смотреть от узла наружу. */
function armCorners(geometry: ArmGeometry): { right: XY; left: XY } {
  const normal = leftNormal(geometry.dir)
  return {
    left: add(geometry.center, scale(normal, geometry.halfLeft)),
    right: add(geometry.center, scale(normal, -geometry.halfRight)),
  }
}

function junctionRing(geometries: ArmGeometry[]): XY[] {
  const sorted = [...geometries].sort(
    (a, b) => Math.atan2(a.dir.y, a.dir.x) - Math.atan2(b.dir.y, b.dir.x),
  )
  const ring: XY[] = []
  sorted.forEach((geometry, index) => {
    const next = sorted[(index + 1) % sorted.length]!
    const corners = armCorners(geometry)
    const nextCorners = armCorners(next)
    ring.push(corners.right, corners.left)
    const control = lineIntersection(corners.left, geometry.dir, nextCorners.right, next.dir)
    const span = dist(corners.left, nextCorners.right)
    if (control && dist(control, corners.left) < span * 2 + 4 && dist(control, nextCorners.right) < span * 2 + 4) {
      ring.push(...quadraticCurve(corners.left, control, nextCorners.right, 6).slice(1, -1))
    }
  })
  return ring
}

function laneMarkingsFor(
  link: Link,
  points: XY[],
  startTangent: XY | null,
  endTangent: XY | null,
  level: number,
  markings: Feature[],
  projector: Projector,
  noLines: boolean,
): void {
  const profile = link.profile
  const offsets = laneOffsets(profile)
  const base = { wayId: link.wayId, level }
  const line = (offset: number, kind: string) =>
    markings.push(
      lineFeature(offsetPolyline(points, offset, startTangent, endTangent), projector, { ...base, kind }),
    )

  line(offsets.left, 'edge')
  line(offsets.right, 'edge')
  if (noLines) return

  if (profile.forward > 0 && profile.backward > 0) line(offsets.divider, 'divider')
  // Линия показывает правило: пунктир можно пересекать, сплошную нельзя, а двойная разрешает только с одной стороны
  const divider = (offset: number, mode: DividerMode, leftSide: number) => {
    if (mode === 'both') line(offset, 'lane')
    else if (mode === 'none') line(offset, 'lane-solid')
    else {
      const dashedSide = mode === 'to_right' ? leftSide : -leftSide
      line(offset + dashedSide * HALF_DIVIDER_M, 'lane')
      line(offset - dashedSide * HALF_DIVIDER_M, 'lane-solid')
    }
  }
  for (let i = 1; i < profile.forward; i++) {
    divider(offsets.forwardBoundaries[i - 1]!, dividerMode(profile.changeForward, i - 1), 1)
  }
  for (let i = 1; i < profile.backward; i++) {
    divider(offsets.backwardBoundaries[i - 1]!, dividerMode(profile.changeBackward, i - 1), -1)
  }
}

function arrowName(turn: string | undefined): string {
  if (!turn) return 'through'
  const left = turnAllows(turn, 'left')
  const right = turnAllows(turn, 'right')
  const through = turnAllows(turn, 'through')
  if (left && through && right) return 'all'
  if (left && right) return 'left_right'
  if (left && through) return 'through_left'
  if (right && through) return 'through_right'
  if (left) return 'left'
  if (right) return 'right'
  if (turnAllows(turn, 'reverse')) return 'reverse'
  return 'through'
}

function laneArrows(
  link: Link,
  points: XY[],
  level: number,
  arrows: Feature[],
  projector: Projector,
): void {
  const total = pathLength(points)
  if (total < 8) return
  const offsets = laneOffsets(link.profile)

  const place = (
    laneOffset: number,
    turn: string | undefined,
    reversed: boolean,
  ) => {
    const positions: number[] = []
    // Стрелка с манёврами ставится перед концом дороги, по ходу движения
    positions.push(Math.max(0, total - LANE_ARROW_FROM_END_M))
    for (let along = total - LANE_ARROW_INTERVAL_M; along > 8; along -= LANE_ARROW_INTERVAL_M) {
      positions.push(along)
    }
    positions.forEach((travelled, index) => {
      const position = reversed ? total - travelled : travelled
      const { point, dir } = pointAlong(points, position)
      const travel = reversed ? scale(dir, -1) : dir
      arrows.push(
        pointFeature(add(point, scale(leftNormal(dir), laneOffset)), projector, {
          icon: index === 0 ? arrowName(turn) : 'through',
          rot: bearing(travel),
          wayId: link.wayId,
          level,
        }),
      )
    })
  }

  offsets.forward.forEach((offset, i) => place(offset, link.profile.turnsForward?.[i], false))
  offsets.backward.forEach((offset, i) => place(offset, link.profile.turnsBackward?.[i], true))
}

function pathLength(points: XY[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  return total
}

/** Какие полосы подхода выполняют манёвр: по turn:lanes, а если их нет, то по правилам разметки. */
/** Стоп-линия 1.12 поперёк всех полос подхода. */
function stopLine(geometry: ArmGeometry, arm: Arm, projector: Projector): Feature {
  const first = lanePoint(geometry, 0, true)
  const last = lanePoint(geometry, arm.lanesIn - 1, true)
  const across = arm.lanesIn > 1 ? unit(sub(last, first)) : leftNormal(geometry.dir)
  return lineFeature([sub(first, scale(across, HALF_LANE_M)), add(last, scale(across, HALF_LANE_M))], projector, { kind: 'stop-line', level: levelOf(arm.link) })
}

/** Зигзаг 1.17 на правом краю проезжей части: место остановки маршрутного транспорта. */
function stopZigzag(link: Link, along: number, side: 1 | -1, projector: Projector): Feature {
  const edge = (side * totalWidth(link.profile)) / 2
  const points: XY[] = []
  for (let i = 0; i <= ZIGZAG_STEPS; i++) {
    const position = Math.max(0, Math.min(link.length, along + (i / ZIGZAG_STEPS - 0.5) * ZIGZAG_LENGTH_M))
    const { point, dir } = pointAlong(link.points, position)
    const inset = i % 2 === 0 ? 0 : -side * ZIGZAG_DEPTH_M
    points.push(add(point, scale(leftNormal(dir), edge + inset)))
  }
  return lineFeature(points, projector, { kind: 'zigzag', level: link.level })
}

/** Ближайшее к остановке место на дороге: в OSM знак остановки часто стоит на тротуаре. */
function nearestRoadPlace(network: Network, point: XY): { link: Link; along: number; side: 1 | -1 } | null {
  let best: { link: Link; along: number; side: 1 | -1 } | null = null
  let bestDistance = STOP_ROAD_REACH_M
  for (const link of network.links) {
    if (link.bridge || link.tunnel) continue
    let walked = 0
    for (let i = 1; i < link.points.length; i++) {
      const a = link.points[i - 1]!
      const b = link.points[i]!
      const hit = nearestOnSegment(point, a, b)
      if (hit.distance < bestDistance) {
        bestDistance = hit.distance
        const offset = cross(unit(sub(b, a)), sub(point, hit.point))
        best = { link, along: walked + dist(a, hit.point), side: offset > 0 ? 1 : -1 }
      }
      walked += dist(a, b)
    }
  }
  return best
}

function lanesForTurn(arm: Arm, kind: TurnKind, kinds: Set<TurnKind>, ignoreTags = false): number[] {
  const profile = arm.link.profile
  const turns = arm.atStart ? profile.turnsBackward : profile.turnsForward
  const count = arm.lanesIn
  const all = Array.from({ length: count }, (_, i) => i)

  if (!ignoreTags && turns && turns.length === count && turns.some((turn) => turn && turn !== 'none')) {
    const tagged = all.filter((i) => turnAllows(turns[i] ?? '', kind))
    if (tagged.length > 0) return tagged
    return kind === 'through' ? all.filter((i) => !turns[i] || turns[i] === 'none') : []
  }
  if (count === 1) return [0]
  if (kind === 'left') return [0]
  if (kind === 'right') return [count - 1]
  if (kind === 'through') return all
  return kinds.has('left') ? [] : [0]
}

function outLaneFor(index: number, usedCount: number, outCount: number, kind: TurnKind): number {
  if (outCount <= 1) return 0
  if (kind === 'right') return outCount - 1 - Math.min(usedCount - 1 - index, outCount - 1)
  if (kind === 'left') return Math.min(index, outCount - 1)
  const shift = outCount - usedCount
  return Math.max(0, Math.min(outCount - 1, index + Math.max(0, shift)))
}

/** Точка на полосе в месте стыка с площадкой перекрёстка. */
function lanePoint(geometry: ArmGeometry, laneIndex: number, entering: boolean): XY {
  const offsets = laneOffsets(geometry.arm.link.profile)
  const atStart = geometry.arm.atStart
  const list = entering === atStart ? offsets.backward : offsets.forward
  const offset = list[laneIndex] ?? 0
  const roadDir = atStart ? geometry.dir : scale(geometry.dir, -1)
  return add(geometry.center, scale(leftNormal(roadDir), offset))
}

const CURVE_STEPS = 12

/**
 * Траектория манёвра от конца полосы подхода к началу полосы выезда.
 * Кривая выходит из стоп-линии по ходу движения и входит в выезд по его направлению.
 * Пересечение направлений годится в опорную точку, только если оно впереди подхода и позади выезда:
 * иначе кривая сначала уходила бы назад. В остальных случаях строится кубическая кривая,
 * касательная к обеим полосам.
 */
export function turnCurve(start: XY, travelIn: XY, end: XY, travelOut: XY): XY[] {
  const span = dist(start, end)
  if (span < 1e-6) return [start, end]
  const denominator = cross(travelIn, travelOut)
  if (Math.abs(denominator) > 1e-3) {
    const ahead = cross(sub(end, start), travelOut) / denominator
    const behind = cross(travelIn, sub(end, start)) / denominator
    // ahead: насколько точка впереди подхода, behind: насколько она позади начала выезда
    if (ahead > 0 && behind > 0 && ahead < span * 2 && behind < span * 2) {
      return quadraticCurve(start, add(start, scale(travelIn, ahead)), end, CURVE_STEPS)
    }
  }
  const reach = span / 3
  const c1 = add(start, scale(travelIn, reach))
  const c2 = sub(end, scale(travelOut, reach))
  return Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const t = i / CURVE_STEPS
    const u = 1 - t
    return {
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    }
  })
}

/** Соединение полосы подхода с полосой выезда внутри узла. */
export interface Connector {
  node: number
  from: Arm
  to: Arm
  /** Номера полос слева направо по ходу движения. */
  fromLane: number
  toLane: number
  kind: TurnKind
  points: XY[]
}

/**
 * Манёвры узла по полосам. Отрисовка и симуляция берут их отсюда,
 * поэтому машины едут ровно по тем траекториям, которые показаны на карте.
 */
export function junctionConnectors(
  doc: OsmDoc,
  node: number,
  arms: Arm[],
  geometries: Map<Arm, ArmGeometry>,
): Connector[] {
  const restrictions = restrictionsAt(doc, node)
  const explicit = connectivityAt(doc, node)
  const connectors: Connector[] = []
  // Стык двух дорог — это продолжение одной дороги, а не поворот
  const continuation = arms.length === 2

  for (const from of arms) {
    if (from.lanesIn === 0) continue
    const fromGeometry = geometries.get(from)!
    const kinds = new Set<TurnKind>()
    for (const to of arms) {
      if (to.lanesOut > 0 && to.neighbor !== from.neighbor) kinds.add(turnKind(from, to))
    }

    const collect = (ignoreTags: boolean): Connector[] => {
      const found: Connector[] = []
      for (const to of arms) {
        if (to.lanesOut === 0 || to.neighbor === from.neighbor) continue
        const kind = turnKind(from, to)
        if (!continuation && kind === 'reverse') continue
        if (!isMovementAllowed(from, to, restrictions)) continue
        const toGeometry = geometries.get(to)!
        const rule = explicit.find((item) => item.from === from.link.wayId && item.to === to.link.wayId)
        let pairs: [number, number][]
        if (rule) {
          // Заданные вручную соединения важнее разметки: так разрешают манёвр и с «неправильной» полосы
          pairs = rule.pairs.filter(([a, b]) => a >= 0 && a < from.lanesIn && b >= 0 && b < to.lanesOut)
        } else {
          const lanes = continuation
            ? Array.from({ length: from.lanesIn }, (_, i) => i)
            : lanesForTurn(from, kind, kinds, ignoreTags)
          pairs = lanes.map((lane, index) => [lane, outLaneFor(index, lanes.length, to.lanesOut, continuation ? 'through' : kind)])
        }
        pairs.forEach(([lane, toLane]) => {
          const start = lanePoint(fromGeometry, lane, true)
          const end = lanePoint(toGeometry, toLane, false)
          found.push({
            node,
            from,
            to,
            fromLane: lane,
            toLane,
            kind,
            // Направления берутся там, где полоса обрезана, а не у центра узла: дорога может изгибаться
            points: turnCurve(start, scale(fromGeometry.dir, -1), end, toGeometry.dir),
          })
        })
      }
      return found
    }

    // turn:lanes может не совпасть с реальными выездами: тогда подход не должен оказаться тупиком
    const tagged = collect(false)
    connectors.push(...(tagged.length > 0 ? tagged : collect(true)))
  }
  return connectors
}

/**
 * Номер цвета для каждого подхода к узлу. Север, восток, юг и запад всегда одного цвета по всему городу,
 * а если два подхода попали в одну сторону, второй получает ближайший свободный цвет.
 */
export function approachSlots(arms: Arm[]): Map<Arm, number> {
  const slots = new Map<Arm, number>()
  const used = new Set<number>()
  const order = arms
    .map((arm) => {
      const angle = bearing(arm.dir)
      const quadrant = Math.round(angle / 90) % 4
      return { arm, quadrant, skew: Math.abs(((angle - quadrant * 90 + 540) % 360) - 180) }
    })
    .sort((a, b) => a.skew - b.skew)
  for (const { arm, quadrant } of order) {
    const free = [quadrant, (quadrant + 1) % 4, (quadrant + 3) % 4, (quadrant + 2) % 4, 4, 5].find((slot) => !used.has(slot)) ?? 5
    used.add(free)
    slots.set(arm, free)
  }
  return slots
}

/** Геометрия концов всех участков: сколько обрезано и как стыкуются. */
export function computeArmGeometries(network: Network): Map<Arm, ArmGeometry> {
  const geometries = new Map<Arm, ArmGeometry>()
  for (const arms of network.arms.values()) {
    for (const [arm, geometry] of armGeometry(arms)) geometries.set(arm, geometry)
  }
  return geometries
}

/** Подходы участка с обеих сторон. */
export function armsByLink(network: Network): Map<Link, { start?: Arm; end?: Arm }> {
  const result = new Map<Link, { start?: Arm; end?: Arm }>()
  for (const arms of network.arms.values()) {
    for (const arm of arms) {
      const entry = result.get(arm.link) ?? {}
      if (arm.atStart) entry.start = arm
      else entry.end = arm
      result.set(arm.link, entry)
    }
  }
  return result
}

function zebra(
  center: XY,
  dir: XY,
  width: number,
  wayId: number,
  node: number,
  output: Feature[],
  projector: Projector,
): void {
  const normal = leftNormal(dir)
  const halfDepth = ZEBRA_DEPTH_M / 2
  const step = ZEBRA_STRIPE_M + ZEBRA_GAP_M
  const count = Math.floor(width / step)
  const start = -((count - 1) * step) / 2
  for (let i = 0; i < count; i++) {
    const c = add(center, scale(normal, start + i * step))
    const halfStripe = scale(normal, ZEBRA_STRIPE_M / 2)
    const halfLength = scale(dir, halfDepth)
    output.push(
      polygonFeature(
        [
          add(add(c, halfStripe), halfLength),
          add(sub(c, halfStripe), halfLength),
          sub(sub(c, halfStripe), halfLength),
          sub(add(c, halfStripe), halfLength),
        ],
        projector,
        { wayId, node },
      ),
    )
  }
}

/** Зебра по заданной линии: начало и конец ставит пользователь, поэтому переход может идти под углом к дороге. */
function zebraBetween(a: XY, b: XY, roadDir: XY, wayId: number, output: Feature[], projector: Projector): void {
  const axis = unit(sub(b, a))
  const length = dist(a, b)
  const step = ZEBRA_STRIPE_M + ZEBRA_GAP_M
  const count = Math.floor(length / step)
  const halfStripe = scale(axis, ZEBRA_STRIPE_M / 2)
  const halfLength = scale(roadDir, ZEBRA_DEPTH_M / 2)
  for (let i = 0; i < count; i++) {
    const c = add(a, scale(axis, step * (i + 0.5)))
    output.push(polygonFeature([add(add(c, halfStripe), halfLength), add(sub(c, halfStripe), halfLength), sub(sub(c, halfStripe), halfLength), sub(add(c, halfStripe), halfLength)], projector, { wayId }))
  }
}

function buildCrossings(
  doc: OsmDoc,
  network: Network,
  crossings: Feature[],
  signals: Feature[],
  projector: Projector,
): void {
  const seenSignal = new Set<number>()
  const crossingDirs = new Map<number, XY>()
  for (const link of network.links) {
    const nodes = link.nodes
    nodes.forEach((id, index) => {
      const tags = doc.nodes.get(id)?.tags
      if (!tags?.highway) return
      if (tags.highway !== 'crossing' && tags.highway !== 'traffic_signals') return
      let along = 0
      for (let i = 1; i <= index; i++) along += dist(link.points[i - 1]!, link.points[i]!)
      const { point, dir } = pointAlong(link.points, along)
      const hasOwnLine = doc.waysOfNode(id).some((wayId) => doc.ways.get(wayId)?.tags?.footway === 'crossing')
      if (hasOwnLine) {
        crossingDirs.set(id, dir)
      } else if (tags.highway === 'crossing' || tags.crossing) {
        zebra(point, dir, totalWidth(link.profile), link.wayId, id, crossings, projector)
      }
      if (tags.highway === 'traffic_signals' && !seenSignal.has(id)) {
        seenSignal.add(id)
        signals.push(pointFeature(point, projector, { node: id }))
      }
    })
  }
  for (const way of doc.ways.values()) {
    if (way.tags?.footway !== 'crossing' || way.nds.length < 2) continue
    const road = way.nds.map((id) => crossingDirs.get(id)).find(Boolean)
    const first = projector.toXY(doc.node(way.nds[0]!))
    const last = projector.toXY(doc.node(way.nds.at(-1)!))
    if (road) zebraBetween(first, last, road, way.id, crossings, projector)
  }
  for (const node of doc.nodes.values()) {
    if (node.tags?.highway === 'traffic_signals' && !seenSignal.has(node.id)) {
      signals.push(pointFeature(projector.toXY(node), projector, { node: node.id }))
    }
  }
}

function buildTrafficSigns(doc: OsmDoc, signs: Feature[], projector: Projector): void {
  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (!tags) continue
    const icon = tags.traffic_calming
      ? 'sign-bump'
      : tags.highway === 'stop'
        ? 'sign-stop'
        : tags.highway === 'give_way'
          ? 'sign-give-way'
          : null
    if (icon) signs.push(pointFeature(projector.toXY(node), projector, { icon }))
  }
  for (const { point, speed } of reducedSections(doc, projector)) {
    if (SECTION_SPEEDS.includes(speed)) signs.push(pointFeature(point, projector, { icon: `sign-speed-${speed}` }))
  }
}

function buildLabels(network: Network, labels: Feature[], projector: Projector, doc: OsmDoc): void {
  const longest = new Map<string, Link>()
  for (const link of network.links) {
    const name = doc.ways.get(link.wayId)?.tags?.name
    if (!name) continue
    const current = longest.get(name)
    if (!current || current.length < link.length) longest.set(name, link)
  }
  for (const [name, link] of longest) {
    const { point, dir } = pointAlong(link.points, link.length / 2)
    let rot = bearing(dir) - 90
    if (rot > 90) rot -= 180
    if (rot < -90) rot += 180
    labels.push(pointFeature(point, projector, { name, rot, wayId: link.wayId }))
  }
}

function buildMinor(way: OWay, doc: OsmDoc, projector: Projector, minor: Feature[]): void {
  const tags = way.tags ?? {}
  if (!tags.highway || DRIVABLE.has(tags.highway) || tags.area === 'yes') return
  const points = way.nds
    .map((id) => doc.nodes.get(id))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .map((node) => projector.toXY(node))
  if (points.length < 2) return
  minor.push(lineFeature(points, projector, { wayId: way.id, highway: tags.highway }))
}

/** Участок над землёй: в 3D это настил из коротких плит, каждая на своей высоте. */
function elevatedSegments(
  doc: OsmDoc,
  link: Link,
  trimStart: number,
  trimEnd: number,
  halfWidth: number,
  output: Feature[],
  projector: Projector,
): void {
  const profile = linkHeights(doc, link)
  if (profile.heights.every((height) => Math.abs(height) < MIN_VISIBLE_HEIGHT_M)) return
  const start = trimStart
  const end = link.length - trimEnd
  const count = Math.max(1, Math.round((end - start) / ELEVATED_STEP_M))
  for (let i = 0; i < count; i++) {
    const a = start + ((end - start) * i) / count
    const b = start + ((end - start) * (i + 1)) / count
    const pa = pointAlong(link.points, a)
    const pb = pointAlong(link.points, b)
    const na = scale(leftNormal(pa.dir), halfWidth)
    const nb = scale(leftNormal(pb.dir), halfWidth)
    const z = heightAlong(profile, (a + b) / 2)
    if (z < MIN_VISIBLE_HEIGHT_M) continue
    output.push(
      polygonFeature(
        [add(pa.point, na), add(pb.point, nb), sub(pb.point, nb), sub(pa.point, na)],
        projector,
        { wayId: link.wayId, base: z - DECK_THICKNESS_M, top: z },
      ),
    )
  }
}

function graphRoadClass(highway: string): string {
  return highway.replace('_link', '')
}

export function buildScene(doc: OsmDoc, projector: Projector): { scene: Scene; network: Network } {
  const network = buildNetwork(doc, projector)
  const surface = EMPTY()
  const junctions = EMPTY()
  const markings = EMPTY()
  const turnPaths = EMPTY()
  const arrows = EMPTY()
  const crossings = EMPTY()
  const signals = EMPTY()
  const trafficSigns = EMPTY()
  const minor = EMPTY()
  const graphLinks = EMPTY()
  const graphNodes = EMPTY()
  const labels = EMPTY()
  const elevated = EMPTY()

  const geometries = computeArmGeometries(network)
  for (const [node, arms] of network.arms) {
    if (arms.length >= 2 && !isSeamless(arms)) {
      const ring = junctionRing(arms.map((arm) => geometries.get(arm)!))
      junctions.push(
        polygonFeature(ring, projector, {
          node,
          level: Math.max(...arms.map((arm) => levelOf(arm.link))),
        }),
      )
    }
    if (arms.length >= 3) {
      const approaches = approachSlots(arms)
      for (const connector of junctionConnectors(doc, node, arms, geometries)) {
        turnPaths.push(lineFeature(connector.points, projector, { turn: connector.kind, node, approach: approaches.get(connector.from) ?? 0, from: connector.from.neighbor, to: connector.to.neighbor, fromLane: connector.fromLane }))
      }
    } else if (arms.length === 2 && !isSeamless(arms)) {
      // Стык двух отрезков с разным сечением: без соединений полосы обрывались бы у площадки узла
      for (const connector of junctionConnectors(doc, node, arms, geometries)) {
        if (dist(connector.points[0]!, connector.points.at(-1)!) < 0.3) continue
        turnPaths.push(lineFeature(connector.points, projector, { turn: 'through', node, approach: 0, continuation: true, from: connector.from.neighbor, to: connector.to.neighbor }))
      }
    }
    const nodeTags = doc.node(node).tags
    if (nodeTags?.highway === 'traffic_signals' || nodeTags?.highway === 'stop') {
      for (const arm of arms) {
        const geometry = geometries.get(arm)
        if (geometry && arm.lanesIn > 0) markings.push(stopLine(geometry, arm, projector))
      }
    }
    if (arms.length !== 2 || !isSeamless(arms)) {
      const position = projector.toXY(doc.node(node))
      if (arms.length >= 2) {
        graphNodes.push(pointFeature(position, projector, { node, degree: arms.length }))
      }
    }
  }

  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (tags?.public_transport !== 'stop_position' && tags?.highway !== 'bus_stop') continue
    const place = nearestRoadPlace(network, projector.toXY(node))
    if (place) markings.push(stopZigzag(place.link, place.along, place.side, projector))
  }

  const linkArms = armsByLink(network)

  for (const link of network.links) {
    const { start, end } = linkArms.get(link) ?? {}
    const startGeometry = start ? geometries.get(start) : undefined
    const endGeometry = end ? geometries.get(end) : undefined
    const trimmed = trimPolyline(link.points, startGeometry?.trim ?? 0, endGeometry?.trim ?? 0)
    const startTangent = startGeometry?.mitreTangent ?? null
    const endTangent = endGeometry?.mitreTangent ?? null
    const level = levelOf(link)
    const offsets = laneOffsets(link.profile)
    const left = offsetPolyline(trimmed, offsets.left, startTangent, endTangent)
    const right = offsetPolyline(trimmed, offsets.right, startTangent, endTangent)
    const tags = doc.ways.get(link.wayId)?.tags ?? {}
    const highway = tags.highway ?? 'road'
    if (left.length < 2) continue

    surface.push(
      polygonFeature([...left, ...right.reverse()], projector, {
        wayId: link.wayId,
        level,
        highway: graphRoadClass(highway),
      }),
    )
    const noLines = highway === 'service' && !tags.lanes
    laneMarkingsFor(link, trimmed, startTangent, endTangent, level, markings, projector, noLines)
    laneArrows(link, trimmed, level, arrows, projector)
    elevatedSegments(doc, link, startGeometry?.trim ?? 0, endGeometry?.trim ?? 0, offsets.left, elevated, projector)

    // Граф сети как в Visum: отрезок — одна линия от узла до узла, полосы видны только в инженерном виде
    const forwardLanes = offsets.forward.length
    const backwardLanes = offsets.backward.length
    if (link.points.length >= 2 && forwardLanes + backwardLanes > 0) {
      const onlyBackward = forwardLanes === 0
      graphLinks.push(
        lineFeature(onlyBackward ? [...link.points].reverse() : link.points, projector, {
          wayId: link.wayId,
          highway: graphRoadClass(highway),
          oneway: forwardLanes === 0 || backwardLanes === 0,
          reversed: false,
          lanes: forwardLanes + backwardLanes,
          level,
        }),
      )
    }
  }

  buildCrossings(doc, network, crossings, signals, projector)
  buildTrafficSigns(doc, trafficSigns, projector)
  buildLabels(network, labels, projector, doc)
  for (const way of doc.ways.values()) buildMinor(way, doc, projector, minor)

  return {
    network,
    scene: {
      surface: collection(surface),
      junctions: collection(junctions),
      markings: collection(markings),
      turnPaths: collection(turnPaths),
      arrows: collection(arrows),
      crossings: collection(crossings),
      signals: collection(signals),
      trafficSigns: collection(trafficSigns),
      minor: collection(minor),
      graphLinks: collection(graphLinks),
      graphNodes: collection(graphNodes),
      labels: collection(labels),
      elevated: collection(elevated),
    },
  }
}

const LANDUSE_KEYS = ['landuse', 'leisure', 'natural', 'amenity'] as const
const POINT_OBJECT_KEYS = new Set(['amenity', 'shop', 'barrier', 'public_transport', 'tourism', 'office', 'leisure', 'man_made', 'emergency', 'railway', 'highway'])
const WATER_VALUES = new Set(['water', 'wetland', 'riverbank'])

function isClosed(way: OWay): boolean {
  return way.nds.length >= 4 && way.nds[0] === way.nds.at(-1)
}

/** Фон не редактируется, поэтому считается один раз при открытии файла. */
export function buildStaticScene(doc: OsmDoc): StaticScene {
  const buildings: Feature[] = []
  const landuse: Feature[] = []
  const rail: Feature[] = []
  const water: Feature[] = []
  const other: Feature[] = []
  const points: Feature[] = []

  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (!tags || tags.highway === 'traffic_signals' || tags.highway === 'crossing') continue
    if (!Object.keys(tags).some((key) => POINT_OBJECT_KEYS.has(key))) continue
    points.push({
      type: 'Feature',
      properties: { node: node.id },
      geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
    })
  }

  for (const way of doc.ways.values()) {
    const tags = way.tags ?? {}
    if (tags.highway) continue
    const coordinates = way.nds
      .map((id) => doc.nodes.get(id))
      .filter((node): node is NonNullable<typeof node> => !!node)
      .map((node) => [node.lon, node.lat])
    if (coordinates.length < 2) continue

    if (tags.railway && tags.railway !== 'platform' && !isClosed(way)) {
      rail.push({ type: 'Feature', properties: { wayId: way.id, railway: tags.railway }, geometry: { type: 'LineString', coordinates } })
      continue
    }
    if (tags.waterway) {
      water.push({ type: 'Feature', properties: { wayId: way.id }, geometry: { type: 'LineString', coordinates } })
      continue
    }
    if (!isClosed(way) || coordinates.length !== way.nds.length) {
      other.push({ type: 'Feature', properties: { wayId: way.id }, geometry: { type: 'LineString', coordinates } })
      continue
    }

    if (tags.building && tags.building !== 'no') {
      const levels = Number.parseFloat(tags['building:levels'] ?? '')
      const height = Number.parseFloat(tags.height ?? '')
      buildings.push({
        type: 'Feature',
        properties: {
          wayId: way.id,
          height: Number.isFinite(height) ? height : (Number.isFinite(levels) ? levels : 4) * 3.2,
        },
        geometry: { type: 'Polygon', coordinates: [coordinates] },
      })
      continue
    }
    if (tags.natural && WATER_VALUES.has(tags.natural)) {
      water.push({ type: 'Feature', properties: { wayId: way.id }, geometry: { type: 'Polygon', coordinates: [coordinates] } })
      continue
    }
    if (LANDUSE_KEYS.some((key) => tags[key])) {
      const green =
        ['grass', 'forest', 'meadow', 'park', 'garden', 'wood', 'pitch', 'stadium'].includes(
          tags.landuse ?? tags.natural ?? tags.leisure ?? '',
        )
      landuse.push({
        type: 'Feature',
        properties: { green, wayId: way.id },
        geometry: { type: 'Polygon', coordinates: [coordinates] },
      })
    } else {
      other.push({ type: 'Feature', properties: { wayId: way.id }, geometry: { type: 'LineString', coordinates } })
    }
  }
  return {
    buildings: collection(buildings),
    landuse: collection(landuse),
    rail: collection(rail),
    water: collection(water),
    other: collection(other),
    points: collection(points),
  }
}

export function profileSummary(profile: LaneProfile): string {
  return profile.oneway
    ? `${profile.forward + profile.backward} пол. в одну сторону`
    : `${profile.forward} + ${profile.backward} пол.`
}
