import type { OsmDoc } from './doc'
import { maxSlopePercent } from './elevation'
import { dist, nearestOnSegment, Projector, segmentsCross } from './geo'
import { isDrivable, isOneway, parseProfile, parseTurnLanes } from './lanes'
import { insertNodeOnWay, mergeNodes, setWayTags, unglueNode } from './ops'
import { wayLevel } from './topology'
import type { LatLon, ORelation, OWay, XY } from './types'

export type Severity = 'error' | 'warning' | 'info'

export type IssueCode =
  | 'isolated'
  | 'no_exit'
  | 'no_entry'
  | 'head_on'
  | 'lanes_turn_mismatch'
  | 'lanes_sum_mismatch'
  | 'oneway_backward_lanes'
  | 'broken_junction'
  | 'crossing_without_node'
  | 'glued_levels'
  | 'structure_without_layer'
  | 'floating_signal'
  | 'restriction_detached'
  | 'duplicate_nodes'
  | 'no_lanes'
  | 'steep_slope'
  | 'lane_change_mismatch'

export interface Issue {
  id: string
  code: IssueCode
  severity: Severity
  message: string
  position: LatLon
  wayIds: number[]
  nodeIds: number[]
  fixLabel?: string
  fix?: () => void
}

export const ISSUE_TITLES: Record<IssueCode, string> = {
  isolated: 'Изолированные участки',
  no_exit: 'Из узла нельзя выехать',
  no_entry: 'В узел нельзя въехать',
  head_on: 'Встречные односторонние дороги',
  lanes_turn_mismatch: 'Манёвров не столько, сколько полос',
  lanes_sum_mismatch: 'Сумма полос не сходится',
  oneway_backward_lanes: 'Встречные полосы на односторонней',
  broken_junction: 'Разорванные перекрёстки',
  crossing_without_node: 'Пересечение без узла',
  glued_levels: 'Склеенные уровни',
  structure_without_layer: 'Мост или тоннель без уровня',
  floating_signal: 'Светофор вне дороги',
  restriction_detached: 'Запрет не касается дорог',
  duplicate_nodes: 'Узлы в одной точке',
  no_lanes: 'Не указано число полос',
  steep_slope: 'Слишком крутой уклон',
  lane_change_mismatch: 'Правил перестроения не столько, сколько полос',
}

const BROKEN_JUNCTION_M = 4
const DUPLICATE_NODE_M = 0.5
const MAX_SLOPE_PERCENT = 12
const ROADS_REQUIRING_LANES = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'motorway'])

