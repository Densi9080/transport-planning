import type { OsmDoc } from './doc'
import { nearestOnSegment, Projector } from './geo'
import { isOneway } from './lanes'
import {
  buildNetwork,
  isMovementAllowed,
  restrictionsAt,
  restrictionValue,
  turnKind,
} from './topology'
import type { LatLon, Member, ONode, ORelation, OWay, Tags, XY } from './types'

/**
 * Операции над графом. Вызываются внутри транзакции документа,
 * поэтому каждая из них отменяется одним шагом.
 */

const RESTRICTION_ROLES = new Set(['from', 'via', 'to'])

function isRestriction(relation: ORelation): boolean {
  return relation.tags?.type === 'restriction' || relation.members.some(([, , r]) => RESTRICTION_ROLES.has(r))
}

function dedupeConsecutive(nds: number[]): number[] {
  return nds.filter((nd, index) => index === 0 || nd !== nds[index - 1])
}

export function addNode(doc: OsmDoc, position: LatLon, tags?: Tags): number {
  const id = doc.newId()
  const node: ONode = { id, lat: position.lat, lon: position.lon }
  if (tags && Object.keys(tags).length > 0) node.tags = tags
  doc.putNode(node)
  return id
}

export function moveNode(doc: OsmDoc, id: number, position: LatLon): void {
  doc.putNode({ ...doc.node(id), lat: position.lat, lon: position.lon })
}

export function setNodeTags(doc: OsmDoc, id: number, tags: Tags): void {
  const { tags: _old, ...rest } = doc.node(id)
  doc.putNode(Object.keys(tags).length > 0 ? { ...rest, tags } : rest)
}

export function setWayTags(doc: OsmDoc, id: number, tags: Tags): void {
  const { tags: _old, ...rest } = doc.way(id)
  doc.putWay(Object.keys(tags).length > 0 ? { ...rest, tags } : rest)
}

/** Вставляет узел в ближайший отрезок дороги. */
export function insertNodeOnWay(
  doc: OsmDoc,
  projector: Projector,
  wayId: number,
  position: LatLon,
): number {
  const way = doc.way(wayId)
  const target = projector.toXY(position)
  let bestIndex = 0
  let best = Number.POSITIVE_INFINITY
  let bestPoint: XY = target
  for (let i = 1; i < way.nds.length; i++) {
    const hit = nearestOnSegment(
      target,
      projector.toXY(doc.node(way.nds[i - 1]!)),
      projector.toXY(doc.node(way.nds[i]!)),
    )
    if (hit.distance < best) {
      best = hit.distance
      bestIndex = i
      bestPoint = hit.point
    }
  }
  const id = addNode(doc, projector.toLatLon(bestPoint))
  const nds = [...way.nds]
  nds.splice(bestIndex, 0, id)
  doc.putWay({ ...way, nds })
  return id
}

export function addWay(doc: OsmDoc, nds: number[], tags: Tags): number {
  const id = doc.newId()
  doc.putWay({ id, nds: dedupeConsecutive(nds), tags })
  return id
}

function endsOf(way: OWay): [number, number] {
  return [way.nds[0]!, way.nds.at(-1)!]
}

function sharesEnd(doc: OsmDoc, wayId: number, nds: number[]): boolean {
  const other = doc.ways.get(wayId)
  if (!other) return false
  const [first, last] = endsOf(other)
  const a = nds[0]!
  const b = nds.at(-1)!
  return first === a || first === b || last === a || last === b
}

/**
 * Разрезает дорогу в узле. Исходный id остаётся у длинной части.
 * Возвращает id новой части или null, если резать нечего.
 */
export function splitWay(doc: OsmDoc, wayId: number, nodeId: number): number | null {
  const way = doc.way(wayId)
  if (way.nds[0] === way.nds.at(-1)) return splitClosedWay(doc, way, nodeId)
  const index = way.nds.indexOf(nodeId, 1)
  if (index <= 0 || index >= way.nds.length - 1) return null
  return splitOpenWay(doc, way, index)
}

