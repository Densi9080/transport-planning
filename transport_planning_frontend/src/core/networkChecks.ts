import type { OsmDoc } from './doc'
import { add, dist, nearestOnSegment, polylineLength, type Projector, scale, sub, unit } from './geo'
import { isDrivable, parseProfile } from './lanes'
import { type Arm, isMovementAllowed, type Link, type Network, restrictionsAt, turnAngle } from './topology'
import { isTransitRelation, lineSegments, ROAD_MODES, TRANSIT_MODE_LABELS, type TransitMode } from './transit'
import type { Issue } from './validate'
import type { OWay, Tags, XY } from './types'

/**
 * Проверки манёвров, которые видны только на пути через несколько узлов, и проверки маршрутов ОТ.
 * Каждая находит место, где граф позволяет то, чего на дороге нет, или запрещает то, что маршрут делает.
 */

/** Съезд не длиннее этого считается частью одного манёвра: разворот через него не виден в одном узле. */
const SHORT_LINK_M = 30
/** Сколько пути до и после съезда учитывается при подсчёте поворота. */
const APPROACH_M = 80
const EXIT_M = 20
const UTURN_DEG = 150
/** Выезд идёт обратно вплотную к подходу. Дальше — это объезд квартала двумя поворотами, а не разворот. */
const RETURN_GAP_M = 30
const STREET_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential'])
/** Как далеко назад искать место, где соседний въезд отходит от той же дороги. */
const BRANCH_SEARCH_M = 200
const CONTINUE_DEG = 45
/** Вторая проезжая часть бульвара: насколько близко и параллельно она идёт к односторонней. */
const TWIN_DISTANCE_M = 25
const TWIN_ANGLE_COS = Math.cos((25 * Math.PI) / 180)
const TWIN_SHARE = 0.6
const TWIN_MIN_LENGTH_M = 40
const TWIN_SAMPLE_M = 10
const TWIN_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary'])

function label(way: OWay | undefined, id: number): string {
  return way?.tags?.name ?? `дорога ${id}`
}

function isRoundabout(tags: Tags | undefined): boolean {
  return tags?.junction === 'roundabout' || tags?.junction === 'circular'
}

/** Закрыт ли въезд обычным машинам, но открыт общественному транспорту. */
function onlyForTransit(tags: Tags | undefined): boolean {
  if (!tags) return false
  if (tags.highway === 'busway') return true
  const closed = ['no', 'private'].includes(tags.motor_vehicle ?? '') || ['no', 'private'].includes(tags.access ?? '')
  const open = ['yes', 'designated'].some((value) => tags.psv === value || tags.bus === value || tags.trolley_bus === value)
  return closed && open
}

/** Точки участка по ходу движения через подход: к узлу подхода или от него. */
function pointsToward(arm: Arm): XY[] {
  return arm.atStart ? [...arm.link.points].reverse() : arm.link.points
}

function pointsAway(arm: Arm): XY[] {
  return arm.atStart ? arm.link.points : [...arm.link.points].reverse()
}

function tail(points: XY[], length: number): XY[] {
  const total = polylineLength(points)
  if (total <= length) return points
  return head([...points].reverse(), length).reverse()
}

function head(points: XY[], length: number): XY[] {
  const result: XY[] = [points[0]!]
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const step = dist(a, b)
    if (walked + step >= length) {
      result.push(add(a, scale(sub(b, a), (length - walked) / Math.max(step, 1e-9))))
      return result
    }
    walked += step
    result.push(b)
  }
  return result
}

/** Сумма поворотов вдоль ломаной, градусы: налево плюс, направо минус. */
function accumulatedTurn(points: XY[]): number {
  let total = 0
  let previous: XY | null = null
  for (let i = 1; i < points.length; i++) {
    const segment = sub(points[i]!, points[i - 1]!)
    if (Math.hypot(segment.x, segment.y) < 0.5) continue
    if (previous) {
      total += (Math.atan2(previous.x * segment.y - previous.y * segment.x, previous.x * segment.x + previous.y * segment.y) * 180) / Math.PI
    }
    previous = segment
  }
  return total
}

function otherEnd(arm: Arm): number {
  return arm.atStart ? arm.link.nodes.at(-1)! : arm.link.nodes[0]!
}

