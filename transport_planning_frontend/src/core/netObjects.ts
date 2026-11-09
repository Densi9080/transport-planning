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

export function isCustomObject(type: NetObject): type is CustomObject {
  return type in CUSTOM_TYPES
}

export function customObjectTags(type: CustomObject, wayId: number): Tags {
  const meta = CUSTOM_TYPES[type]
  return { [TP_TYPE]: meta.value, [TP_WAY]: String(wayId), ...meta.defaults }
}

function isStopPointTags(tags: Tags | undefined): boolean {
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
  return false
}

/** Какие элементы графа выбираются щелчком при этом типе объектов. */
export function pickTypeOf(type: NetObject): 'auto' | 'links' | 'nodes' {
  if (type === 'links' || type === 'routes' || isCustomObject(type)) return 'links'
  if (type === 'stopAreas' || type === 'stops') return 'auto'
  return 'nodes'
}