function splitOpenWay(doc: OsmDoc, way: OWay, index: number): number {
  const wayId = way.id
  const first = way.nds.slice(0, index + 1)
  const second = way.nds.slice(index)
  const keepFirst = first.length >= second.length
  const kept = keepFirst ? first : second
  const created = keepFirst ? second : first

  const newId = doc.newId()
  doc.putWay({ ...way, nds: kept })
  doc.putWay({ id: newId, nds: created, tags: way.tags ? { ...way.tags } : undefined })

  for (const relation of [...doc.relations.values()]) {
    if (!relation.members.some(([type, ref]) => type === 'way' && ref === wayId)) continue
    doc.putRelation(rewriteAfterSplit(doc, relation, wayId, newId, first, second, keepFirst, kept, created))
  }
  return newId
}

/** Кольцо нельзя разрезать в одной точке: сначала делаем её началом, затем режем пополам. */
function splitClosedWay(doc: OsmDoc, way: OWay, nodeId: number): number | null {
  const ring = way.nds.slice(0, -1)
  const start = ring.indexOf(nodeId)
  // В кольце из двух точек резать нечего: обе части были бы одним отрезком
  if (start < 0 || ring.length < 3) return null
  const rotated = { ...way, nds: [...ring.slice(start), ...ring.slice(0, start), nodeId] }
  doc.putWay(rotated)
  return splitOpenWay(doc, rotated, Math.floor(rotated.nds.length / 2))
}

function rewriteAfterSplit(
  doc: OsmDoc,
  relation: ORelation,
  wayId: number,
  newId: number,
  first: number[],
  second: number[],
  keepFirst: boolean,
  kept: number[],
  created: number[],
): ORelation {
  const members: Member[] = []
  const restriction = isRestriction(relation)
  const via = relation.members.find(([type, , role]) => type === 'node' && role === 'via')?.[1]

  relation.members.forEach((member, index) => {
    const [type, ref, role] = member
    if (type !== 'way' || ref !== wayId) {
      members.push(member)
      return
    }
    if (restriction) {
      // Участник запрета должен остаться той частью, которая касается узла via
      const useNew = via !== undefined && created.includes(via) && !kept.includes(via)
      members.push(['way', useNew ? newId : wayId, role])
      return
    }
    const previous = relation.members[index - 1]
    const next = relation.members[index + 1]
    let firstGoesFirst = true
    if (previous?.[0] === 'way' && sharesEnd(doc, previous[1], second) && !sharesEnd(doc, previous[1], first)) {
      firstGoesFirst = false
    } else if (next?.[0] === 'way' && sharesEnd(doc, next[1], first) && !sharesEnd(doc, next[1], second)) {
      firstGoesFirst = false
    }
    const firstId = keepFirst ? wayId : newId
    const secondId = keepFirst ? newId : wayId
    if (firstGoesFirst) members.push(['way', firstId, role], ['way', secondId, role])
    else members.push(['way', secondId, role], ['way', firstId, role])
  })
  return { ...relation, members }
}

function nodesUsedByRelations(doc: OsmDoc): Set<number> {
  const used = new Set<number>()
  for (const relation of doc.relations.values()) {
    for (const [type, ref] of relation.members) if (type === 'node') used.add(ref)
  }
  return used
}

/** Убирает объект из отношений. Запрет поворота без участника теряет смысл и удаляется целиком. */
function detachFromRelations(doc: OsmDoc, type: 'node' | 'way', id: number): void {
  for (const relation of [...doc.relations.values()]) {
    if (!relation.members.some(([t, ref]) => t === type && ref === id)) continue
    if (isRestriction(relation)) {
      doc.removeRelation(relation.id)
      continue
    }
    const members = relation.members.filter(([t, ref]) => !(t === type && ref === id))
    if (members.length === 0) doc.removeRelation(relation.id)
    else doc.putRelation({ ...relation, members })
  }
}

