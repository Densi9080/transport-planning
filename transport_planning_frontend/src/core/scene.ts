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
  segmentsCross,
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
  restrictionVias,
  connectivityAt,
  type TurnKind,
  turnKind,
} from './topology'
import { armHasNode, readMainRoad } from './priority'
import { parseAreaKey, STOP_AREA_TAG } from './stops'
import { reducedSections, SECTION_SPEEDS } from './traffic'
import { placeSigns } from './trafficSigns'
import type { OWay, Tags, XY } from './types'

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
const MAX_STUB_TRIM_SHARE = 0.9
const COLLINEAR_COS = -0.92
const LANE_ARROW_INTERVAL_M = 70
const LANE_ARROW_FROM_END_M = 7
const ZEBRA_STRIPE_M = 0.55
/** Платформа и её пункт на дороге — одна остановка: разметка рисуется один раз. */
const STOP_ZIGZAG_DEDUPE_M = 40
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
function armGeometry(arms: Arm[], farDegree: (arm: Arm) => number = () => 3): Map<Arm, ArmGeometry> {
  const result = new Map<Arm, ArmGeometry>()
  const sorted = [...arms].sort(
    (a, b) => Math.atan2(a.dir.y, a.dir.x) - Math.atan2(b.dir.y, b.dir.x),
  )
  const seamless = isSeamless(sorted)

  sorted.forEach((arm, index) => {
    const width = totalWidth(arm.link.profile)
    let trim = 0
    let split = 0
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
        // Дороги расходятся «вилкой»: площадка узла тянется, пока ось одной не выйдет за край другой с её стороны
        if (cos > SPLIT_COS) {
          const armOnLeft = cross(other.dir, arm.dir) > 0
          const required = sideHalf(other, armOnLeft ? 'left' : 'right') + SPLIT_GAP_M
          split = Math.max(split, separationAlong(arm, other, required))
        }
      }
      // Короткий отрезок без перекрёстка на другом конце (продолжение той же дороги) площадка может занять почти
      // целиком: иначе его начало остаётся внутри полотна широкой дороги и траектории подхода пересекаются
      trim = Math.min(trim, arm.link.length * (farDegree(arm) <= 2 ? MAX_STUB_TRIM_SHARE : MAX_TRIM_SHARE))
      if (split > 0) trim = Math.max(trim, Math.min(split, arm.link.length * MAX_SPLIT_TRIM_SHARE))
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

/** Подходы ближе этого угла (около 25°) считаются расходящимися «вилкой». */
const SPLIT_COS = 0.9
const SPLIT_GAP_M = 0.3
/** Расходящийся съезд может быть коротким: площадка узла занимает до трёх четвертей его длины. */
const MAX_SPLIT_TRIM_SHARE = 0.75

/** Половина ширины подхода с одной стороны оси, если смотреть от узла наружу. */
function sideHalf(arm: Arm, side: 'left' | 'right'): number {
  const offsets = laneOffsets(arm.link.profile)
  const left = arm.atStart ? offsets.left : -offsets.right
  const right = arm.atStart ? -offsets.right : offsets.left
  return side === 'left' ? left : right
}
const SPLIT_STEP_M = 1
const SPLIT_REACH_M = 120

/**
 * На каком расстоянии от узла ось подхода отходит от оси соседнего подхода на заданное расстояние.
 * Нужна для съездов, которые в OSM начинаются в одной точке с основной дорогой и идут рядом с ней:
 * без этого начало съезда оказывается внутри полотна основной дороги, и траектории манёвров пересекаются.
 */
function separationAlong(arm: Arm, other: Arm, required: number): number {
  const own = arm.atStart ? arm.link.points : [...arm.link.points].reverse()
  const theirs = other.atStart ? other.link.points : [...other.link.points].reverse()
  const reach = Math.min(SPLIT_REACH_M, arm.link.length)
  for (let along = SPLIT_STEP_M; along <= reach; along += SPLIT_STEP_M) {
    const point = pointAlong(own, along).point
    let nearest = Number.POSITIVE_INFINITY
    for (let i = 1; i < theirs.length; i++) nearest = Math.min(nearest, nearestOnSegment(point, theirs[i - 1]!, theirs[i]!).distance)
    if (nearest >= required) return along + CORNER_MARGIN_M
  }
  return reach
}

/** Две дороги одной ширины, идущие почти по прямой, стыкуются без отдельной площадки. */
function isSeamless(arms: Arm[]): boolean {
  if (arms.length !== 2) return false
  const [a, b] = arms as [Arm, Arm]
  if (dot(a.dir, b.dir) > COLLINEAR_COS * 0.75) return false
  // Одинаковой ширины мало: при другой раскладке полос по направлениям (например, 2+2 и 4 в одну сторону)
  // полосы сдвигались бы вбок в одной точке и ложились друг на друга
  if (a.lanesIn !== b.lanesOut || b.lanesIn !== a.lanesOut) return false
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

/**
 * С каких полос подхода выполняется манёвр. Порядок полос — слева направо, как в turn:lanes.
 *
 * Разметка 1.18 (стрелки) и знаки 5.15.1 задают полосы явно. Без них действуют ПДД:
 * п. 8.5 — направо с крайней правой, налево и в разворот с крайней левой; прямо — со всех полос.
 * Полоса без стрелки (пустое значение или none) разметки не имеет, поэтому для неё тоже действуют ПДД:
 * крайняя правая без стрелки разрешает поворот направо, если ни одна стрелка направо не указывает.
 */
function lanesForTurn(arm: Arm, kind: TurnKind, kinds: Set<TurnKind>, ignoreTags = false): number[] {
  const profile = arm.link.profile
  const turns = arm.atStart ? profile.turnsBackward : profile.turnsForward
  const count = arm.lanesIn
  const all = Array.from({ length: count }, (_, i) => i)
  const unmarked = (i: number) => !turns?.[i] || turns[i] === 'none'

  if (!ignoreTags && turns && turns.length === count && turns.some((turn) => turn && turn !== 'none')) {
    const tagged = all.filter((i) => turnAllows(turns[i] ?? '', kind))
    if (tagged.length > 0) return tagged
    if (kind === 'through') return all.filter(unmarked)
    if (kind === 'right') return unmarked(count - 1) ? [count - 1] : []
    if (kind === 'left') return unmarked(0) ? [0] : []
    return []
  }
  if (count === 1) return [0]
  if (kind === 'left') return [0]
  if (kind === 'right') return [count - 1]
  if (kind === 'through') return all
  return kinds.has('left') ? [] : [0]
}

/** Стрелки полос по ходу движения на этом подходе: у въезда — к узлу, у выезда — от узла. */
function armTurns(arm: Arm, entering: boolean): string[] | null {
  const profile = arm.link.profile
  // Въезд в узел идёт по дороге к узлу, выезд — от узла
  const forward = entering ? !arm.atStart : arm.atStart
  const turns = forward ? profile.turnsForward : profile.turnsBackward
  const count = entering ? arm.lanesIn : arm.lanesOut
  return turns && turns.length === count ? turns : null
}

/** Полоса только для поворота в эту сторону: «right», «slight_right;right» и т. п. без «through». */
function pureTurn(value: string | undefined, side: 'left' | 'right'): boolean {
  if (!value || value === 'none') return false
  const parts = value.split(';')
  return parts.every((part) => part.includes(side) || (side === 'left' && part === 'reverse'))
}

/**
 * Соединение полос на стыке двух отрезков, где число полос может меняться.
 * Полосы соединяются по порядку и не пересекаются.
 * Расширение: новые полосы появляются с той стороны, куда ведут по разметке дальше (стрелка направо — справа,
 * налево — слева), без разметки — справа. Крайняя полоса на этой стороне разделяется: продолжается прямо и даёт
 * начало новым полосам. Сужение: исчезают крайние правые полосы, они вливаются в соседнюю слева.
 * Индексы полос — слева направо по ходу движения, как в turn:lanes.
 */
export function continuationPairs(from: Arm, to: Arm): [number, number][] {
  const n = from.lanesIn
  const m = to.lanesOut
  const pairs: [number, number][] = []
  if (n === 0 || m === 0) return pairs
  if (m >= n) {
    const extra = m - n
    const turns = armTurns(to, false)
    let leftPure = 0
    while (turns && leftPure < m && pureTurn(turns[leftPure], 'left')) leftPure++
    let rightPure = 0
    while (turns && rightPure < m && pureTurn(turns[m - 1 - rightPure], 'right')) rightPure++
    // Новые полосы слева — только если слева есть полосы для поворота налево и их не больше, чем добавилось
    const addLeft = Math.min(extra, rightPure >= extra ? 0 : leftPure)
    const addRight = extra - addLeft
    for (let i = 0; i < n; i++) pairs.push([i, i + addLeft])
    for (let k = 0; k < addLeft; k++) pairs.push([0, k])
    for (let k = 0; k < addRight; k++) pairs.push([n - 1, n + addLeft + k])
  } else {
    for (let i = 0; i < n; i++) pairs.push([i, Math.min(i, m - 1)])
  }
  return pairs
}

/**
 * Полоса выезда для index-й из usedCount полос манёвра, по ПДД 8.6: направо — в крайнюю правую
 * и соседние с ней, налево и в разворот — в крайнюю левую и соседние, то есть всегда в ближнюю.
 */
export function outLaneFor(index: number, usedCount: number, outCount: number, kind: TurnKind): number {
  if (outCount <= 1) return 0
  if (kind === 'right') return outCount - 1 - Math.min(usedCount - 1 - index, outCount - 1)
  if (kind === 'left' || kind === 'reverse') return Math.min(index, outCount - 1)
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

/**
 * Форма манёвра, заданная вручную: смещение середины траектории в метрах (восток, север).
 * Хранится на узле тегом tp:turn_shape: «откуда>куда:dx,dy;…», где откуда и куда — узлы на подходах.
 * Узел ищется на всём отрезке подхода, поэтому вставка узла или разрез дороги форму не теряют.
 */
export const TURN_SHAPE_TAG = 'tp:turn_shape'

export interface TurnShape {
  from: number
  to: number
  dx: number
  dy: number
}

export function readTurnShapes(tags: Tags | undefined): TurnShape[] {
  const shapes: TurnShape[] = []
  for (const part of (tags?.[TURN_SHAPE_TAG] ?? '').split(';')) {
    const match = /^\s*(-?\d+)>(-?\d+):(-?[\d.]+),(-?[\d.]+)\s*$/.exec(part)
    if (match) shapes.push({ from: Number(match[1]), to: Number(match[2]), dx: Number(match[3]), dy: Number(match[4]) })
  }
  return shapes
}

export function writeTurnShape(tags: Tags | undefined, from: number, to: number, delta: XY | null): Tags {
  const next = { ...(tags ?? {}) }
  const shapes = readTurnShapes(tags).filter((item) => !(item.from === from && item.to === to))
  if (delta && Math.hypot(delta.x, delta.y) >= 0.05) shapes.push({ from, to, dx: Math.round(delta.x * 10) / 10, dy: Math.round(delta.y * 10) / 10 })
  if (shapes.length === 0) delete next[TURN_SHAPE_TAG]
  else next[TURN_SHAPE_TAG] = shapes.map((item) => `${item.from}>${item.to}:${item.dx},${item.dy}`).join(';')
  return next
}

/**
 * Кривая манёвра с середины, сдвинутой на delta. Концы остаются на полосах.
 * Середина квадратичной кривой M = (A + 2C + B) / 4, отсюда опорная точка C = 2M − (A + B) / 2.
 */
export function shapedCurve(points: XY[], delta: XY | null): XY[] {
  if (!delta || points.length < 3) return points
  const start = points[0]!
  const end = points.at(-1)!
  const middle = points[Math.floor((points.length - 1) / 2)]!
  const target = add(middle, delta)
  const control = sub(scale(target, 2), scale(add(start, end), 0.5))
  return quadraticCurve(start, control, end, Math.max(CURVE_STEPS, points.length - 1))
}

/** Середина траектории: за неё тянут, чтобы изменить форму манёвра. */
export function curveMiddle(points: XY[]): XY {
  return points[Math.floor((points.length - 1) / 2)]!
}

/**
 * Пары траекторий с одного подхода, которые пересекаются внутри узла, кроме общих начала и конца.
 * С одного подхода машины едут параллельно, и такое пересечение заставляет их уступать друг другу зря.
 */
export function crossingConnectors(connectors: Connector[]): [Connector, Connector][] {
  const result: [Connector, Connector][] = []
  for (let i = 0; i < connectors.length; i++) {
    for (let j = i + 1; j < connectors.length; j++) {
      const a = connectors[i]!
      const b = connectors[j]!
      if (a.from !== b.from || a.fromLane === b.fromLane || (a.to === b.to && a.toLane === b.toLane)) continue
      let crossed = false
      for (let p = 1; p < a.points.length && !crossed; p++) {
        for (let q = 1; q < b.points.length && !crossed; q++) {
          if (segmentsCross(a.points[p - 1]!, a.points[p]!, b.points[q - 1]!, b.points[q]!)) crossed = true
        }
      }
      if (crossed) result.push([a, b])
    }
  }
  return result
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
  /** Полоса переставлена вопреки стрелкам разметки, чтобы траектории подхода не пересекались. */
  againstMarkings?: boolean
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
  const shapes = readTurnShapes(doc.nodes.get(node)?.tags)
  const shapeOf = (from: Arm, to: Arm): XY | null => {
    const shape = shapes.find((item) => armHasNode(from, item.from) && armHasNode(to, item.to))
    return shape ? { x: shape.dx, y: shape.dy } : null
  }
  // Стык двух дорог — это продолжение одной дороги, а не поворот
  const continuation = arms.length === 2
  const manual = new Set<Connector>()
  // Направления берутся там, где полоса обрезана, а не у центра узла: дорога может изгибаться
  const buildPoints = (c: Connector): XY[] => {
    const fromGeometry = geometries.get(c.from)!
    const toGeometry = geometries.get(c.to)!
    const start = lanePoint(fromGeometry, c.fromLane, true)
    const end = lanePoint(toGeometry, c.toLane, false)
    return shapedCurve(turnCurve(start, scale(fromGeometry.dir, -1), end, toGeometry.dir), shapeOf(c.from, c.to))
  }

  for (const from of arms) {
    if (from.lanesIn === 0) continue
    const fromGeometry = geometries.get(from)!
    const kinds = new Set<TurnKind>()
    for (const to of arms) {
      if (to.lanesOut > 0 && to.neighbor !== from.neighbor) kinds.add(turnKind(from, to, arms))
    }

    const collect = (ignoreTags: boolean): Connector[] => {
      const found: Connector[] = []
      for (const to of arms) {
        if (to.lanesOut === 0 || to.neighbor === from.neighbor) continue
        const kind = turnKind(from, to, arms)
        if (!continuation && kind === 'reverse') continue
        if (!isMovementAllowed(from, to, restrictions)) continue
        const toGeometry = geometries.get(to)!
        const rule = explicit.find((item) => item.from === from.link.wayId && item.to === to.link.wayId)
        let pairs: [number, number][]
        if (rule) {
          // Заданные вручную соединения важнее разметки: так разрешают манёвр и с «неправильной» полосы
          pairs = rule.pairs.filter(([a, b]) => a >= 0 && a < from.lanesIn && b >= 0 && b < to.lanesOut)
        } else {
          if (continuation) {
            pairs = continuationPairs(from, to)
          } else {
            const lanes = lanesForTurn(from, kind, kinds, ignoreTags)
            pairs = lanes.map((lane, index) => [lane, outLaneFor(index, lanes.length, to.lanesOut, kind)])
          }
        }
        pairs.forEach(([lane, toLane]) => {
          const connector: Connector = { node, from, to, fromLane: lane, toLane, kind, points: [] }
          connector.points = buildPoints(connector)
          if (rule) manual.add(connector)
          found.push(connector)
        })
      }
      return found
    }

    // turn:lanes может не совпасть с реальными выездами: тогда подход не должен оказаться тупиком
    const tagged = collect(false)
    connectors.push(...(tagged.length > 0 ? tagged : collect(true)))
  }

  untangle(connectors, arms, geometries, manual, buildPoints)
  return connectors
}

/**
 * Распутывание траекторий узла по их физическому положению.
 *
 * В выезд траектории входят в том порядке, в каком подходят к нему: та, что подходит левее, занимает левую
 * полосу. Так при слиянии двух дорог левая не уходит в правые полосы, а правая — в левые.
 * С подхода траектории расходятся в том порядке, куда ведут: та, что уходит левее, начинается с левой полосы.
 * Число траекторий на каждую полосу сохраняется. Ручные соединения из редактора узла не трогаются,
 * а полосы подходов со стрелками разметки не переставляются: разметка важнее геометрии.
 */
function untangle(
  connectors: Connector[],
  arms: Arm[],
  geometries: Map<Arm, ArmGeometry>,
  manual: Set<Connector>,
  build: (connector: Connector) => XY[],
): void {
  const reorder = (group: Connector[], position: (c: Connector) => number, read: (c: Connector) => number, write: (c: Connector, lane: number) => void) => {
    if (group.length < 2) return
    const lanes = group.map(read).sort((a, b) => a - b)
    const sorted = [...group].sort((a, b) => position(b) - position(a) || read(a) - read(b))
    let changed = false
    sorted.forEach((connector, index) => {
      if (read(connector) !== lanes[index]) changed = true
      write(connector, lanes[index]!)
    })
    if (changed) for (const connector of group) connector.points = build(connector)
  }

  const reorderExits = () => {
    for (const to of arms) {
      const geometry = geometries.get(to)
      if (!geometry) continue
      const group = connectors.filter((c) => c.to === to && !manual.has(c))
      if (group.length < 2) continue
      // Подходы упорядочиваются целиком по среднему положению начал поперёк выезда (больше — левее),
      // а внутри подхода сохраняется порядок его полос: иначе траектории одного подхода перекрестятся
      const lateral = (c: Connector) => cross(geometry.dir, sub(c.points[0]!, geometry.center))
      const approachPosition = new Map<Arm, number>()
      for (const from of new Set(group.map((c) => c.from))) {
        const own = group.filter((c) => c.from === from)
        approachPosition.set(from, own.reduce((sum, c) => sum + lateral(c), 0) / own.length)
      }
      const lanes = group.map((c) => c.toLane).sort((a, b) => a - b)
      const sorted = [...group].sort(
        (a, b) => approachPosition.get(b.from)! - approachPosition.get(a.from)! || a.fromLane - b.fromLane || a.toLane - b.toLane,
      )
      let changed = false
      sorted.forEach((connector, index) => {
        if (connector.toLane !== lanes[index]) changed = true
        connector.toLane = lanes[index]!
      })
      if (changed) for (const connector of group) connector.points = build(connector)
    }
  }
  const reorderApproach = (from: Arm) => {
    const geometry = geometries.get(from)
    if (!geometry) return
    const travelIn = scale(geometry.dir, -1)
    // Положение конца траектории поперёк подхода: больше — левее по ходу движения на подходе
    reorder(
      connectors.filter((c) => c.from === from && !manual.has(c)),
      (c) => cross(travelIn, sub(c.points.at(-1)!, geometry.center)),
      (c) => c.fromLane,
      (c, lane) => (c.fromLane = lane),
    )
  }

  reorderExits()
  for (const from of arms) {
    const turns = armTurns(from, true)
    if (turns && turns.some((turn) => turn && turn !== 'none')) continue
    reorderApproach(from)
  }

  // Строгое правило: траектории одного подхода не пересекаются никогда. Если стрелки разметки противоречат
  // геометрии узла, полосы подхода переставляются по геометрии, а узел помечается для проверки данных
  for (const from of arms) {
    const own = connectors.filter((c) => c.from === from && !manual.has(c))
    if (crossingConnectors(own).length === 0) continue
    const before = new Map(own.map((c) => [c, c.fromLane]))
    reorderApproach(from)
    for (const c of own) if (before.get(c) !== c.fromLane) c.againstMarkings = true
    // Порядок полос верный, а кривые всё равно пересекаются: перестраиваем пару мягче, затем прямее
    for (const flatten of [GENTLE_REACH, 0]) {
      const pairs = crossingConnectors(own)
      if (pairs.length === 0) break
      for (const connector of new Set(pairs.flat())) connector.points = calmCurve(connector.points, flatten)
    }
  }
}

const GENTLE_REACH = 0.2

/**
 * Спокойная кривая между теми же концами: кубическая с короткими касательными (reach — доля длины),
 * при reach = 0 — прямая. Нужна, когда обычная кривая манёвра пересекает соседнюю траекторию того же подхода.
 */
function calmCurve(points: XY[], reach: number): XY[] {
  const start = points[0]!
  const end = points.at(-1)!
  const span = dist(start, end)
  const steps = Math.max(CURVE_STEPS, points.length - 1)
  if (reach <= 0 || points.length < 3) {
    return Array.from({ length: steps + 1 }, (_, i) => add(start, scale(sub(end, start), i / steps)))
  }
  const startDir = unit(sub(points[1]!, start))
  const endDir = unit(sub(end, points.at(-2)!))
  const c1 = add(start, scale(startDir, span * reach))
  const c2 = sub(end, scale(endDir, span * reach))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const u = 1 - t
    return {
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    }
  })
}

/**
 * Манёвры, закрытые запретом поворота (type=restriction). Соединений полос у них нет, поэтому
 * без отдельной отрисовки запрет на карте не виден: манёвр просто пропадал. Траектория идёт
 * от середины полос подхода к середине полос выезда; разворот не рисуем — для него есть знак.
 */
export function forbiddenTurns(
  doc: OsmDoc,
  node: number,
  arms: Arm[],
  geometries: Map<Arm, ArmGeometry>,
): { from: number; to: number; kind: TurnKind; points: XY[] }[] {
  const restrictions = restrictionsAt(doc, node)
  if (!restrictions.length) return []
  const result: { from: number; to: number; kind: TurnKind; points: XY[] }[] = []
  for (const from of arms) {
    if (from.lanesIn === 0 || !restrictions.some((r) => r.from === from.link.wayId)) continue
    for (const to of arms) {
      if (to.lanesOut === 0 || to.neighbor === from.neighbor) continue
      if (isMovementAllowed(from, to, restrictions)) continue
      const kind = turnKind(from, to, arms)
      if (kind === 'reverse') continue
      const fromGeometry = geometries.get(from)
      const toGeometry = geometries.get(to)
      if (!fromGeometry || !toGeometry) continue
      const start = lanePoint(fromGeometry, Math.floor((from.lanesIn - 1) / 2), true)
      const end = lanePoint(toGeometry, Math.floor((to.lanesOut - 1) / 2), false)
      result.push({ from: from.neighbor, to: to.neighbor, kind, points: turnCurve(start, scale(fromGeometry.dir, -1), end, toGeometry.dir) })
    }
  }
  return result
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
  const farDegree = (arm: Arm) => network.arms.get(arm.atStart ? arm.link.nodes.at(-1)! : arm.link.nodes[0]!)?.length ?? 1
  for (const arms of network.arms.values()) {
    for (const [arm, geometry] of armGeometry(arms, farDegree)) geometries.set(arm, geometry)
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

/** Где проходит дорога в точке перехода: середина проезжей части, её направление и ширина. */
interface RoadAt {
  point: XY
  dir: XY
  width: number
  wayId: number
}

/** Переход почти вдоль дороги — ошибка рисования; рисуем его не острее этого угла, чтобы зебра не растягивалась на десятки метров. */
const MIN_CROSSING_SIN = Math.sin((25 * Math.PI) / 180)
const BAND_MARGIN_M = 0.4

/**
 * Разметка 1.14.1 на проезжей части. Полосы зебры идут вдоль дороги, как на асфальте, их шаг
 * меряется поперёк дороги, а сама полоса перехода может идти под углом (axis): тогда каждая
 * полоса — параллелограмм, а вся зебра ровно от кромки до кромки, без выхода на тротуар.
 * Под полосами — подложка band: на мелком масштабе полос не видно, а переход должен читаться.
 */
function crossingMarking(
  road: RoadAt,
  axisIn: XY,
  marked: boolean,
  wayId: number,
  node: number,
  output: Feature[],
  projector: Projector,
): void {
  const normal = leftNormal(road.dir)
  let axis = unit(axisIn)
  if (dot(axis, normal) < 0) axis = scale(axis, -1)
  let sin = dot(axis, normal)
  if (sin < MIN_CROSSING_SIN) {
    // Сохраняем сторону наклона, но не даём переходу лечь вдоль дороги
    const along = dot(axis, road.dir) >= 0 ? 1 : -1
    const cos = Math.sqrt(1 - MIN_CROSSING_SIN ** 2)
    axis = add(scale(normal, MIN_CROSSING_SIN), scale(road.dir, along * cos))
    sin = MIN_CROSSING_SIN
  }
  const at = (across: number, alongRoad: number): XY => add(add(road.point, scale(axis, across / sin)), scale(road.dir, alongRoad))
  const half = road.width / 2
  const bandDepth = ZEBRA_DEPTH_M / 2 + BAND_MARGIN_M
  output.push(
    polygonFeature([at(-half, -bandDepth), at(half, -bandDepth), at(half, bandDepth), at(-half, bandDepth)], projector, {
      wayId,
      node,
      kind: 'band',
    }),
  )
  // Ось перехода на мелком масштабе, где и подложки ещё не разглядеть
  output.push(lineFeature([at(-half, 0), at(half, 0)], projector, { wayId, node, kind: 'axis' }))
  if (!marked) return
  const step = ZEBRA_STRIPE_M + ZEBRA_GAP_M
  const count = Math.floor((road.width - ZEBRA_GAP_M) / step)
  const start = -((count - 1) * step) / 2
  const halfStripe = ZEBRA_STRIPE_M / 2
  const halfDepth = ZEBRA_DEPTH_M / 2
  for (let i = 0; i < count; i++) {
    const c = start + i * step
    output.push(
      polygonFeature(
        [at(c - halfStripe, -halfDepth), at(c + halfStripe, -halfDepth), at(c + halfStripe, halfDepth), at(c - halfStripe, halfDepth)],
        projector,
        { wayId, node, kind: 'stripe' },
      ),
    )
  }
}

/** Нерегулируемый переход без зебры: только подложка и ось. */
function isMarked(tags: Record<string, string> | undefined): boolean {
  const value = tags?.crossing
  return value !== 'unmarked' && value !== 'no' && tags?.['crossing:markings'] !== 'no'
}

function buildCrossings(
  doc: OsmDoc,
  network: Network,
  crossings: Feature[],
  signals: Feature[],
  projector: Projector,
): void {
  const seenSignal = new Set<number>()
  const crossingWays = [...doc.ways.values()].filter((way) => way.tags?.footway === 'crossing' && way.nds.length >= 2)
  const onCrossingWay = new Set(crossingWays.flatMap((way) => way.nds))
  /** Узел дороги → её положение там. В узле развязки дорог несколько, выбор потом по углу. */
  const roadsAt = new Map<number, RoadAt[]>()
  for (const link of network.links) {
    let along = 0
    link.nodes.forEach((id, index) => {
      if (index > 0) along += dist(link.points[index - 1]!, link.points[index]!)
      const tags = doc.nodes.get(id)?.tags
      const tagged = tags?.highway === 'crossing' || tags?.highway === 'traffic_signals' || !!tags?.crossing
      if (!tagged && !onCrossingWay.has(id)) return
      const { point, dir } = pointAlong(link.points, along)
      const road: RoadAt = { point, dir, width: totalWidth(link.profile), wayId: link.wayId }
      roadsAt.set(id, [...(roadsAt.get(id) ?? []), road])
      if (tags?.highway === 'traffic_signals' && !seenSignal.has(id)) {
        seenSignal.add(id)
        signals.push(pointFeature(point, projector, { node: id }))
      }
    })
  }
  const drawn = new Set<number>()
  // Переход своей линией: зебра на каждой проезжей части, которую линия пересекает, по её углу
  for (const way of crossingWays) {
    way.nds.forEach((id, index) => {
      const roads = roadsAt.get(id)
      if (!roads || drawn.has(id)) return
      const prev = projector.toXY(doc.node(way.nds[Math.max(0, index - 1)]!))
      const next = projector.toXY(doc.node(way.nds[Math.min(way.nds.length - 1, index + 1)]!))
      const axis = sub(next, prev)
      if (Math.hypot(axis.x, axis.y) < 0.01) return
      const direction = unit(axis)
      const road = roads.reduce((best, item) =>
        Math.abs(cross(item.dir, direction)) > Math.abs(cross(best.dir, direction)) ? item : best,
      )
      drawn.add(id)
      crossingMarking(road, direction, isMarked({ ...way.tags, ...doc.nodes.get(id)?.tags }), way.id, id, crossings, projector)
    })
  }
  // Переход только точкой на дороге: поперёк неё
  for (const [id, roads] of roadsAt) {
    if (drawn.has(id)) continue
    const tags = doc.nodes.get(id)?.tags
    if (tags?.highway !== 'crossing' && !tags?.crossing) continue
    const road = roads[0]!
    drawn.add(id)
    crossingMarking(road, leftNormal(road.dir), isMarked(tags), road.wayId, id, crossings, projector)
  }
  for (const node of doc.nodes.values()) {
    if (node.tags?.highway === 'traffic_signals' && !seenSignal.has(node.id)) {
      signals.push(pointFeature(projector.toXY(node), projector, { node: node.id }))
    }
  }
}

const MAIN_SIGN_M = 14

function buildTrafficSigns(doc: OsmDoc, signs: Feature[], projector: Projector, network: Network): void {
  // Знаки из тегов traffic_sign и выведенные из запретов поворота: картинку по номеру рисует карта
  for (const sign of placeSigns(doc, network, projector)) {
    const icon = `sign:${sign.code}${sign.value ? `[${sign.value}]` : ''}`
    signs.push(pointFeature(sign.point, projector, { icon, code: sign.code, title: sign.title, derived: sign.derived, node: sign.node }))
  }
  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (!tags) continue
    // Знак 2.1 «Главная дорога» на главных подходах; если главная поворачивает — с табличкой 8.13
    const main = readMainRoad(tags)
    if (main) {
      const arms = network.arms.get(node.id) ?? []
      const mainArms = arms.filter((arm) => main.some((id) => armHasNode(arm, id)))
      const bent = mainArms.length === 2 && turnKind(mainArms[0]!, mainArms[1]!, arms) !== 'through'
      for (const arm of mainArms) {
        if (arm.lanesIn === 0) continue
        const points = arm.atStart ? arm.link.points : [...arm.link.points].reverse()
        const { point } = pointAlong(points, Math.min(MAIN_SIGN_M, arm.link.length / 2))
        signs.push(pointFeature(point, projector, { icon: bent ? 'sign-main-bent' : 'sign-main' }))
      }
    }
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

const BRIDGE_WING_M = 3

/**
 * Условный знак моста: у каждого конца края настила отгибаются наружу. Так мост читается
 * мостом и сверху, даже когда под ним идёт дорога или тоннель того же цвета.
 */
function bridgeWings(axis: XY[], left: XY[], right: XY[], atStart: boolean, wayId: number, output: Feature[], projector: Projector): void {
  const end = atStart ? axis[0]! : axis.at(-1)!
  const inner = atStart ? axis[1]! : axis.at(-2)!
  const away = unit(sub(end, inner))
  for (const edge of [left, right]) {
    const corner = atStart ? edge[0]! : edge.at(-1)!
    const lateral = sub(corner, end)
    if (Math.hypot(lateral.x, lateral.y) < 0.01) continue
    const out = unit(add(scale(away, 0.75), scale(unit(lateral), 0.65)))
    output.push(lineFeature([corner, add(corner, scale(out, BRIDGE_WING_M))], projector, { wayId, level: 1, kind: 'wing' }))
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
  // Запреты поворота есть у немногих узлов: остальные не проверяем, чтобы сцена строилась быстро
  const restrictedVias = restrictionVias(doc)
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
      const nodeLevel = Math.max(...arms.map((arm) => levelOf(arm.link)))
      for (const connector of junctionConnectors(doc, node, arms, geometries)) {
        turnPaths.push(lineFeature(connector.points, projector, { turn: connector.kind, node, approach: approaches.get(connector.from) ?? 0, from: connector.from.neighbor, to: connector.to.neighbor, fromLane: connector.fromLane, level: nodeLevel }))
      }
      for (const forbidden of restrictedVias.has(node) ? forbiddenTurns(doc, node, arms, geometries) : []) {
        turnPaths.push(lineFeature(forbidden.points, projector, { turn: forbidden.kind, node, forbidden: true, from: forbidden.from, to: forbidden.to, level: nodeLevel }))
      }
    } else if (arms.length === 2 && !isSeamless(arms)) {
      // Стык двух отрезков с разным сечением: без соединений полосы обрывались бы у площадки узла
      const joinLevel = Math.max(...arms.map((arm) => levelOf(arm.link)))
      for (const connector of junctionConnectors(doc, node, arms, geometries)) {
        if (dist(connector.points[0]!, connector.points.at(-1)!) < 0.3) continue
        turnPaths.push(lineFeature(connector.points, projector, { turn: 'through', node, approach: 0, continuation: true, from: connector.from.neighbor, to: connector.to.neighbor, level: joinLevel }))
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

  // Разметка 1.17 у остановки: по пункту на дороге, а у платформы без пункта — по ней самой
  const stopPositions = [...doc.nodes.values()].filter((node) => node.tags?.public_transport === 'stop_position').map((node) => projector.toXY(node))
  for (const node of doc.nodes.values()) {
    const tags = node.tags
    if (tags?.public_transport !== 'stop_position' && tags?.highway !== 'bus_stop') continue
    const at = projector.toXY(node)
    if (tags.public_transport !== 'stop_position' && stopPositions.some((point) => dist(point, at) < STOP_ZIGZAG_DEDUPE_M)) continue
    // Пункт лежит на оси дороги, и сторону по нему не понять: её подсказывает его платформа
    const area = parseAreaKey(tags[STOP_AREA_TAG])
    const platform = area?.kind === 'node' ? doc.nodes.get(area.id) : undefined
    const place = nearestRoadPlace(network, platform ? projector.toXY(platform) : at)
    if (place) markings.push(stopZigzag(place.link, place.along, place.side, projector))
  }

  const linkArms = armsByLink(network)
  /** Сколько поднятых отрезков сходится в узле: там, где поднят только один, кончается мост. */
  const elevatedAtNode = new Map<number, number>()
  for (const link of network.links) {
    if (levelOf(link) <= 0) continue
    for (const node of [link.nodes[0]!, link.nodes.at(-1)!]) elevatedAtNode.set(node, (elevatedAtNode.get(node) ?? 0) + 1)
  }

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
    if (level > 0) {
      if ((elevatedAtNode.get(link.nodes[0]!) ?? 0) <= 1) bridgeWings(trimmed, left, right, true, link.wayId, markings, projector)
      if ((elevatedAtNode.get(link.nodes.at(-1)!) ?? 0) <= 1) bridgeWings(trimmed, left, right, false, link.wayId, markings, projector)
    }

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
  buildTrafficSigns(doc, trafficSigns, projector, network)
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
    // Контуры транспортных районов рисует свой слой
    if (tags.highway || tags['tp:type'] === 'zone') continue
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
