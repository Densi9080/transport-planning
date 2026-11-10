import type { OsmDoc } from './doc'
import type { Projector } from './geo'
import { isOneway, withTurns } from './lanes'
import { ensureEndsAtVia, setMovementAllowed } from './ops'
import { computeArmGeometries, type Connector, junctionConnectors } from './scene'
import { SIGNAL_PLAN_TAG, type SignalPlan, serializeSignalPlan } from './signals'
import { type Arm, buildNetwork, connectivityAt, formatConnectivity, type TurnKind, turnKind } from './topology'
import type { Tags } from './types'

/**
 * Соединения полос внутри узла. Их можно задать вручную, в том числе вопреки разметке:
 * например, разрешить поворот налево со второй полосы.
 */

export function nodeConnectors(doc: OsmDoc, projector: Projector, node: number): { arms: Arm[]; connectors: Connector[] } {
  const network = buildNetwork(doc, projector)
  const arms = network.arms.get(node) ?? []
  if (arms.length < 2) return { arms, connectors: [] }
  const geometries = computeArmGeometries(network)
  return { arms, connectors: junctionConnectors(doc, node, arms, geometries) }
}

const TURN_VALUE: Record<TurnKind, string> = {
  left: 'left',
  through: 'through',
  right: 'right',
  reverse: 'reverse',
}

/**
 * Манёвры полос записываются ещё и в turn:lanes: это основной тег, который читают симуляторы,
 * а отношение connectivity уточняет, на какую именно полосу приводит манёвр.
 */
/** Значения turn:lanes подхода по его соединениям полос, слева направо. */
function armTurnValues(arm: Arm, connectors: Connector[]): string[] {
  const turns = Array.from({ length: arm.lanesIn }, () => new Set<TurnKind>())
  for (const connector of connectors) {
    if (connector.from === arm || connector.from.neighbor === arm.neighbor) turns[connector.fromLane]?.add(connector.kind)
  }
  const order: TurnKind[] = ['reverse', 'left', 'through', 'right']
  return turns.map((set) => order.filter((kind) => set.has(kind)).map((kind) => TURN_VALUE[kind]).join(';'))
}

function writeArmTurns(doc: OsmDoc, arm: Arm, values: string[]): void {
  const way = doc.ways.get(arm.link.wayId)
  if (!way) return
  const direction = arm.atStart ? 'backward' : 'forward'
  const tags = way.tags ?? {}
  doc.putWay({ ...way, tags: withTurns(tags, isOneway(tags) && !arm.atStart ? 'forward' : direction, values) })
}

function syncTurnLanes(doc: OsmDoc, projector: Projector, node: number, fromNeighbor: number): void {
  const { arms, connectors } = nodeConnectors(doc, projector, node)
  const arm = arms.find((item) => item.neighbor === fromNeighbor)
  if (!arm) return
  writeArmTurns(doc, arm, armTurnValues(arm, connectors))
}

export interface RuleTurnsReport {
  /** Подходов, которым дописан turn:lanes. */
  written: number
  /** Подходов без разметки, где дорога проходит узел насквозь: turn:lanes относится к концу дороги, писать нельзя. */
  throughWay: number
}

/**
 * Дописывает turn:lanes по правилам полос редактора (ПДД п. 8.5–8.6) туда, где разметки нет.
 * Нужно для экспорта: SUMO и другие программы не знают правил редактора и раскладывают полосы по-своему.
 * Пишется только на подходы с двумя и более полосами, у которых дорога заканчивается в узле.
 */
export function applyRuleTurnLanes(doc: OsmDoc, projector: Projector): RuleTurnsReport {
  const network = buildNetwork(doc, projector)
  const geometries = computeArmGeometries(network)
  const plan: { arm: Arm; values: string[] }[] = []
  let throughWay = 0
  for (const [node, arms] of network.arms) {
    if (arms.length < 3) continue
    const connectors = junctionConnectors(doc, node, arms, geometries)
    for (const arm of arms) {
      if (arm.lanesIn < 2) continue
      const profile = arm.link.profile
      const tagged = arm.atStart ? profile.turnsBackward : profile.turnsForward
      if (tagged && tagged.some((turn) => turn && turn !== 'none')) continue
      const way = doc.ways.get(arm.link.wayId)
      if (!way) continue
      const endsHere = arm.atStart ? way.nds[0] === node : way.nds.at(-1) === node
      // Тег дороги читается на каждом перекрёстке вдоль неё, поэтому дорога не должна проходить другие узлы насквозь
      const passesJunction = way.nds.slice(1, -1).some((id) => (network.arms.get(id)?.length ?? 0) >= 3)
      if (!endsHere || passesJunction) {
        throughWay++
        continue
      }
      const values = armTurnValues(arm, connectors)
      if (values.some((value) => value)) plan.push({ arm, values })
    }
  }
  // Сначала считаем всё по исходной сети, потом пишем: запись не должна влиять на соседние подходы
  for (const item of plan) writeArmTurns(doc, item.arm, item.values)
  return { written: plan.length, throughWay }
}