interface Segment {
  way: OWay
  index: number
  a: XY
  b: XY
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface Context {
  doc: OsmDoc
  projector: Projector
  ways: OWay[]
  issues: Issue[]
  /** Запас у границы выгрузки: дорога, обрезанная рамкой, не считается тупиком. */
  isNearBorder: (id: number) => boolean
  drivableNodes: Set<number>
}

export function validate(doc: OsmDoc, projector: Projector): Issue[] {
  const ways = [...doc.ways.values()].filter((way) => isDrivable(way.tags))
  const { minlat, maxlat, minlon, maxlon } = doc.bounds
  const margin = 0.0004
  const isNearBorder = (id: number) => {
    const node = doc.nodes.get(id)
    if (!node) return true
    return (
      node.lat <= minlat + margin ||
      node.lat >= maxlat - margin ||
      node.lon <= minlon + margin ||
      node.lon >= maxlon - margin
    )
  }
  const context: Context = {
    doc,
    projector,
    ways,
    issues: [],
    isNearBorder,
    drivableNodes: new Set(ways.flatMap((way) => way.nds)),
  }

  checkTags(context)
  checkConnectivity(context)
  checkDirections(context)
  checkGeometry(context)
  checkSignals(context)
  checkRestrictions(context)
  checkSlopes(context)

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  return context.issues.sort((a, b) => order[a.severity] - order[b.severity])
}

function wayPosition(doc: OsmDoc, way: OWay): LatLon {
  const node = doc.nodes.get(way.nds[Math.floor(way.nds.length / 2)]!) ?? doc.nodes.get(way.nds[0]!)
  return node ? { lat: node.lat, lon: node.lon } : { lat: doc.bounds.minlat, lon: doc.bounds.minlon }
}

function label(way: OWay): string {
  return way.tags?.name ?? `дорога ${way.id}`
}

function checkTags({ doc, ways, issues }: Context): void {
  for (const way of ways) {
    const tags = way.tags ?? {}
    const position = wayPosition(doc, way)
    const oneway = isOneway(tags)
    const lanes = Number.parseInt(tags.lanes ?? '', 10)
    const forward = Number.parseInt(tags['lanes:forward'] ?? '', 10)
    const backward = Number.parseInt(tags['lanes:backward'] ?? '', 10)

    if (Number.isFinite(lanes) && Number.isFinite(forward) && Number.isFinite(backward) && forward + backward !== lanes) {
      issues.push({
        id: `sum-${way.id}`,
        code: 'lanes_sum_mismatch',
        severity: 'warning',
        message: `${label(way)}: lanes=${lanes}, а по направлениям ${forward} + ${backward}`,
        position,
        wayIds: [way.id],
        nodeIds: [],
        fixLabel: `Поставить lanes=${forward + backward}`,
        fix: () => setWayTags(doc, way.id, { ...way.tags, lanes: String(forward + backward) }),
      })
    }

    if (oneway && Number.isFinite(backward) && backward > 0) {
      issues.push({
        id: `oneway-back-${way.id}`,
        code: 'oneway_backward_lanes',
        severity: 'warning',
        message: `${label(way)}: дорога односторонняя, но указано lanes:backward=${backward}`,
        position,
        wayIds: [way.id],
        nodeIds: [],
      })
    }

    const profile = parseProfile(tags)
    const checks: [string[] | null, number, string][] = oneway
      ? [[parseTurnLanes(tags['turn:lanes'] ?? tags['turn:lanes:forward']), profile.forward + profile.backward, 'turn:lanes']]
      : [
          [parseTurnLanes(tags['turn:lanes:forward']), profile.forward, 'turn:lanes:forward'],
          [parseTurnLanes(tags['turn:lanes:backward']), profile.backward, 'turn:lanes:backward'],
        ]
    for (const [turns, count, key] of checks) {
      if (!turns || turns.length === count) continue
      const fixed = turns.length
      issues.push({
        id: `turn-${way.id}-${key}`,
        code: 'lanes_turn_mismatch',
        severity: 'error',
        message: `${label(way)}: полос ${count}, а манёвров в ${key} ${turns.length}`,
        position,
        wayIds: [way.id],
        nodeIds: [],
        ...(oneway
          ? {
              fixLabel: `Поставить lanes=${fixed}`,
              fix: () => setWayTags(doc, way.id, { ...way.tags, lanes: String(fixed) }),
            }
          : {}),
      })
    }

    const changes: [string[] | null, number, string][] = [
      [profile.changeForward, profile.forward, 'по ходу дороги'],
      [profile.changeBackward, profile.backward, 'встречном направлении'],
    ]
    for (const [rules, count, side] of changes) {
      if (!rules || rules.length === count || count === 0) continue
      issues.push({
        id: `change-${way.id}-${side}`,
        code: 'lane_change_mismatch',
        severity: 'warning',
        message: `${label(way)}: ${rules.length} правил change:lanes на ${count} полос в ${side}`,
        position,
        wayIds: [way.id],
        nodeIds: [],
      })
    }

    if (!tags.lanes && ROADS_REQUIRING_LANES.has((tags.highway ?? '').replace('_link', ''))) {
      issues.push({
        id: `no-lanes-${way.id}`,
        code: 'no_lanes',
        severity: 'info',
        message: `${label(way)}: не указано число полос`,
        position,
        wayIds: [way.id],
        nodeIds: [],
      })
    }

    if ((tags.bridge && tags.bridge !== 'no' || tags.tunnel && tags.tunnel !== 'no') && !tags.layer) {
      const up = tags.bridge && tags.bridge !== 'no'
      issues.push({
        id: `layer-${way.id}`,
        code: 'structure_without_layer',
        severity: 'warning',
        message: `${label(way)}: ${up ? 'мост' : 'тоннель'} без тега layer`,
        position,
        wayIds: [way.id],
        nodeIds: [],
        fixLabel: `Поставить layer=${up ? 1 : -1}`,
        fix: () => setWayTags(doc, way.id, { ...way.tags, layer: up ? '1' : '-1' }),
      })
    }
  }
}

function checkSlopes({ doc, projector, ways, issues }: Context): void {
  for (const way of ways) {
    const slope = maxSlopePercent(doc, way, projector)
    if (slope <= MAX_SLOPE_PERCENT) continue
    issues.push({
      id: `slope-${way.id}`,
      code: 'steep_slope',
      severity: 'warning',
      message: `${label(way)}: уклон ${slope.toFixed(1)}%. Удлините переход по высоте`,
      position: wayPosition(doc, way),
      wayIds: [way.id],
      nodeIds: [],
    })
  }
}

function checkConnectivity({ doc, ways, issues, isNearBorder }: Context): void {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    while (parent.get(x) !== root) {
      const next = parent.get(x)!
      parent.set(x, root)
      x = next
    }
    return root
  }
  for (const way of ways) {
    for (const nd of way.nds) if (!parent.has(nd)) parent.set(nd, nd)
    for (let i = 1; i < way.nds.length; i++) parent.set(find(way.nds[i]!), find(way.nds[i - 1]!))
  }
  const groups = new Map<number, OWay[]>()
  for (const way of ways) {
    const root = find(way.nds[0]!)
    const list = groups.get(root)
    if (list) list.push(way)
    else groups.set(root, [way])
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length)
  for (const group of sorted.slice(1)) {
    // Обрывок у самой рамки выгрузки — следствие обрезки файла, а не ошибка сети
    if (group.every((way) => way.nds.every(isNearBorder))) continue
    const first = group[0]!
    issues.push({
      id: `isolated-${first.id}`,
      code: 'isolated',
      severity: 'error',
      message:
        group.length === 1
          ? `${label(first)} не связана с основной сетью`
          : `Группа из ${group.length} дорог не связана с основной сетью (${label(first)})`,
      position: wayPosition(doc, first),
      wayIds: group.map((way) => way.id),
      nodeIds: [],
    })
  }
}

