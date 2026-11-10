import type { OsmDoc } from './doc'
import { dist, type Projector } from './geo'
import { isOneway } from './lanes'
import { isSignalNode } from './nodeKinds'
import { insertNodeOnWay, setNodeTags } from './ops'
import { RANK, signPlace, travelsForward } from './prioritySuggest'
import { type Arm, buildNetwork, type Network, turnKind } from './topology'
import { signApplies } from './traffic'
import type { Tags } from './types'

/**
 * Приоритет на перекрёстке по ПДД (раздел 13) и ГОСТ Р 52289.
 *
 * Главная дорога задаётся на узле перекрёстка тегом tp:main_road — два соседних узла её подходов.
 * Так можно описать и главную, которая поворачивает: это знак 2.1 с табличкой 8.13.
 * Второстепенные подходы получают знак 2.4 «Уступи дорогу» или 2.5 «Движение без остановки запрещено»:
 * узел дороги с highway=give_way или highway=stop и direction, как принято в OSM.
 * SUMO эти теги не читает, они описывают обстановку в самом редакторе.
 */

export const MAIN_ROAD_TAG = 'tp:main_road'
export type PrioritySign = 'give_way' | 'stop'
const SIGN_REACH_M = 40

export const SIGN_TITLES: Record<PrioritySign, string> = {
  give_way: '2.4 «Уступи дорогу»',
  stop: '2.5 «Стоп»',
}

export interface ArmPriority {
  arm: Arm
  role: 'main' | 'minor'
  sign: PrioritySign | null
  signNode: number | null
}

export interface JunctionPriority {
  kind: 'signals' | 'roundabout' | 'main' | 'equal'
  /** Главная задана в редакторе, а не выведена из знаков. */
  explicit: boolean
  arms: ArmPriority[]
  /** Как идёт главная от первого главного подхода ко второму: прямо или с поворотом (табличка 8.13). */
  bend: 'through' | 'left' | 'right' | null
  issues: { severity: 'error' | 'warning' | 'info'; text: string }[]
}

/**
 * Подход относится к сохранённому узлу, если этот узел лежит на его отрезке.
 * Так привязка переживает вставку узлов на подходе (например, узла под знак) и разрезание дороги.
 */
export function armHasNode(arm: Arm, nodeId: number): boolean {
  return arm.node !== nodeId && arm.link.nodes.includes(nodeId)
}

export function readMainRoad(tags: Tags | undefined): [number, number] | null {
  const parts = (tags?.[MAIN_ROAD_TAG] ?? '').split(';').map((item) => Number(item.trim()))
  return parts.length === 2 && parts.every((n) => Number.isFinite(n) && n !== 0) ? [parts[0]!, parts[1]!] : null
}

/** Знак приоритета на подходе: первый в 40 м от перекрёстка, который действует на въезжающих. */
export function signTowards(doc: OsmDoc, arm: Arm): { node: number; sign: PrioritySign } | null {
  const ids = arm.atStart ? arm.link.nodes : [...arm.link.nodes].reverse()
  const points = arm.atStart ? arm.link.points : [...arm.link.points].reverse()
  let walked = 0
  for (let i = 1; i < ids.length; i++) {
    walked += dist(points[i - 1]!, points[i]!)
    if (walked > SIGN_REACH_M) break
    const tags = doc.nodes.get(ids[i]!)?.tags
    if (signApplies(tags, travelsForward(arm))) return { node: ids[i]!, sign: tags!.highway as PrioritySign }
  }
  return null
}

