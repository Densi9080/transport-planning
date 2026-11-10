import type { OsmDoc } from '@/core/doc'
import type { Projector } from '@/core/geo'
import { isOneway, parseProfile, withLanes } from '@/core/lanes'
import { reverseWay, setMovementAllowed, setNodeTags, setWayTags, toggleNodeHighway } from '@/core/ops'
import { setLineTags } from '@/core/transit'
import type { Tags } from '@/core/types'

/**
 * Правки, которые помощник может только предложить. Применяет их человек, и всегда одним шагом отмены.
 * Набор операций закрыт: всё, чего здесь нет, модель просто не сможет запросить.
 */
export type Edit =
  | { op: 'set_way_tags'; way_id: number; set?: Tags; remove?: string[] }
  | { op: 'set_node_tags'; node_id: number; set?: Tags; remove?: string[] }
  | { op: 'set_lanes'; way_id: number; forward: number; backward?: number }
  | { op: 'set_oneway'; way_id: number; oneway: boolean }
  | { op: 'reverse_way'; way_id: number }
  | { op: 'set_signal'; node_id: number; enabled: boolean }
  | { op: 'set_movement'; node_id: number; from_neighbor: number; to_neighbor: number; allowed: boolean }
  | { op: 'set_line_interval'; line_id: number; minutes: number }

const MAX_LANES = 12

function isPositiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= max
}

function validateTags(set: unknown, remove: unknown): string | null {
  if (set !== undefined && (typeof set !== 'object' || set === null || Array.isArray(set))) return 'set должен быть объектом'
  for (const [key, value] of Object.entries((set ?? {}) as object)) {
    if (!key.trim()) return 'пустое имя тега'
    if (typeof value !== 'string') return `значение тега ${key} должно быть строкой`
  }
  if (remove !== undefined && !(Array.isArray(remove) && remove.every((key) => typeof key === 'string'))) {
    return 'remove должен быть списком строк'
  }
  if (!set && !remove) return 'нужно указать set или remove'
  return null
}

/** Возвращает причину отказа или null. Модель получает её в ответе и может исправиться. */
/** Правка без последствий не должна выглядеть в карточке как решение проблемы. */
function noChange(tags: Record<string, string> | undefined, set?: Record<string, string>, remove?: string[]): string | null {
  const current = tags ?? {}
  const sets = Object.entries(set ?? {}).some(([key, value]) => current[key] !== value)
  const removes = (remove ?? []).some((key) => key in current)
  return sets || removes ? null : 'эти значения уже заданы, правка ничего не меняет'
}

export function validateEdit(doc: OsmDoc, edit: Edit): string | null {
  switch (edit?.op) {
    case 'set_way_tags': {
      const way = doc.ways.get(edit.way_id)
      if (!way) return `дороги ${edit.way_id} нет`
      return validateTags(edit.set, edit.remove) ?? noChange(way.tags, edit.set, edit.remove)
    }
    case 'set_node_tags': {
      const node = doc.nodes.get(edit.node_id)
      if (!node) return `узла ${edit.node_id} нет`
      return validateTags(edit.set, edit.remove) ?? noChange(node.tags, edit.set, edit.remove)
    }
    case 'set_lanes': {
      const way = doc.ways.get(edit.way_id)
      if (!way) return `дороги ${edit.way_id} нет`
      if (!isPositiveInt(edit.forward, MAX_LANES)) return `forward должно быть целым от 1 до ${MAX_LANES}`
      if (isOneway(way.tags ?? {})) return null
      if (!isPositiveInt(edit.backward, MAX_LANES)) return 'дорога двусторонняя: укажите и backward'
      return null
    }
    case 'set_oneway':
      if (!doc.ways.has(edit.way_id)) return `дороги ${edit.way_id} нет`
      return typeof edit.oneway === 'boolean' ? null : 'oneway должно быть true или false'
    case 'reverse_way':
      return doc.ways.has(edit.way_id) ? null : `дороги ${edit.way_id} нет`
    case 'set_signal':
      if (!doc.nodes.has(edit.node_id)) return `узла ${edit.node_id} нет`
      return typeof edit.enabled === 'boolean' ? null : 'enabled должно быть true или false'
    case 'set_movement':
      if (!doc.nodes.has(edit.node_id)) return `узла ${edit.node_id} нет`
      if (!doc.nodes.has(edit.from_neighbor) || !doc.nodes.has(edit.to_neighbor)) return 'соседние узлы не найдены'
      return typeof edit.allowed === 'boolean' ? null : 'allowed должно быть true или false'
    case 'set_line_interval':
      if (doc.relations.get(edit.line_id)?.tags?.type !== 'route') return `маршрута ${edit.line_id} нет`
      return typeof edit.minutes === 'number' && edit.minutes > 0 && edit.minutes <= 600 ? null : 'интервал должен быть от 0 до 600 минут'
    default:
      return `неизвестная операция ${String((edit as { op?: unknown })?.op)}`
  }
}

function changedTags(tags: Tags | undefined, set: Tags | undefined, remove: string[] | undefined): Tags {
  const next: Tags = { ...tags, ...set }
  for (const key of remove ?? []) delete next[key]
  return next
}