function checkDirections({ doc, ways, issues, isNearBorder }: Context): void {
  const incoming = new Map<number, number>()
  const outgoing = new Map<number, number>()
  const onewayEnds = new Map<number, { ins: OWay[]; outs: OWay[] }>()
  const bump = (map: Map<number, number>, id: number) => map.set(id, (map.get(id) ?? 0) + 1)

  for (const way of ways) {
    const profile = parseProfile(way.tags ?? {})
    for (let i = 1; i < way.nds.length; i++) {
      const a = way.nds[i - 1]!
      const b = way.nds[i]!
      if (profile.forward > 0) {
        bump(outgoing, a)
        bump(incoming, b)
      }
      if (profile.backward > 0) {
        bump(outgoing, b)
        bump(incoming, a)
      }
    }
    if (profile.oneway) {
      const reversed = profile.forward === 0
      const start = reversed ? way.nds.at(-1)! : way.nds[0]!
      const end = reversed ? way.nds[0]! : way.nds.at(-1)!
      if (!onewayEnds.has(start)) onewayEnds.set(start, { ins: [], outs: [] })
      if (!onewayEnds.has(end)) onewayEnds.set(end, { ins: [], outs: [] })
      onewayEnds.get(start)!.outs.push(way)
      onewayEnds.get(end)!.ins.push(way)
    }
  }

  for (const [nodeId, { ins, outs }] of onewayEnds) {
    const node = doc.nodes.get(nodeId)
    if (!node || isNearBorder(nodeId)) continue
    const degreeIn = incoming.get(nodeId) ?? 0
    const degreeOut = outgoing.get(nodeId) ?? 0
    const position = { lat: node.lat, lon: node.lon }

    if (degreeOut === 0 && ins.length >= 2) {
      issues.push({
        id: `headon-${nodeId}`,
        code: 'head_on',
        severity: 'error',
        message: `Односторонние дороги идут навстречу друг другу: ${ins.map(label).join(', ')}`,
        position,
        wayIds: ins.map((way) => way.id),
        nodeIds: [nodeId],
      })
    } else if (degreeOut === 0 && degreeIn > 0) {
      issues.push({
        id: `noexit-${nodeId}`,
        code: 'no_exit',
        severity: 'warning',
        message: `Конец односторонней дороги: выезда нет (${ins.map(label).join(', ')})`,
        position,
        wayIds: ins.map((way) => way.id),
        nodeIds: [nodeId],
      })
    } else if (degreeIn === 0 && degreeOut > 0) {
      issues.push({
        id: `noentry-${nodeId}`,
        code: 'no_entry',
        severity: 'warning',
        message: `Начало односторонней дороги: въезда нет (${outs.map(label).join(', ')})`,
        position,
        wayIds: outs.map((way) => way.id),
        nodeIds: [nodeId],
      })
    }
  }
}