/** Подход того же участка с другой стороны. */
function oppositeArm(network: Network, arm: Arm): Arm | undefined {
  return network.arms.get(otherEnd(arm))?.find((item) => item.link === arm.link && item.atStart !== arm.atStart)
}

/** Подход, по которому к узлу этого подхода приезжают, не сворачивая. */
function straightPredecessor(network: Network, arm: Arm): Arm | undefined {
  const leaving = oppositeArm(network, arm)
  if (!leaving) return undefined
  let best: Arm | undefined
  let bestAngle = CONTINUE_DEG
  for (const candidate of network.arms.get(otherEnd(arm)) ?? []) {
    if (candidate.lanesIn === 0 || candidate.link === arm.link) continue
    const angle = Math.abs(turnAngle(candidate, leaving))
    if (angle < bestAngle) {
      bestAngle = angle
      best = candidate
    }
  }
  return best
}

/** Путь к узлу по ходу движения длиной до length: карман короткий, и его направление видно только вместе с дорогой до него. */
function approachPath(network: Network, arm: Arm, length: number): XY[] {
  let points = pointsToward(arm)
  let walked = arm.link.length
  let current: Arm | undefined = arm
  const used = new Set([arm.link])
  while (walked < length && current) {
    const previous = straightPredecessor(network, current)
    if (!previous || used.has(previous.link)) break
    used.add(previous.link)
    points = [...pointsToward(previous), ...points.slice(1)]
    walked += previous.link.length
    current = previous
  }
  return tail(points, length)
}

function distanceToPath(point: XY, path: XY[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < path.length; i++) best = Math.min(best, nearestOnSegment(point, path[i - 1]!, path[i]!).distance)
  return best
}

/** Карман, проезд или полоса для ОТ: с такого подхода разворот почти наверняка ошибка графа. */
function isSideApproach(tags: Tags | undefined): boolean {
  return tags?.highway === 'service' || onlyForTransit(tags) || ['no', 'private'].includes(tags?.motor_vehicle ?? '')
}

/**
 * Разворот, растянутый на два узла: подход, короткий съезд и выезд обратно вдоль того же подхода.
 * В каждом узле по отдельности это обычный манёвр, поэтому проверка одного узла его не видит.
 * С кармана или съезда только для ОТ это ошибка. С основной дороги это разрыв в разделительной полосе:
 * он бывает и на самом деле, поэтому только предупреждение со сверкой по снимку.
 */