function setOneway(tags: Tags, oneway: boolean): Tags {
  const profile = parseProfile(tags)
  const total = Math.max(1, profile.forward + profile.backward)
  if (oneway) {
    const next: Tags = { ...tags, oneway: 'yes', lanes: String(total) }
    delete next['lanes:forward']
    delete next['lanes:backward']
    delete next['turn:lanes:backward']
    return next
  }
  const next: Tags = { ...tags }
  delete next.oneway
  const forward = Math.max(1, Math.ceil(total / 2))
  return withLanes(next, forward, Math.max(1, total - forward))
}

/** Вызывается внутри транзакции: снаружи её можно применить или откатить как целое. */
export function applyEdit(doc: OsmDoc, projector: Projector, edit: Edit): void {
  switch (edit.op) {
    case 'set_way_tags':
      setWayTags(doc, edit.way_id, changedTags(doc.way(edit.way_id).tags, edit.set, edit.remove))
      break
    case 'set_node_tags':
      setNodeTags(doc, edit.node_id, changedTags(doc.node(edit.node_id).tags, edit.set, edit.remove))
      break
    case 'set_lanes': {
      const tags = doc.way(edit.way_id).tags ?? {}
      const profile = parseProfile(tags)
      // У односторонней против хода узлов полосы лежат в backward, а модель говорит просто «полос»
      const next = profile.oneway
        ? profile.forward === 0
          ? withLanes(tags, 0, edit.forward)
          : withLanes(tags, edit.forward, 0)
        : withLanes(tags, edit.forward, edit.backward ?? 1)
      setWayTags(doc, edit.way_id, next)
      break
    }
    case 'set_oneway':
      setWayTags(doc, edit.way_id, setOneway(doc.way(edit.way_id).tags ?? {}, edit.oneway))
      break
    case 'reverse_way':
      reverseWay(doc, edit.way_id)
      break
    case 'set_signal':
      if ((doc.node(edit.node_id).tags?.highway === 'traffic_signals') !== edit.enabled) {
        toggleNodeHighway(doc, edit.node_id, 'traffic_signals')
      }
      break
    case 'set_movement':
      setMovementAllowed(doc, projector, edit.node_id, edit.from_neighbor, edit.to_neighbor, edit.allowed)
      break
    case 'set_line_interval': {
      const relation = doc.relations.get(edit.line_id)!
      setLineTags(doc, edit.line_id, { ...relation.tags, interval: String(edit.minutes) })
      break
    }
  }
}

function wayLabel(doc: OsmDoc, id: number): string {
  return doc.ways.get(id)?.tags?.name ?? `дорога ${id}`
}

/** Текст для карточки подтверждения: человек должен понимать, что именно он применяет. */
export function describeEdit(doc: OsmDoc, edit: Edit): string {
  switch (edit.op) {
    case 'set_way_tags':
    case 'set_node_tags': {
      const label = edit.op === 'set_way_tags' ? wayLabel(doc, edit.way_id) : `узел ${edit.node_id}`
      const set = Object.entries(edit.set ?? {}).map(([key, value]) => `${key}=${value}`)
      const remove = (edit.remove ?? []).map((key) => `убрать ${key}`)
      return `${label}: ${[...set, ...remove].join(', ')}`
    }
    case 'set_lanes': {
      const way = doc.way(edit.way_id)
      const profile = parseProfile(way.tags ?? {})
      const before = profile.oneway ? profile.forward + profile.backward : `${profile.forward}+${profile.backward}`
      const after = profile.oneway ? edit.forward : `${edit.forward}+${edit.backward}`
      return `${wayLabel(doc, edit.way_id)}: полос ${before} → ${after}`
    }
    case 'set_oneway':
      return `${wayLabel(doc, edit.way_id)}: ${edit.oneway ? 'сделать односторонней' : 'сделать двусторонней'}`
    case 'reverse_way':
      return `${wayLabel(doc, edit.way_id)}: развернуть направление`
    case 'set_signal':
      return `Узел ${edit.node_id}: ${edit.enabled ? 'поставить светофор' : 'убрать светофор'}`
    case 'set_movement':
      return `Узел ${edit.node_id}: ${edit.allowed ? 'разрешить' : 'запретить'} манёвр ${edit.from_neighbor} → ${edit.to_neighbor}`
    case 'set_line_interval':
      return `Маршрут ${doc.relations.get(edit.line_id)?.tags?.ref ?? edit.line_id}: интервал ${edit.minutes} мин`
  }
}

/** Что подсветить на карте, пока предложение ждёт решения. */
export function editTargets(edit: Edit): { ways: number[]; nodes: number[] } {
  switch (edit.op) {
    case 'set_way_tags':
    case 'set_lanes':
    case 'set_oneway':
    case 'reverse_way':
      return { ways: [edit.way_id], nodes: [] }
    case 'set_node_tags':
    case 'set_signal':
    case 'set_movement':
      return { ways: [], nodes: [edit.node_id] }
    default:
      return { ways: [], nodes: [] }
  }
}