function buildSegments({ doc, projector, ways }: Context): Segment[] {
  const segments: Segment[] = []
  for (const way of ways) {
    for (let i = 1; i < way.nds.length; i++) {
      const start = doc.nodes.get(way.nds[i - 1]!)
      const end = doc.nodes.get(way.nds[i]!)
      if (!start || !end) continue
      const a = projector.toXY(start)
      const b = projector.toXY(end)
      segments.push({
        way,
        index: i,
        a,
        b,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      })
    }
  }
  return segments
}

function checkGeometry(context: Context): void {
  const { doc, projector, ways, issues } = context
  const segments = buildSegments(context)

  // Настоящее пересечение без общего узла на одном уровне: машины проедут друг сквозь друга
  const seenCross = new Set<string>()
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!
    for (let j = i + 1; j < segments.length; j++) {
      const t = segments[j]!
      if (s.way.id === t.way.id) continue
      if (s.maxX < t.minX || t.maxX < s.minX || s.maxY < t.minY || t.maxY < s.minY) continue
      if (wayLevel(s.way.tags ?? {}) !== wayLevel(t.way.tags ?? {})) continue
      const point = segmentsCross(s.a, s.b, t.a, t.b)
      if (!point) continue
      const key = `${Math.min(s.way.id, t.way.id)}-${Math.max(s.way.id, t.way.id)}-${Math.round(point.x)}-${Math.round(point.y)}`
      if (seenCross.has(key)) continue
      seenCross.add(key)
      const position = projector.toLatLon(point)
      const first = s.way.id
      const second = t.way.id
      issues.push({
        id: `cross-${key}`,
        code: 'crossing_without_node',
        severity: 'error',
        message: `${label(s.way)} и ${label(t.way)} пересекаются без общего узла на одном уровне`,
        position,
        wayIds: [first, second],
        nodeIds: [],
        fixLabel: 'Создать перекрёсток',
        fix: () => {
          const a = insertNodeOnWay(doc, projector, first, position)
          const b = insertNodeOnWay(doc, projector, second, position)
          mergeNodes(doc, a, b)
        },
      })
    }
  }

  // Конец дороги почти касается другой дороги, но не связан с ней
  const nodeUse = new Map<number, number>()
  for (const way of ways) for (const nd of way.nds) nodeUse.set(nd, (nodeUse.get(nd) ?? 0) + 1)

  for (const way of ways) {
    for (const end of [way.nds[0]!, way.nds.at(-1)!]) {
      if ((nodeUse.get(end) ?? 0) > 1) continue
      const node = doc.nodes.get(end)
      if (!node) continue
      const p = projector.toXY(node)
      let best: { segment: Segment; distance: number; point: XY } | null = null
      for (const segment of segments) {
        if (segment.way.id === way.id) continue
        if (wayLevel(segment.way.tags ?? {}) !== wayLevel(way.tags ?? {})) continue
        if (
          p.x < segment.minX - BROKEN_JUNCTION_M ||
          p.x > segment.maxX + BROKEN_JUNCTION_M ||
          p.y < segment.minY - BROKEN_JUNCTION_M ||
          p.y > segment.maxY + BROKEN_JUNCTION_M
        ) {
          continue
        }
        const hit = nearestOnSegment(p, segment.a, segment.b)
        if (hit.distance <= BROKEN_JUNCTION_M && (!best || hit.distance < best.distance)) {
          best = { segment, distance: hit.distance, point: hit.point }
        }
      }
      if (!best) continue
      const target = best.segment
      const hitPoint = best.point
      const targetWay = target.way.id
      const wayId = way.id
      issues.push({
        id: `broken-${way.id}-${end}`,
        code: 'broken_junction',
        severity: 'error',
        message: `${label(way)} не доходит ${best.distance.toFixed(1)} м до дороги «${label(target.way)}»`,
        position: { lat: node.lat, lon: node.lon },
        wayIds: [wayId, targetWay],
        nodeIds: [end],
        fixLabel: 'Соединить',
        fix: () => connectEnd(doc, projector, end, targetWay, hitPoint),
      })
    }
  }

  // Узел общий для дорог разного уровня: мост склеен с дорогой под ним
  for (const [nodeId, count] of nodeUse) {
    if (count < 2) continue
    const wayIds = doc.waysOfNode(nodeId).filter((id) => isDrivable(doc.ways.get(id)?.tags))
    const levels = new Set(wayIds.map((id) => wayLevel(doc.way(id).tags ?? {})))
    if (levels.size < 2) continue
    // Съезд на мост в конце дороги — нормальный стык. Ошибка, если дорога проходит узел насквозь
    const passesThrough = wayIds.some((id) => {
      const nds = doc.way(id).nds
      return nds[0] !== nodeId && nds.at(-1) !== nodeId
    })
    if (!passesThrough) continue
    const node = doc.node(nodeId)
    issues.push({
      id: `glued-${nodeId}`,
      code: 'glued_levels',
      severity: 'error',
      message: `В узле ${nodeId} склеены дороги разных уровней`,
      position: { lat: node.lat, lon: node.lon },
      wayIds,
      nodeIds: [nodeId],
      fixLabel: 'Расклеить',
      fix: () => {
        unglueNode(doc, projector, nodeId)
      },
    })
  }

  // Разные узлы в одной точке выглядят как перекрёсток, но им не являются
  const grid = new Map<string, number[]>()
  for (const nodeId of context.drivableNodes) {
    const node = doc.nodes.get(nodeId)
    if (!node) continue
    const p = projector.toXY(node)
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`
    const list = grid.get(key)
    if (list) list.push(nodeId)
    else grid.set(key, [nodeId])
  }
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = doc.node(list[i]!)
        const b = doc.node(list[j]!)
        if (dist(projector.toXY(a), projector.toXY(b)) > DUPLICATE_NODE_M) continue
        const levelsA = doc.waysOfNode(a.id).map((id) => wayLevel(doc.way(id).tags ?? {}))
        const levelsB = doc.waysOfNode(b.id).map((id) => wayLevel(doc.way(id).tags ?? {}))
        if (!levelsA.some((level) => levelsB.includes(level))) continue
        issues.push({
          id: `dup-${a.id}-${b.id}`,
          code: 'duplicate_nodes',
          severity: 'error',
          message: `Узлы ${a.id} и ${b.id} лежат в одной точке, но не склеены`,
          position: { lat: a.lat, lon: a.lon },
          wayIds: [...doc.waysOfNode(a.id), ...doc.waysOfNode(b.id)],
          nodeIds: [a.id, b.id],
          fixLabel: 'Склеить',
          fix: () => mergeNodes(doc, a.id, b.id),
        })
      }
    }
  }
}

function connectEnd(
  doc: OsmDoc,
  projector: Projector,
  endNode: number,
  targetWay: number,
  point: XY,
): void {
  const target = doc.way(targetWay)
  for (const nd of target.nds) {
    const candidate = doc.nodes.get(nd)
    if (candidate && dist(projector.toXY(candidate), point) < 1) {
      mergeNodes(doc, nd, endNode)
      return
    }
  }
  const inserted = insertNodeOnWay(doc, projector, targetWay, projector.toLatLon(point))
  mergeNodes(doc, inserted, endNode)
}

function checkSignals({ doc, issues, drivableNodes }: Context): void {
  for (const node of doc.nodes.values()) {
    if (node.tags?.highway !== 'traffic_signals' || drivableNodes.has(node.id)) continue
    issues.push({
      id: `signal-${node.id}`,
      code: 'floating_signal',
      severity: 'warning',
      message: `Светофор ${node.id} не стоит на проезжей дороге`,
      position: { lat: node.lat, lon: node.lon },
      wayIds: [],
      nodeIds: [node.id],
    })
  }
}

function restrictionMembers(relation: ORelation) {
  let from: number | null = null
  let to: number | null = null
  let via: number | null = null
  for (const [type, ref, role] of relation.members) {
    if (type === 'way' && role === 'from') from = ref
    else if (type === 'way' && role === 'to') to = ref
    else if (type === 'node' && role === 'via') via = ref
  }
  return { from, to, via }
}

function checkRestrictions({ doc, issues }: Context): void {
  for (const relation of doc.relations.values()) {
    if (relation.tags?.type !== 'restriction') continue
    const { from, to, via } = restrictionMembers(relation)
    // Запреты на дороги вне выгрузки неизбежны и симуляторам не мешают
    if (via === null || from === null || to === null) continue
    const viaNode = doc.nodes.get(via)
    const fromWay = doc.ways.get(from)
    const toWay = doc.ways.get(to)
    if (!viaNode || !fromWay || !toWay) continue
    if (fromWay.nds.includes(via) && toWay.nds.includes(via)) continue
    issues.push({
      id: `restriction-${relation.id}`,
      code: 'restriction_detached',
      severity: 'warning',
      message: `Запрет ${relation.tags.restriction ?? ''} не проходит через свой узел`,
      position: { lat: viaNode.lat, lon: viaNode.lon },
      wayIds: [from, to],
      nodeIds: [via],
    })
  }
}

export interface ConnectivityReport {
  /** Проезжих дорог всего. */
  totalWays: number
  /** Групп дорог, не связанных между собой. */
  components: number
  /** Дорог вне основной группы. */
  isolatedWays: number[]
  /** Дорог, с которых нельзя вернуться в основную сеть или попасть на них из неё. */
  oneDirectionWays: number[]
  ok: boolean
}

/** Проверка связности перед сохранением: и без учёта направлений, и с ними. */
export function connectivityReport(doc: OsmDoc): ConnectivityReport {
  const ways = [...doc.ways.values()].filter((way) => isDrivable(way.tags))
  const forward = new Map<number, number[]>()
  const backward = new Map<number, number[]>()
  const undirected = new Map<number, number[]>()
  const push = (map: Map<number, number[]>, from: number, to: number) => {
    const list = map.get(from)
    if (list) list.push(to)
    else map.set(from, [to])
  }
  for (const way of ways) {
    const profile = parseProfile(way.tags ?? {})
    for (let i = 1; i < way.nds.length; i++) {
      const a = way.nds[i - 1]!
      const b = way.nds[i]!
      push(undirected, a, b)
      push(undirected, b, a)
      if (profile.forward > 0) {
        push(forward, a, b)
        push(backward, b, a)
      }
      if (profile.backward > 0) {
        push(forward, b, a)
        push(backward, a, b)
      }
    }
  }
  const walk = (start: number, graph: Map<number, number[]>): Set<number> => {
    const seen = new Set<number>([start])
    const stack = [start]
    while (stack.length > 0) {
      for (const next of graph.get(stack.pop()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    return seen
  }

  const assigned = new Set<number>()
  let components = 0
  let largest = new Set<number>()
  for (const node of undirected.keys()) {
    if (assigned.has(node)) continue
    const component = walk(node, undirected)
    for (const item of component) assigned.add(item)
    components++
    if (component.size > largest.size) largest = component
  }
  const isolatedWays = ways.filter((way) => !largest.has(way.nds[0]!)).map((way) => way.id)

  // Сильно связное ядро основной группы ищем от самого проезжаемого узла
  let hub = -1
  let hubDegree = -1
  for (const node of largest) {
    const degree = (forward.get(node)?.length ?? 0) + (backward.get(node)?.length ?? 0)
    if (degree > hubDegree) {
      hubDegree = degree
      hub = node
    }
  }
  const fromHub = hub >= 0 ? walk(hub, forward) : new Set<number>()
  const toHub = hub >= 0 ? walk(hub, backward) : new Set<number>()
  const oneDirectionWays = ways
    .filter((way) => largest.has(way.nds[0]!))
    .filter((way) => way.nds.some((nd) => !fromHub.has(nd) || !toHub.has(nd)))
    .map((way) => way.id)

  return {
    totalWays: ways.length,
    components,
    isolatedWays,
    oneDirectionWays,
    ok: isolatedWays.length === 0 && oneDirectionWays.length === 0,
  }
}