export function checkHiddenUturns(doc: OsmDoc, network: Network, issues: Issue[]): void {
  const seen = new Set<string>()
  const found: { issue: Issue; from: Link; bridge: Link }[] = []
  const transitWays = new Set<number>()
  for (const relation of doc.relations.values()) {
    if (!isTransitRelation(relation)) continue
    for (const [type, ref] of relation.members) if (type === 'way') transitWays.add(ref)
  }
  for (const [via, arms] of network.arms) {
    const rulesHere = restrictionsAt(doc, via)
    for (const from of arms) {
      const fromTags = doc.ways.get(from.link.wayId)?.tags
      // С двусторонней дороги можно развернуться на ней самой: скрытый разворот бывает с односторонней
      if (from.lanesIn === 0 || !from.link.profile.oneway || isRoundabout(fromTags)) continue
      let approach: XY[] | null = null
      for (const bridge of arms) {
        if (bridge.lanesOut === 0 || bridge.neighbor === from.neighbor || bridge.link.length > SHORT_LINK_M) continue
        if (bridge.link === from.link || !isMovementAllowed(from, bridge, rulesHere)) continue
        const bridgeTags = doc.ways.get(bridge.link.wayId)?.tags
        if (isRoundabout(bridgeTags)) continue
        const far = otherEnd(bridge)
        const entering = oppositeArm(network, bridge)
        if (!entering || far === via) continue
        const rulesThere = restrictionsAt(doc, far)
        for (const exit of network.arms.get(far) ?? []) {
          if (exit.lanesOut === 0 || exit.link === bridge.link || exit.link === from.link) continue
          if (exit.link.wayId === bridge.link.wayId || exit.link.wayId === from.link.wayId) continue
          const exitTags = doc.ways.get(exit.link.wayId)?.tags
          // Развернуться во дворе или на парковке можно и на самом деле: важны выезды на улицы
          if (!STREET_CLASSES.has((exitTags?.highway ?? '').replace('_link', ''))) continue
          if (isRoundabout(exitTags) || !isMovementAllowed(entering, exit, rulesThere)) continue
          approach ??= approachPath(network, from, APPROACH_M)
          const exitPath = head(pointsAway(exit), EXIT_M)
          const path = [...approach, ...pointsAway(bridge).slice(1), ...exitPath.slice(1)]
          if (Math.abs(accumulatedTurn(path)) < UTURN_DEG) continue
          if (distanceToPath(exitPath.at(-1)!, approach) > RETURN_GAP_M) continue
          // Одно место — один съезд: выездов на ту же дорогу бывает несколько, манёвр от этого не меняется
          const key = `${from.link.wayId}:${bridge.link.wayId}:${exit.link.wayId}`
          if (seen.has(key)) continue
          seen.add(key)
          const node = doc.node(via)
          const fromName = label(doc.ways.get(from.link.wayId), from.link.wayId)
          const exitName = label(doc.ways.get(exit.link.wayId), exit.link.wayId)
          // Ошибка — разворот из автобусного кармана или через проезд только для ОТ. Остальное может быть настоящим разрывом
          const pocket = isSideApproach(fromTags) && transitWays.has(from.link.wayId)
          const side = pocket || onlyForTransit(bridgeTags) || onlyForTransit(fromTags)
          const transit = onlyForTransit(bridgeTags) ? ' Съезд открыт только общественному транспорту.' : ''
          found.push({ from: from.link, bridge: bridge.link, issue: {
            id: `uturn-${key}`,
            code: 'hidden_uturn',
            severity: side ? 'error' : 'warning',
            message: side
              ? `Разворот через короткий съезд ${bridge.link.wayId}: из «${fromName}» можно уехать в обратную сторону по «${exitName}».${transit}`
              : `Разворот через разрыв ${bridge.link.wayId}: из «${fromName}» можно уехать в обратную сторону по «${exitName}». Сверьте со снимком, разрешён ли он здесь`,
            position: { lat: node.lat, lon: node.lon },
            wayIds: [from.link.wayId, bridge.link.wayId, exit.link.wayId],
            nodeIds: [via, far],
          } })
        }
      }
    }
  }
  // Продолжение уже найденного разворота, начатое с его же съезда, — тот же манёвр, а не новый
  const bridges = new Set(found.map((item) => item.bridge))
  for (const item of found) if (!bridges.has(item.from)) issues.push(item.issue)
}

/** Узлы позади подхода, если ехать к нему по той же дороге, не сворачивая. */
function straightChain(network: Network, arm: Arm): Set<number> {
  const nodes = new Set<number>()
  let current: Arm | undefined = arm
  let walked = 0
  while (current && walked < BRANCH_SEARCH_M) {
    walked += current.link.length
    const start = otherEnd(current)
    if (nodes.has(start)) break
    nodes.add(start)
    current = straightPredecessor(network, current)
  }
  return nodes
}

/**
 * Запрет манёвра действует только для своей дороги. Если от неё рядом отходит карман или боковой проезд
 * и с него к тому же выезду можно проехать, запрет на деле не работает.
 */
export function checkRestrictionBypass(doc: OsmDoc, network: Network, issues: Issue[]): void {
  for (const [via, arms] of network.arms) {
    const rules = restrictionsAt(doc, via).filter((rule) => rule.kind === 'no')
    for (const rule of rules) {
      const forbidden = arms.filter((arm) => arm.link.wayId === rule.from && arm.lanesIn > 0)
      const targets = arms.filter((arm) => arm.link.wayId === rule.to && arm.lanesOut > 0)
      if (forbidden.length === 0 || targets.length === 0) continue
      const mainChain = new Set(forbidden.flatMap((arm) => [...straightChain(network, arm)]))
      for (const side of arms) {
        if (side.lanesIn === 0 || side.link.wayId === rule.from) continue
        const target = targets.find((arm) => arm.neighbor !== side.neighbor && isMovementAllowed(side, arm, restrictionsAt(doc, via)))
        if (!target) continue
        const shared = [...straightChain(network, side)].some((node) => node !== via && mainChain.has(node))
        if (!shared) continue
        const node = doc.node(via)
        issues.push({
          id: `bypass-${rule.relationId}-${side.link.wayId}`,
          code: 'restriction_bypass',
          severity: 'warning',
          message: `Запрет ${rule.value} для «${label(doc.ways.get(rule.from), rule.from)}» обходится через соседний въезд «${label(doc.ways.get(side.link.wayId), side.link.wayId)}»: с него на «${label(doc.ways.get(rule.to), rule.to)}» проехать можно`,
          position: { lat: node.lat, lon: node.lon },
          wayIds: [rule.from, side.link.wayId, rule.to],
          nodeIds: [via],
        })
      }
    }
  }
}

