import type { OsmDoc } from './doc'
import type { Network } from './topology'
import type { Tags } from './types'

/**
 * Скрытие объектов по атрибутам: правила вида «building существует» или «highway = footway».
 * Меняет только отображение: скрытый объект остаётся в графе, в симуляции и в экспорте.
 */

export type FilterOp = 'exists' | 'missing' | 'eq' | 'ne' | 'contains' | 'gt' | 'lt'

export interface FilterRule {
  id: number
  enabled: boolean
  key: string
  op: FilterOp
  value: string
}

export const FILTER_OPS: { id: FilterOp; label: string; needsValue: boolean }[] = [
  { id: 'exists', label: 'задан', needsValue: false },
  { id: 'missing', label: 'не задан', needsValue: false },
  { id: 'eq', label: '=', needsValue: true },
  { id: 'ne', label: '≠', needsValue: true },
  { id: 'contains', label: 'содержит', needsValue: true },
  { id: 'gt', label: '>', needsValue: true },
  { id: 'lt', label: '<', needsValue: true },
]

export function matchesRule(tags: Tags | undefined, rule: FilterRule): boolean {
  const value = tags?.[rule.key]
  switch (rule.op) {
    case 'exists':
      return value !== undefined
    case 'missing':
      return value === undefined
    case 'eq':
      return value === rule.value
    case 'ne':
      return value !== undefined && value !== rule.value
    case 'contains':
      return value !== undefined && value.toLowerCase().includes(rule.value.toLowerCase())
    case 'gt':
    case 'lt': {
      const number = Number.parseFloat(value ?? '')
      const limit = Number.parseFloat(rule.value)
      if (!Number.isFinite(number) || !Number.isFinite(limit)) return false
      return rule.op === 'gt' ? number > limit : number < limit
    }
  }
}

/** Правило работает, только если заполнено целиком: недописанное не должно ничего прятать. */
function isComplete(rule: FilterRule): boolean {
  if (!rule.enabled || !rule.key.trim()) return false
  const op = FILTER_OPS.find((item) => item.id === rule.op)
  return !op?.needsValue || rule.value.trim() !== ''
}

export interface HiddenSets {
  ways: Set<number>
  nodes: Set<number>
}

export const NOTHING_HIDDEN: HiddenSets = { ways: new Set(), nodes: new Set() }

export function computeHidden(doc: OsmDoc, rules: FilterRule[]): HiddenSets {
  const active = rules.filter(isComplete)
  if (active.length === 0) return NOTHING_HIDDEN
  const matches = (tags: Tags | undefined) => active.some((rule) => matchesRule(tags, rule))
  const ways = new Set<number>()
  const nodes = new Set<number>()
  for (const way of doc.ways.values()) if (matches(way.tags)) ways.add(way.id)
  // Узлы без атрибутов — это просто точки формы дорог, правилам про атрибуты они не подчиняются
  for (const node of doc.nodes.values()) if (node.tags && matches(node.tags)) nodes.add(node.id)
  return { ways, nodes }
}

/** Площадку перекрёстка прячем, только когда скрыты все дороги, которые в ней сходятся. */
export function hiddenJunctions(network: Network, hidden: HiddenSets): Set<number> {
  const result = new Set<number>(hidden.nodes)
  if (hidden.ways.size === 0) return result
  for (const [node, arms] of network.arms) {
    if (arms.every((arm) => hidden.ways.has(arm.link.wayId))) result.add(node)
  }
  return result
}

export interface KeyStat {
  key: string
  ways: number
  nodes: number
  values: { value: string; count: number }[]
}

const MAX_VALUES = 40
/** Служебные и адресные ключи только засоряют список подсказок. */
const NOISY_KEY = /^(source|note|fixme|check_date|addr:|wikidata|wikipedia|name:|ref:|contact:|website|phone|opening_hours)/

/** Что есть в файле: подсказки для правил и быстрые кнопки с числом объектов. */
export function collectKeyStats(doc: OsmDoc): KeyStat[] {
  const stats = new Map<string, { ways: number; nodes: number; values: Map<string, number> }>()
  const add = (tags: Tags | undefined, field: 'ways' | 'nodes') => {
    for (const [key, value] of Object.entries(tags ?? {})) {
      if (NOISY_KEY.test(key)) continue
      let stat = stats.get(key)
      if (!stat) {
        stat = { ways: 0, nodes: 0, values: new Map() }
        stats.set(key, stat)
      }
      stat[field]++
      stat.values.set(value, (stat.values.get(value) ?? 0) + 1)
    }
  }
  for (const way of doc.ways.values()) add(way.tags, 'ways')
  for (const node of doc.nodes.values()) add(node.tags, 'nodes')
  return [...stats.entries()]
    .map(([key, stat]) => ({
      key,
      ways: stat.ways,
      nodes: stat.nodes,
      values: [...stat.values.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_VALUES),
    }))
    .sort((a, b) => b.ways + b.nodes - a.ways - a.nodes)
}

export interface QuickFilter {
  id: string
  label: string
  key: string
  op: FilterOp
  value: string
}

/** Типовые слои карты: то, что чаще всего хочется убрать одним нажатием. */
export const QUICK_FILTERS: QuickFilter[] = [
  { id: 'building', label: 'Здания', key: 'building', op: 'exists', value: '' },
  { id: 'footway', label: 'Тротуары', key: 'highway', op: 'eq', value: 'footway' },
  { id: 'steps', label: 'Лестницы', key: 'highway', op: 'eq', value: 'steps' },
  { id: 'path', label: 'Тропы', key: 'highway', op: 'eq', value: 'path' },
  { id: 'service', label: 'Проезды', key: 'highway', op: 'eq', value: 'service' },
  { id: 'residential', label: 'Жилые улицы', key: 'highway', op: 'eq', value: 'residential' },
  { id: 'landuse', label: 'Территории', key: 'landuse', op: 'exists', value: '' },
  { id: 'railway', label: 'Железная дорога', key: 'railway', op: 'exists', value: '' },
  { id: 'barrier', label: 'Ограждения', key: 'barrier', op: 'exists', value: '' },
  { id: 'amenity', label: 'Объекты инфраструктуры', key: 'amenity', op: 'exists', value: '' },
]

export function countMatches(doc: OsmDoc, filter: Pick<QuickFilter, 'key' | 'op' | 'value'>): number {
  const rule: FilterRule = { id: 0, enabled: true, ...filter }
  let count = 0
  for (const way of doc.ways.values()) if (matchesRule(way.tags, rule)) count++
  for (const node of doc.nodes.values()) if (node.tags && matchesRule(node.tags, rule)) count++
  return count
}