export function junctionPriority(doc: OsmDoc, network: Network, node: number): JunctionPriority | null {
  const arms = network.arms.get(node) ?? []
  if (arms.length < 3) return null
  const tags = doc.nodes.get(node)?.tags
  const signs = new Map(arms.map((arm) => [arm, signTowards(doc, arm)]))
  const wayTags = (arm: Arm) => doc.ways.get(arm.link.wayId)?.tags ?? {}
  const issues: JunctionPriority['issues'] = []
  const describe = (main: Arm[]): ArmPriority[] =>
    arms.map((arm) => ({ arm, role: main.includes(arm) ? 'main' : 'minor', sign: signs.get(arm)?.sign ?? null, signNode: signs.get(arm)?.node ?? null }))

  if (isSignalNode(tags)) {
    if ([...signs.values()].some(Boolean)) issues.push({ severity: 'info', text: 'Знаки приоритета действуют только при выключенном или мигающем жёлтом светофоре (п. 13.3 ПДД)' })
    return { kind: 'signals', explicit: false, arms: describe([]), bend: null, issues }
  }
  const ring = arms.filter((arm) => wayTags(arm).junction === 'roundabout' || wayTags(arm).junction === 'circular')
  if (ring.length > 0 && ring.length < arms.length) {
    for (const arm of arms) if (!ring.includes(arm) && arm.lanesIn > 0 && !signs.get(arm)) issues.push({ severity: 'info', text: `Въезд на кольцо без знака 2.4: по умолчанию действует правило правой руки (п. 13.11.1 ПДД)` })
    return { kind: 'roundabout', explicit: false, arms: describe(ring), bend: null, issues }
  }

  const tagged = readMainRoad(tags)
  let main: Arm[] = []
  let explicit = false
  if (tagged) {
    main = arms.filter((arm) => tagged.some((id) => armHasNode(arm, id)))
    explicit = main.length === 2
    if (!explicit) issues.push({ severity: 'warning', text: 'Главная дорога задана подходами, которых в узле уже нет: задайте её заново' })
  }
  if (!explicit) {
    const unsigned = arms.filter((arm) => arm.lanesIn > 0 && !signs.get(arm))
    const signedCount = arms.filter((arm) => signs.get(arm)).length
    if (signedCount === 0) return { kind: 'equal', explicit: false, arms: describe([]), bend: null, issues }
    main = arms.filter((arm) => !signs.get(arm))
    if (unsigned.length === 0) issues.push({ severity: 'warning', text: 'Знаки 2.4 или 2.5 стоят на всех подходах: главной дороги нет' })
    else if (main.length > 2) issues.push({ severity: 'warning', text: `Без знаков ${main.length} подходов: главная дорога не определена однозначно` })
  }

  for (const arm of main) {
    const sign = signs.get(arm)
    if (sign) issues.push({ severity: 'error', text: `На главной дороге стоит знак ${SIGN_TITLES[sign.sign]}` })
  }
  for (const arm of arms) {
    if (!main.includes(arm) && arm.lanesIn > 0 && !signs.get(arm)) issues.push({ severity: 'warning', text: 'Второстепенный подход без знака 2.4 или 2.5' })
  }
  let bend: JunctionPriority['bend'] = null
  if (main.length === 2) {
    const kind = turnKind(main[0]!, main[1]!, arms)
    bend = kind === 'reverse' ? null : kind
  }
  return { kind: 'main', explicit, arms: describe(main), bend, issues }
}

/** Главная дорога по классу: два подхода старшего класса, если они однозначны. Подсказка для формы. */
export function mainByClass(doc: OsmDoc, arms: Arm[]): [number, number] | null {
  const ranked = arms
    .map((arm) => ({ arm, rank: RANK[(doc.ways.get(arm.link.wayId)?.tags?.highway ?? '').replace(/_link$/, '')] ?? 0 }))
    .sort((a, b) => b.rank - a.rank)
  if (ranked.length < 3 || ranked[1]!.rank === ranked[2]!.rank) return null
  return [ranked[0]!.arm.neighbor, ranked[1]!.arm.neighbor]
}

function clearSign(doc: OsmDoc, nodeId: number): void {
  const tags = { ...(doc.node(nodeId).tags ?? {}) }
  delete tags.highway
  delete tags.direction
  setNodeTags(doc, nodeId, tags)
}

/**
 * Записывает приоритет перекрёстка. main = null делает его равнозначным: тег и знаки на подходах снимаются.
 * Знаки на главных подходах снимаются, на второстепенных ставятся или меняют вид.
 */
export function applyJunctionPriority(
  doc: OsmDoc,
  projector: Projector,
  node: number,
  main: [number, number] | null,
  signs: Record<number, PrioritySign>,
): void {
  const network = buildNetwork(doc, projector)
  const arms = network.arms.get(node) ?? []
  const nodeTags = { ...(doc.node(node).tags ?? {}) }
  if (main) nodeTags[MAIN_ROAD_TAG] = `${main[0]};${main[1]}`
  else delete nodeTags[MAIN_ROAD_TAG]
  setNodeTags(doc, node, nodeTags)

  // Места знаков считаются по исходной сети: вставка узла не должна сбивать соседние подходы
  const plan = arms.map((arm) => ({ arm, existing: signTowards(doc, arm), place: signPlace(doc, projector, arm) }))
  for (const { arm, existing, place } of plan) {
    const isMain = !main || main.some((id) => armHasNode(arm, id))
    if (isMain || arm.lanesIn === 0) {
      if (existing) clearSign(doc, existing.node)
      continue
    }
    const sign = signs[arm.neighbor] ?? 'give_way'
    const target = existing?.node ?? place.node ?? insertNodeOnWay(doc, projector, arm.link.wayId, place.position)
    const tags: Tags = { ...(doc.node(target).tags ?? {}), highway: sign }
    const road = doc.ways.get(arm.link.wayId)?.tags ?? {}
    if (isOneway(road)) delete tags.direction
    else tags.direction = travelsForward(arm) ? 'forward' : 'backward'
    setNodeTags(doc, target, tags)
  }
}
