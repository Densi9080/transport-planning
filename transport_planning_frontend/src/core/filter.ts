import type { OsmDoc } from './doc'
import { isDrivable, parseProfile, totalWidth } from './lanes'
import { ROAD_TYPES } from './presets'
import type { Network } from './topology'
import type { Tags } from './types'

/**
 * Скрытие объектов по атрибутам: правила вида «building существует» или «highway = footway».
 * Меняет только отображение: скрытый объект остаётся в графе, в симуляции и в экспорте.
 */

export type FilterOp = 'exists' | 'missing' | 'eq' | 'ne' | 'contains' | 'gt' | 'ge' | 'lt' | 'le'
export type FilterMode = 'hide' | 'only'
export type FilterLogic = 'any' | 'all'

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
  { id: 'ge', label: '≥', needsValue: true },
  { id: 'lt', label: '<', needsValue: true },
  { id: 'le', label: '≤', needsValue: true },
]

export type FieldKind = 'enum' | 'number' | 'text' | 'flag'

export interface FilterField {
  key: string
  label: string
  kind: FieldKind
}

/** Атрибуты на языке транспортника. Ключи с @ вычисляются: в OSM число полос часто не записано. */
export const FILTER_FIELDS: FilterField[] = [
  { key: 'highway', label: 'Тип дороги', kind: 'enum' },
  { key: 'name', label: 'Название', kind: 'text' },
  { key: '@lanes', label: 'Число полос', kind: 'number' },
  { key: '@width', label: 'Ширина проезжей части, м', kind: 'number' },
  { key: 'maxspeed', label: 'Разрешённая скорость, км/ч', kind: 'number' },
  { key: 'oneway', label: 'Одностороннее движение', kind: 'flag' },
  { key: 'bridge', label: 'Мост', kind: 'flag' },
  { key: 'tunnel', label: 'Тоннель', kind: 'flag' },
  { key: 'surface', label: 'Покрытие', kind: 'enum' },
  { key: 'lit', label: 'Освещение', kind: 'enum' },
  { key: 'building', label: 'Здание', kind: 'flag' },
  { key: '*', label: 'Другой тег OSM', kind: 'text' },
]

export const OPS_BY_KIND: Record<FieldKind, FilterOp[]> = {
  enum: ['eq', 'ne', 'exists', 'missing'],
  number: ['ge', 'le', 'eq', 'ne', 'gt', 'lt'],
  text: ['contains', 'eq', 'ne', 'exists', 'missing'],
  flag: ['exists', 'missing'],
}

export function fieldOf(key: string): FilterField {
  return FILTER_FIELDS.find((field) => field.key === key) ?? FILTER_FIELDS.at(-1)!
}

export function opNeedsValue(op: FilterOp): boolean {
  return FILTER_OPS.find((item) => item.id === op)?.needsValue ?? false
}

export function opLabel(op: FilterOp, kind: FieldKind): string {
  if (kind === 'flag') return op === 'exists' ? 'есть' : 'нет'
  return FILTER_OPS.find((item) => item.id === op)?.label ?? op
}

export function valueLabel(key: string, value: string): string {
  return key === 'highway' ? (ROAD_TYPES.find((type) => type.value === value)?.label ?? value) : value
}

function fieldValue(tags: Tags | undefined, key: string): string | undefined {
  if (!key.startsWith('@')) return tags?.[key]
  if (!tags || !isDrivable(tags)) return undefined
  const profile = parseProfile(tags)
  if (key === '@lanes') return String(profile.forward + profile.backward)
  return key === '@width' ? totalWidth(profile).toFixed(2) : undefined
}

export function matchesRule(tags: Tags | undefined, rule: FilterRule): boolean {
  const value = fieldValue(tags, rule.key)
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
    case 'ge':
    case 'lt':
    case 'le': {
      const number = Number.parseFloat(value ?? '')
      const limit = Number.parseFloat(rule.value)
      if (!Number.isFinite(number) || !Number.isFinite(limit)) return false
      if (rule.op === 'gt') return number > limit
      if (rule.op === 'ge') return number >= limit
      return rule.op === 'lt' ? number < limit : number <= limit
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

function matcher(rules: FilterRule[], logic: FilterLogic): ((tags: Tags | undefined) => boolean) | null {
  const active = rules.filter(isComplete)
  if (active.length === 0) return null
  return logic === 'all'
    ? (tags) => active.every((rule) => matchesRule(tags, rule))
    : (tags) => active.some((rule) => matchesRule(tags, rule))
}

export function computeHidden(
  doc: OsmDoc,
  rules: FilterRule[],
  mode: FilterMode = 'hide',
  logic: FilterLogic = 'any',
): HiddenSets {
  const matches = matcher(rules, logic)
  if (!matches) return NOTHING_HIDDEN
  const ways = new Set<number>()
  const nodes = new Set<number>()
  for (const way of doc.ways.values()) if (matches(way.tags) === (mode === 'hide')) ways.add(way.id)
  // В режиме «только найденное» узлы не прячем: светофор на оставленной дороге должен быть виден.
  // Узлы без атрибутов — это просто точки формы дорог, правилам про атрибуты они не подчиняются
  if (mode === 'hide') {
    for (const node of doc.nodes.values()) if (node.tags && matches(node.tags)) nodes.add(node.id)
  }
  return { ways, nodes }
}

/** Дороги, подходящие под условия: их можно выделить разом. */
export function matchingWays(doc: OsmDoc, rules: FilterRule[], logic: FilterLogic): number[] {
  const matches = matcher(rules, logic)
  if (!matches) return []
  return [...doc.ways.values()].filter((way) => matches(way.tags)).map((way) => way.id)
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

export function countMatches(doc: OsmDoc, filter: Pick<FilterRule, 'key' | 'op' | 'value'>): number {
  const rule: FilterRule = { id: 0, enabled: true, ...filter }
  let count = 0
  for (const way of doc.ways.values()) if (matchesRule(way.tags, rule)) count++
  for (const node of doc.nodes.values()) if (node.tags && matchesRule(node.tags, rule)) count++
  return count
}
