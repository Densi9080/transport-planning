import type { OsmDoc } from './doc'
import type { ORelation, Tags } from './types'

/**
 * Атрибуты поворота как в Visum: транспортные системы, пропускная способность, штраф времени.
 * В OSM для них нет тегов, поэтому они лежат в отношении tp:turn. Симуляторы его не читают.
 */
export const TURN_RELATION = 'tp:turn'

export const TURN_TSYS: { id: string; label: string }[] = [
  { id: 'car', label: 'Легковые' },
  { id: 'hgv', label: 'Грузовые' },
  { id: 'bus', label: 'Автобус' },
  { id: 'trolleybus', label: 'Троллейбус' },
  { id: 'tram', label: 'Трамвай' },
  { id: 'bicycle', label: 'Велосипед' },
]

export interface TurnAttrs {
  capacity: string
  penalty: string
  /** Пустой список означает, что поворот открыт для всех систем. */
  tsys: string[]
}

export const EMPTY_TURN_ATTRS: TurnAttrs = { capacity: '', penalty: '', tsys: [] }

export function findTurnRelation(doc: OsmDoc, node: number, from: number, to: number): ORelation | null {
  for (const relation of doc.relations.values()) {
    const tags = relation.tags
    if (tags?.type === TURN_RELATION && tags['tp:via'] === String(node) && tags['tp:from'] === String(from) && tags['tp:to'] === String(to)) return relation
  }
  return null
}

export function readTurnAttrs(doc: OsmDoc, node: number, from: number, to: number): TurnAttrs {
  const tags = findTurnRelation(doc, node, from, to)?.tags
  if (!tags) return { ...EMPTY_TURN_ATTRS, tsys: [] }
  return {
    capacity: tags['tp:capacity'] ?? '',
    penalty: tags['tp:penalty'] ?? '',
    tsys: tags['tp:tsys'] ? tags['tp:tsys'].split(';').filter(Boolean) : [],
  }
}

export function writeTurnAttrs(doc: OsmDoc, node: number, from: number, to: number, attrs: TurnAttrs): void {
  const existing = findTurnRelation(doc, node, from, to)
  const empty = !attrs.capacity.trim() && !attrs.penalty.trim() && attrs.tsys.length === 0
  if (empty) {
    if (existing) doc.removeRelation(existing.id)
    return
  }
  const tags: Tags = { type: TURN_RELATION, 'tp:via': String(node), 'tp:from': String(from), 'tp:to': String(to) }
  if (attrs.capacity.trim()) tags['tp:capacity'] = attrs.capacity.trim()
  if (attrs.penalty.trim()) tags['tp:penalty'] = attrs.penalty.trim()
  if (attrs.tsys.length > 0) tags['tp:tsys'] = attrs.tsys.join(';')
  doc.putRelation({ id: existing?.id ?? doc.newId(), members: [['node', node, 'via']], tags })
}