export function deleteWay(doc: OsmDoc, id: number): void {
  const way = doc.ways.get(id)
  if (!way) return
  detachFromRelations(doc, 'way', id)
  doc.removeWay(id)
  const inRelations = nodesUsedByRelations(doc)
  for (const nd of new Set(way.nds)) {
    if (doc.waysOfNode(nd).length > 0 || inRelations.has(nd)) continue
    const node = doc.nodes.get(nd)
    if (!node) continue
    const tags = node.tags ?? {}
    // Узлы со своим смыслом, например остановки и объекты, остаются на карте
    const onlyRoadTags = Object.keys(tags).every((key) => key === 'highway' || key.startsWith('crossing'))
    if (onlyRoadTags) doc.removeNode(nd)
  }
}

export function deleteNode(doc: OsmDoc, id: number): void {
  for (const wayId of doc.waysOfNode(id)) {
    const way = doc.way(wayId)
    const nds = dedupeConsecutive(way.nds.filter((nd) => nd !== id))
    if (nds.length < 2) deleteWay(doc, wayId)
    else doc.putWay({ ...way, nds })
  }
  detachFromRelations(doc, 'node', id)
  doc.removeNode(id)
}

/** Склеивает два узла в один: так появляется перекрёсток. */
export function mergeNodes(doc: OsmDoc, keepId: number, removeId: number): void {
  if (keepId === removeId) return
  const keep = doc.node(keepId)
  const remove = doc.node(removeId)
  for (const wayId of doc.waysOfNode(removeId)) {
    const way = doc.way(wayId)
    const nds = dedupeConsecutive(way.nds.map((nd) => (nd === removeId ? keepId : nd)))
    if (nds.length < 2) deleteWay(doc, wayId)
    else doc.putWay({ ...way, nds })
  }
  for (const relation of [...doc.relations.values()]) {
    if (!relation.members.some(([t, ref]) => t === 'node' && ref === removeId)) continue
    doc.putRelation({
      ...relation,
      members: relation.members.map(([t, ref, role]) =>
        t === 'node' && ref === removeId ? (['node', keepId, role] as Member) : ([t, ref, role] as Member),
      ),
    })
  }
  const tags = { ...remove.tags, ...keep.tags }
  setNodeTags(doc, keepId, tags)
  doc.removeNode(removeId)
}

/**
 * Расклеивает перекрёсток: каждая дорога кроме первой получает свой узел со сдвигом,
 * чтобы разрыв был виден. Запреты поворота через этот узел удаляются.
 */
export function unglueNode(doc: OsmDoc, projector: Projector, nodeId: number): number[] {
  const wayIds = doc.waysOfNode(nodeId)
  if (wayIds.length < 2) return []
  for (const restriction of restrictionsAt(doc, nodeId)) doc.removeRelation(restriction.relationId)

  const node = doc.node(nodeId)
  const origin = projector.toXY(node)
  const created: number[] = []
  wayIds.slice(1).forEach((wayId, index) => {
    const way = doc.way(wayId)
    const position = way.nds.indexOf(nodeId)
    const neighborId = way.nds[position === 0 ? 1 : position - 1]!
    const neighbor = projector.toXY(doc.node(neighborId))
    const dx = neighbor.x - origin.x
    const dy = neighbor.y - origin.y
    const len = Math.hypot(dx, dy) || 1
    const shift = Math.min(3 + index, len * 0.4)
    const newId = addNode(
      doc,
      projector.toLatLon({ x: origin.x + (dx / len) * shift, y: origin.y + (dy / len) * shift }),
    )
    doc.putWay({ ...way, nds: way.nds.map((nd) => (nd === nodeId ? newId : nd)) })
    created.push(newId)
  })
  return created
}

const SWAPPABLE = /(:|^)(forward|backward|left|right)(:|$)/