const MODE_KEYS: Record<TransitMode, string[]> = {
  bus: ['bus', 'psv'],
  trolleybus: ['trolley_bus', 'psv'],
  minibus: ['minibus', 'bus', 'psv'],
  share_taxi: ['share_taxi', 'minibus', 'psv'],
  tram: [],
}

/** Почему маршрут не может ехать по дороге, или null, если может. */
function accessProblem(tags: Tags | undefined, mode: TransitMode): string | null {
  const keys = MODE_KEYS[mode]
  const values = keys.map((key) => tags?.[key])
  if (values.some((value) => value === 'no')) return `${keys.find((key) => tags?.[key] === 'no')}=no`
  if (values.some((value) => value === 'yes' || value === 'designated' || value === 'permissive')) return null
  if (tags?.highway === 'busway') return null
  for (const key of ['access', 'vehicle', 'motor_vehicle']) {
    const value = tags?.[key]
    if (value === 'no' || value === 'private') return `${key}=${value}, а разрешения для ОТ вроде psv=yes или ${keys[0]}=yes нет`
  }
  if (!isDrivable(tags)) return `highway=${tags?.highway ?? '?'}`
  return null
}

function againstOneway(tags: Tags | undefined, forward: boolean, mode: TransitMode): boolean {
  if (MODE_KEYS[mode].some((key) => tags?.[`oneway:${key}`] === 'no')) return false
  const profile = parseProfile(tags ?? {})
  return forward ? profile.forward === 0 : profile.backward === 0
}

/** Маршрут ОТ должен идти только там, где его транспорт может проехать, и по ходу одностороннего движения. */
export function checkTransitRoutes(doc: OsmDoc, issues: Issue[]): void {
  const closed = new Map<number, { reason: string; lines: Set<string> }>()
  const against = new Map<number, Set<string>>()
  for (const relation of doc.relations.values()) {
    if (!isTransitRelation(relation)) continue
    const mode = relation.tags!.route as TransitMode
    if (!ROAD_MODES.has(mode)) continue
    const name = `${TRANSIT_MODE_LABELS[mode].toLowerCase()} ${relation.tags?.ref ?? relation.id}`
    const wayIds = relation.members
      .filter(([type, ref, role]) => type === 'way' && !/^(stop|platform)/.test(role) && doc.ways.has(ref))
      .map(([, ref]) => ref)
    for (const wayId of wayIds) {
      const reason = accessProblem(doc.ways.get(wayId)?.tags, mode)
      if (!reason) continue
      const entry = closed.get(wayId) ?? { reason, lines: new Set<string>() }
      entry.lines.add(name)
      closed.set(wayId, entry)
    }
    for (const segment of lineSegments(doc, wayIds)) {
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1]!
        const b = segment[i]!
        for (const wayId of wayIds) {
          const nds = doc.ways.get(wayId)!.nds
          const index = nds.findIndex((nd, k) => (nd === a && nds[k + 1] === b) || (nd === b && nds[k + 1] === a))
          if (index < 0) continue
          if (againstOneway(doc.ways.get(wayId)?.tags, nds[index] === a, mode)) {
            const lines = against.get(wayId) ?? new Set<string>()
            lines.add(name)
            against.set(wayId, lines)
          }
          break
        }
      }
    }
  }
  const position = (wayId: number) => {
    const way = doc.ways.get(wayId)!
    const node = doc.nodes.get(way.nds[Math.floor(way.nds.length / 2)]!) ?? doc.node(way.nds[0]!)
    return { lat: node.lat, lon: node.lon }
  }
  for (const [wayId, { reason, lines }] of closed) {
    issues.push({
      id: `transit-access-${wayId}`,
      code: 'transit_access',
      severity: 'warning',
      message: `${[...lines].join(', ')}: маршрут идёт по «${label(doc.ways.get(wayId), wayId)}», а она закрыта для этого транспорта (${reason})`,
      position: position(wayId),
      wayIds: [wayId],
      nodeIds: [],
    })
  }
  for (const [wayId, lines] of against) {
    issues.push({
      id: `transit-oneway-${wayId}`,
      code: 'transit_against_oneway',
      severity: 'warning',
      message: `${[...lines].join(', ')}: маршрут идёт по «${label(doc.ways.get(wayId), wayId)}» против одностороннего движения`,
      position: position(wayId),
      wayIds: [wayId],
      nodeIds: [],
    })
  }
}

