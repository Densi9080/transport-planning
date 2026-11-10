import type { OsmDoc } from './doc'
import { isDrivable } from './lanes'
import type { ONode, OWay, Tags } from './types'

/**
 * Типы объектов сети и их соответствие данным OSM.
 *
 * Пункт остановки: место, где встаёт транспорт. Зона остановки: платформа.
 * Остановка: отношение stop_area, объединяющее их. Объектам, у которых в OSM нет
 * своего места, отведены отдельные узлы вне дорог с тегами tp:*: netconvert и MATSim
 * такие узлы не читают, поэтому сеть от них не меняется.
 */
export type NetObject =
  | 'nodes'
  | 'links'
  | 'turns'
  | 'stopPoints'
  | 'stopAreas'
  | 'stops'
  | 'routes'
  | 'desiredSpeed'
  | 'reducedSpeed'
  | 'stopSigns'
  | 'crossings'
  | 'priorityRules'
  | 'signals'
  | 'detectors'
  | 'inflows'

export type CustomObject = 'desiredSpeed' | 'reducedSpeed' | 'priorityRules' | 'detectors' | 'inflows'

export const TP_TYPE = 'tp:type'
export const TP_WAY = 'tp:way'

export const CUSTOM_TYPES: Record<CustomObject, { value: string; defaults: Tags; title: string; letter: string }> = {
  desiredSpeed: { value: 'desired_speed', defaults: { 'tp:speed': '40' }, title: 'Решение о желаемой скорости', letter: 'V' },
  reducedSpeed: { value: 'reduced_speed', defaults: { 'tp:speed': '30', 'tp:length': '30' }, title: 'Зона снижения скорости', letter: 'З' },
  priorityRules: { value: 'priority_rule', defaults: { 'tp:gap': '3', 'tp:headway': '5' }, title: 'Правило приоритета', letter: 'П' },
  detectors: { value: 'detector', defaults: { 'tp:length': '1.5' }, title: 'Детектор', letter: 'Д' },
  inflows: { value: 'inflow', defaults: { 'tp:volume': '300' }, title: 'Входящий поток', letter: 'Q' },
}

const CUSTOM_BY_VALUE = new Map(
  (Object.entries(CUSTOM_TYPES) as [CustomObject, (typeof CUSTOM_TYPES)[CustomObject]][]).map(([id, meta]) => [meta.value, id]),
)

export function customObjectOf(tags: Tags | undefined): CustomObject | null {
  return CUSTOM_BY_VALUE.get(tags?.[TP_TYPE] ?? '') ?? null
}

export type FilterOp = 'eq' | 'ne' | 'has' | 'gt' | 'lt'

export interface ObjectFilter {
  enabled: boolean
  key: string
  op: FilterOp
  value: string
}

/** Фильтр типа объектов, как значок фильтра в окне сети Visum. Неполный фильтр ничего не отсекает. */
export function passesFilter(filter: ObjectFilter | undefined, tags: Tags | undefined): boolean {
  if (!filter?.enabled || !filter.key.trim()) return true
  const actual = tags?.[filter.key.trim()]
  if (filter.op === 'has') return actual !== undefined
  if (actual === undefined) return filter.op === 'ne'
  if (filter.op === 'eq') return actual === filter.value.trim()
  if (filter.op === 'ne') return actual !== filter.value.trim()
  const left = Number.parseFloat(actual)
  const right = Number.parseFloat(filter.value)
  if (Number.isNaN(left) || Number.isNaN(right)) return false
  return filter.op === 'gt' ? left > right : left < right
}

export function isCustomObject(type: NetObject): type is CustomObject {
  return type in CUSTOM_TYPES
}

export function customObjectTags(type: CustomObject, wayId: number): Tags {
  const meta = CUSTOM_TYPES[type]
  return { [TP_TYPE]: meta.value, [TP_WAY]: String(wayId), ...meta.defaults }
}

/**
 * Пункт остановки — место на дороге. Знак highway=bus_stop с public_transport=platform стоит
 * у обочины: по схеме PTv2 это платформа (зона), а не пункт, иначе одна остановка считалась бы дважды.
 */
function isStopPointTags(tags: Tags | undefined): boolean {
  if (tags?.public_transport === 'platform') return false
  return tags?.public_transport === 'stop_position' || tags?.highway === 'bus_stop' || tags?.railway === 'tram_stop' || tags?.railway === 'stop'
}

/** Относится ли узел к объектам этого типа. */
export function matchesNode(type: NetObject, node: ONode, doc: OsmDoc): boolean {
  const tags = node.tags
  switch (type) {
    case 'nodes':
      return doc.waysOfNode(node.id).length > 0
    case 'turns':
      return doc.waysOfNode(node.id).length >= 2
    case 'stopPoints':
      return isStopPointTags(tags)
    case 'stopAreas':
      return tags?.public_transport === 'platform'
    case 'crossings':
      return tags?.highway === 'crossing'
    case 'stopSigns':
      return tags?.highway === 'stop' || tags?.highway === 'give_way'
    case 'signals':
      return tags?.highway === 'traffic_signals' || tags?.crossing === 'traffic_signals'
    case 'desiredSpeed':
    case 'reducedSpeed':
    case 'priorityRules':
    case 'detectors':
    case 'inflows':
      return customObjectOf(tags) === type
    default:
      return false
  }
}

export function matchesWay(type: NetObject, way: OWay): boolean {
  if (type === 'links') return isDrivable(way.tags)
  if (type === 'stopAreas') return way.tags?.public_transport === 'platform'
  if (type === 'crossings') return way.tags?.footway === 'crossing'
  return false
}

/** Какие элементы графа выбираются щелчком при этом типе объектов. */
export function pickTypeOf(type: NetObject): 'auto' | 'links' | 'nodes' {
  if (type === 'links' || type === 'routes' || isCustomObject(type)) return 'links'
  if (type === 'stopAreas' || type === 'stops' || type === 'crossings') return 'auto'
  return 'nodes'
}