function swapDirectionalKey(key: string, swapForwardBackward: boolean): string {
  return key.replace(SWAPPABLE, (match, before: string, word: string, after: string) => {
    if (word === 'forward' || word === 'backward') {
      if (!swapForwardBackward) return match
      return `${before}${word === 'forward' ? 'backward' : 'forward'}${after}`
    }
    return `${before}${word === 'left' ? 'right' : 'left'}${after}`
  })
}

/**
 * Разворачивает порядок узлов. У односторонней дороги это меняет направление движения.
 * У двусторонней движение остаётся прежним: forward и backward меняются местами вместе с порядком.
 */
export function reverseWay(doc: OsmDoc, id: number): void {
  const way = doc.way(id)
  const tags = way.tags ?? {}
  const oneway = isOneway(tags)
  const next: Tags = {}
  for (const [key, value] of Object.entries(tags)) {
    next[swapDirectionalKey(key, !oneway)] = value
  }
  if (next.sidewalk === 'left') next.sidewalk = 'right'
  else if (next.sidewalk === 'right') next.sidewalk = 'left'
  doc.putWay({ ...way, nds: [...way.nds].reverse(), tags: next })
}

/** Объединяет две дороги с общим концом. Теги берутся у первой. */
export function joinWays(doc: OsmDoc, aId: number, bId: number): boolean {
  const a = doc.way(aId)
  const b = doc.way(bId)
  const [a0, a1] = endsOf(a)
  const [b0, b1] = endsOf(b)
  let nds: number[] | null = null
  let shared: number | null = null
  if (a1 === b0) {
    nds = [...a.nds, ...b.nds.slice(1)]
    shared = a1
  } else if (a0 === b1) {
    nds = [...b.nds, ...a.nds.slice(1)]
    shared = a0
  } else if (!isOneway(b.tags ?? {}) && a1 === b1) {
    nds = [...a.nds, ...[...b.nds].reverse().slice(1)]
    shared = a1
  } else if (!isOneway(b.tags ?? {}) && a0 === b0) {
    nds = [...[...b.nds].reverse(), ...a.nds.slice(1)]
    shared = a0
  }
  if (!nds || shared === null) return false

  for (const restriction of restrictionsAt(doc, shared)) {
    if (
      [aId, bId].includes(restriction.from) ||
      [aId, bId].includes(restriction.to)
    ) {
      doc.removeRelation(restriction.relationId)
    }
  }
  for (const relation of [...doc.relations.values()]) {
    if (!relation.members.some(([t, ref]) => t === 'way' && ref === bId)) continue
    const hasA = relation.members.some(([t, ref]) => t === 'way' && ref === aId)
    const members: Member[] = hasA
      ? relation.members.filter(([t, ref]) => !(t === 'way' && ref === bId))
      : relation.members.map(([t, ref, role]) =>
          t === 'way' && ref === bId ? (['way', aId, role] as Member) : ([t, ref, role] as Member),
        )
    doc.putRelation({ ...relation, members })
  }
  doc.putWay({ ...a, nds })
  doc.removeWay(bId)
  return true
}

/** Дорога, идущая через оба соседних узла подхода. */
function wayBetween(doc: OsmDoc, via: number, neighbor: number): number | null {
  for (const wayId of doc.waysOfNode(via)) {
    const nds = doc.way(wayId).nds
    for (let i = 1; i < nds.length; i++) {
      if ((nds[i] === via && nds[i - 1] === neighbor) || (nds[i] === neighbor && nds[i - 1] === via)) {
        return wayId
      }
    }
  }
  return null
}

/** Участник запрета по правилам OSM должен начинаться или заканчиваться в узле via. */
export function ensureEndsAtVia(doc: OsmDoc, via: number, neighbor: number): number {
  const wayId = wayBetween(doc, via, neighbor)
  if (wayId === null) throw new Error('Подход к перекрёстку не найден')
  splitWay(doc, wayId, via)
  const piece = wayBetween(doc, via, neighbor)
  if (piece === null) throw new Error('Подход к перекрёстку не найден')
  return piece
}