interface Piece {
  wayId: number
  a: XY
  b: XY
  dir: XY
}

/**
 * Половина бульвара без oneway: безымянная двусторонняя дорога вплотную и параллельно односторонней.
 * Тогда по ней можно ехать навстречу потоку. Это подозрение, а не доказательство: место надо сверить со снимком.
 */
export function checkMissingOneway(doc: OsmDoc, projector: Projector, ways: OWay[], issues: Issue[]): void {
  const cell = TWIN_DISTANCE_M * 2
  const grid = new Map<string, Piece[]>()
  const points = (way: OWay) => way.nds.map((id) => doc.nodes.get(id)).filter((node) => !!node).map((node) => projector.toXY(node!))
  for (const way of ways) {
    if (!parseProfile(way.tags ?? {}).oneway) continue
    const xy = points(way)
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1]!
      const b = xy[i]!
      if (dist(a, b) < 0.5) continue
      const piece: Piece = { wayId: way.id, a, b, dir: unit(sub(b, a)) }
      const minX = Math.floor(Math.min(a.x, b.x) / cell)
      const maxX = Math.floor(Math.max(a.x, b.x) / cell)
      const minY = Math.floor(Math.min(a.y, b.y) / cell)
      const maxY = Math.floor(Math.max(a.y, b.y) / cell)
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = `${x}:${y}`
          const list = grid.get(key)
          if (list) list.push(piece)
          else grid.set(key, [piece])
        }
      }
    }
  }

  for (const way of ways) {
    const tags = way.tags ?? {}
    if (tags.name || parseProfile(tags).oneway || !TWIN_CLASSES.has((tags.highway ?? '').replace('_link', ''))) continue
    const xy = points(way)
    if (polylineLength(xy) < TWIN_MIN_LENGTH_M) continue
    let samples = 0
    let hits = 0
    const neighbors = new Map<number, number>()
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1]!
      const b = xy[i]!
      const length = dist(a, b)
      if (length < 0.5) continue
      const dir = unit(sub(b, a))
      for (let s = TWIN_SAMPLE_M / 2; s < length; s += TWIN_SAMPLE_M) {
        const p = add(a, scale(dir, s))
        samples++
        const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`
        const match = (grid.get(key) ?? []).find(
          (piece) =>
            piece.wayId !== way.id &&
            Math.abs(piece.dir.x * dir.x + piece.dir.y * dir.y) >= TWIN_ANGLE_COS &&
            nearestOnSegment(p, piece.a, piece.b).distance <= TWIN_DISTANCE_M,
        )
        if (match) {
          hits++
          neighbors.set(match.wayId, (neighbors.get(match.wayId) ?? 0) + 1)
        }
      }
    }
    if (samples === 0 || hits / samples < TWIN_SHARE) continue
    const twin = [...neighbors.entries()].sort((x, y) => y[1] - x[1])[0]![0]
    const middle = doc.nodes.get(way.nds[Math.floor(way.nds.length / 2)]!) ?? doc.node(way.nds[0]!)
    issues.push({
      id: `twin-${way.id}`,
      code: 'missing_oneway',
      severity: 'warning',
      message: `Безымянная двусторонняя «${label(way, way.id)}» идёт вплотную вдоль односторонней «${label(doc.ways.get(twin), twin)}»: возможно, это вторая проезжая часть без oneway`,
      position: { lat: middle.lat, lon: middle.lon },
      wayIds: [way.id, twin],
      nodeIds: [],
    })
  }
}