/** Правки для экспорта с дописанными turn:lanes. Проект в редакторе не меняется: запись откатывается. */
export function changesWithRuleTurns(doc: OsmDoc, projector: Projector): { changes: ReturnType<OsmDoc['changes']>; report: RuleTurnsReport } {
  doc.begin('Полосы по ПДД для экспорта')
  try {
    const report = applyRuleTurnLanes(doc, projector)
    return { changes: doc.changes(), report }
  } finally {
    doc.rollback()
  }
}

export function setLaneConnection(
  doc: OsmDoc,
  projector: Projector,
  node: number,
  fromNeighbor: number,
  fromLane: number,
  toNeighbor: number,
  toLane: number,
  enabled: boolean,
): void {
  const current = nodeConnectors(doc, projector, node).connectors
  const pairs = current
    .filter((c) => c.from.neighbor === fromNeighbor && c.to.neighbor === toNeighbor)
    .map((c): [number, number] => [c.fromLane, c.toLane])
    .filter(([a, b]) => !(a === fromLane && b === toLane))
  if (enabled) pairs.push([fromLane, toLane])

  const fromWay = ensureEndsAtVia(doc, node, fromNeighbor)
  const toWay = ensureEndsAtVia(doc, node, toNeighbor)
  for (const rule of connectivityAt(doc, node)) {
    if (rule.from === fromWay && rule.to === toWay) doc.removeRelation(rule.relationId)
  }

  if (pairs.length === 0) {
    // Без единого соединения манёвра больше нет: в OSM это записывается запретом поворота
    setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, false)
  } else {
    setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, true)
    doc.putRelation({
      id: doc.newId(),
      members: [
        ['way', fromWay, 'from'],
        ['node', node, 'via'],
        ['way', toWay, 'to'],
      ],
      tags: { type: 'connectivity', connectivity: formatConnectivity(pairs) },
    })
  }
  syncTurnLanes(doc, projector, node, fromNeighbor)
}

/**
 * Включает или выключает манёвр целиком так же, как редактор узла: через соединения полос.
 * Выключение снимает все его соединения (остаётся запрет поворота), включение снимает запрет,
 * а если разметка полос всё равно не даёт ни одной полосы — соединяет полосы по ПДД:
 * налево и в разворот с крайней левой, направо с крайней правой, прямо со всех.
 */
export function setMovementLanes(
  doc: OsmDoc,
  projector: Projector,
  node: number,
  fromNeighbor: number,
  toNeighbor: number,
  allowed: boolean,
): void {
  const pairsOf = () =>
    nodeConnectors(doc, projector, node).connectors.filter((c) => c.from.neighbor === fromNeighbor && c.to.neighbor === toNeighbor)
  if (!allowed) {
    const pairs = pairsOf()
    if (pairs.length === 0) setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, false)
    for (const pair of pairs) setLaneConnection(doc, projector, node, fromNeighbor, pair.fromLane, toNeighbor, pair.toLane, false)
    return
  }
  setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, true)
  if (pairsOf().length > 0) return
  const { arms } = nodeConnectors(doc, projector, node)
  const from = arms.find((arm) => arm.neighbor === fromNeighbor)
  const to = arms.find((arm) => arm.neighbor === toNeighbor)
  if (!from || !to || from.lanesIn === 0 || to.lanesOut === 0) return
  const kind = turnKind(from, to, arms)
  const lanes: [number, number][] =
    kind === 'right'
      ? [[from.lanesIn - 1, to.lanesOut - 1]]
      : kind === 'through'
        ? Array.from({ length: Math.min(from.lanesIn, to.lanesOut) }, (_, i): [number, number] => [from.lanesIn - 1 - i, to.lanesOut - 1 - i])
        : [[0, 0]]
  for (const [fromLane, toLane] of lanes) setLaneConnection(doc, projector, node, fromNeighbor, fromLane, toNeighbor, toLane, true)
}

/** Возвращает узел к автоматическим соединениям. Запреты поворота остаются. */
export function resetLaneConnections(doc: OsmDoc, node: number): void {
  for (const rule of connectivityAt(doc, node)) doc.removeRelation(rule.relationId)
}

export function setSignalPlan(doc: OsmDoc, node: number, plan: SignalPlan | null): void {
  const current = doc.node(node)
  const tags: Tags = { ...current.tags }
  if (plan) tags[SIGNAL_PLAN_TAG] = serializeSignalPlan(plan)
  else delete tags[SIGNAL_PLAN_TAG]
  doc.putNode({ ...current, tags })
}