function addRestriction(doc: OsmDoc, via: number, fromWay: number, toWay: number, value: string): void {
  doc.putRelation({
    id: doc.newId(),
    members: [
      ['way', fromWay, 'from'],
      ['node', via, 'via'],
      ['way', toWay, 'to'],
    ],
    tags: { type: 'restriction', restriction: value },
  })
}

/**
 * Разрешает или запрещает манёвр на перекрёстке. Подходы задаются соседними узлами,
 * потому что при разрезании дорог их id меняются, а соседние узлы — нет.
 */
export function setMovementAllowed(
  doc: OsmDoc,
  projector: Projector,
  via: number,
  fromNeighbor: number,
  toNeighbor: number,
  allowed: boolean,
): void {
  const fromWay = ensureEndsAtVia(doc, via, fromNeighbor)
  const toWay = ensureEndsAtVia(doc, via, toNeighbor)

  // Правило only_* запрещает всё остальное разом. Менять такой манёвр по одному нельзя,
  // поэтому сначала раскладываем его на отдельные запреты
  const onlyRules = restrictionsAt(doc, via).filter((r) => r.kind === 'only' && r.from === fromWay)
  if (onlyRules.length > 0) {
    const permitted = new Set(onlyRules.map((r) => r.to))
    for (const rule of onlyRules) doc.removeRelation(rule.relationId)
    const network = buildNetwork(doc, projector)
    const arms = network.arms.get(via) ?? []
    const inArm = arms.find((arm) => arm.neighbor === fromNeighbor)
    if (inArm) {
      for (const outArm of arms) {
        if (outArm.lanesOut === 0 || outArm.neighbor === fromNeighbor) continue
        if (permitted.has(outArm.link.wayId)) continue
        const target = ensureEndsAtVia(doc, via, outArm.neighbor)
        addRestriction(doc, via, fromWay, target, restrictionValue(turnKind(inArm, outArm, arms)))
      }
    }
  }

  const network = buildNetwork(doc, projector)
  const arms = network.arms.get(via) ?? []
  const inArm = arms.find((arm) => arm.neighbor === fromNeighbor)
  const outArm = arms.find((arm) => arm.neighbor === toNeighbor)
  if (!inArm || !outArm) throw new Error('Подход к перекрёстку не найден')

  const rules = restrictionsAt(doc, via)
  if (allowed) {
    for (const rule of rules) {
      if (rule.kind === 'no' && rule.from === fromWay && rule.to === toWay) {
        doc.removeRelation(rule.relationId)
      }
    }
  } else if (isMovementAllowed(inArm, outArm, rules)) {
    addRestriction(doc, via, fromWay, toWay, restrictionValue(turnKind(inArm, outArm, arms)))
  }
}

export function toggleNodeHighway(doc: OsmDoc, id: number, value: string): boolean {
  const tags: Tags = { ...doc.node(id).tags }
  const enabled = tags.highway !== value
  if (enabled) {
    tags.highway = value
  } else {
    delete tags.highway
  }
  if (value === 'crossing') {
    if (enabled) tags.crossing = tags.crossing ?? 'uncontrolled'
    else delete tags.crossing
  }
  setNodeTags(doc, id, tags)
  return enabled
}

/** Отмечает дорогу как мост или тоннель и ставит подходящий уровень. */
export function toggleStructure(doc: OsmDoc, id: number, kind: 'bridge' | 'tunnel'): boolean {
  const way = doc.way(id)
  const tags: Tags = { ...way.tags }
  const other = kind === 'bridge' ? 'tunnel' : 'bridge'
  const enabled = !tags[kind] || tags[kind] === 'no'
  if (enabled) {
    tags[kind] = 'yes'
    delete tags[other]
    tags.layer = kind === 'bridge' ? '1' : '-1'
  } else {
    delete tags[kind]
    delete tags.layer
  }
  setWayTags(doc, id, tags)
  return enabled
}
