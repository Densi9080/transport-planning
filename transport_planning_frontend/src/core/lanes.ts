import type { Tags } from './types'

export type Turn = 'left' | 'slight_left' | 'through' | 'slight_right' | 'right' | 'reverse'

export interface LaneProfile {
  /** Полос по ходу порядка узлов дороги. */
  forward: number
  /** Полос против хода порядка узлов дороги. */
  backward: number
  oneway: boolean
  laneWidth: number
  /** Ширина каждой полосы слева направо по ходу её движения. */
  widthsForward: number[]
  widthsBackward: number[]
  /** Манёвры полос слева направо по ходу движения; null, если не заданы. */
  turnsForward: string[] | null
  turnsBackward: string[] | null
  /** Разрешения перестроения по тегу change:lanes: значение на каждую полосу. */
  changeForward: string[] | null
  changeBackward: string[] | null
  /** Число полос не задано в файле и взято по умолчанию для типа дороги. */
  inferred: boolean
}

export const DRIVABLE = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
  'busway',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
])

const DEFAULT_LANES_PER_DIRECTION: Record<string, number> = {
  motorway: 3,
  trunk: 2,
  primary: 2,
}

const DEFAULT_LANE_WIDTH: Record<string, number> = {
  motorway: 3.75,
  trunk: 3.75,
  primary: 3.5,
  secondary: 3.5,
  tertiary: 3.25,
  unclassified: 3,
  residential: 3,
  living_street: 2.75,
  service: 2.75,
}

export function isDrivable(tags: Tags | undefined): boolean {
  if (!tags?.highway || tags.area === 'yes') return false
  return DRIVABLE.has(tags.highway)
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function isOneway(tags: Tags): boolean {
  const value = tags.oneway
  if (value === 'no' || value === 'false' || value === '0') return false
  if (value === 'yes' || value === 'true' || value === '1' || value === '-1' || value === 'reverse') {
    return true
  }
  return (
    tags.junction === 'roundabout' ||
    tags.highway === 'motorway' ||
    tags.highway === 'motorway_link'
  )
}

export function isReversedOneway(tags: Tags): boolean {
  return tags.oneway === '-1' || tags.oneway === 'reverse'
}

export function parseTurnLanes(value: string | undefined): string[] | null {
  return value === undefined ? null : value.split('|').map((lane) => lane.trim())
}

export function parseProfile(tags: Tags): LaneProfile {
  const oneway = isOneway(tags)
  const reversed = isReversedOneway(tags)
  const highway = tags.highway ?? 'road'
  const total = positiveInt(tags.lanes)
  const taggedForward = positiveInt(tags['lanes:forward'])
  const taggedBackward = positiveInt(tags['lanes:backward'])
  const fallback = DEFAULT_LANES_PER_DIRECTION[highway] ?? 1

  let forward: number
  let backward: number
  let inferred = false

  if (oneway) {
    const lanes = total || taggedForward || fallback
    inferred = !total && !taggedForward
    forward = reversed ? 0 : lanes
    backward = reversed ? lanes : 0
  } else if (taggedForward !== null || taggedBackward !== null) {
    forward = taggedForward ?? Math.max(1, (total ?? 0) - (taggedBackward ?? 0))
    backward = taggedBackward ?? Math.max(1, (total ?? 0) - forward)
  } else if (total) {
    forward = Math.ceil(total / 2)
    backward = Math.max(total - forward, 0)
  } else {
    forward = fallback
    backward = fallback
    inferred = true
  }

  forward = Math.max(forward, 0)
  backward = Math.max(backward, 0)
  if (forward + backward === 0) forward = 1

  const widthTag = Number.parseFloat(tags.width ?? '')
  const uniformWidth =
    Number.isFinite(widthTag) && widthTag > 0
      ? clamp(widthTag / (forward + backward), 2.25, 5)
      : (DEFAULT_LANE_WIDTH[highway.replace('_link', '')] ?? 3)
  const widthsOf = (key: string, count: number): number[] =>
    parseLaneWidths(tags[key], count) ?? Array.from({ length: count }, () => uniformWidth)
  const widthsForward = widthsOf(oneway && !reversed ? 'width:lanes' : 'width:lanes:forward', forward)
  const widthsBackward = widthsOf(oneway && reversed ? 'width:lanes' : 'width:lanes:backward', backward)
  const allWidths = [...widthsForward, ...widthsBackward]
  const laneWidth = allWidths.reduce((sum, value) => sum + value, 0) / allWidths.length

  const allDirections = parseTurnLanes(tags['turn:lanes'])
  let turnsForward = parseTurnLanes(tags['turn:lanes:forward'])
  let turnsBackward = parseTurnLanes(tags['turn:lanes:backward'])
  if (oneway && allDirections) {
    if (reversed) turnsBackward = allDirections
    else turnsForward = allDirections
  }
  if (oneway && reversed && !turnsBackward) turnsBackward = turnsForward

  const allChanges = parseTurnLanes(tags['change:lanes'])
  let changeForward = parseTurnLanes(tags['change:lanes:forward'])
  let changeBackward = parseTurnLanes(tags['change:lanes:backward'])
  if (allChanges) {
    if (oneway && reversed) changeBackward = allChanges
    else if (oneway) changeForward = allChanges
    else {
      changeForward ??= allChanges
      changeBackward ??= allChanges
    }
  }

  return {
    forward,
    backward,
    oneway,
    laneWidth,
    widthsForward,
    widthsBackward,
    turnsForward,
    turnsBackward,
    changeForward,
    changeBackward,
    inferred,
  }
}

export const MIN_LANE_WIDTH = 2
export const MAX_LANE_WIDTH = 6

function parseLaneWidths(value: string | undefined, count: number): number[] | null {
  if (value === undefined || count === 0) return null
  const parts = value.split('|').map((part) => Number.parseFloat(part))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0)) return null
  return parts.map((part) => clamp(part, MIN_LANE_WIDTH, MAX_LANE_WIDTH))
}

function formatMeters(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function widthKey(tags: Tags, direction: TravelDirection): string {
  return isOneway(tags) ? 'width:lanes' : `width:lanes:${direction}`
}

/** Общая ширина нужна симуляторам, которые не читают ширину отдельных полос, например Webots. */
function writeTotalWidth(tags: Tags): void {
  tags.width = formatMeters(totalWidth(parseProfile(tags)))
}

/** Задаёт ширину одной полосы и держит общую ширину дороги согласованной с ней. */
export function withLaneWidth(tags: Tags, direction: TravelDirection, lane: number, width: number): Tags {
  const profile = parseProfile(tags)
  const widths = [...(direction === 'forward' ? profile.widthsForward : profile.widthsBackward)]
  if (lane < 0 || lane >= widths.length) return tags
  widths[lane] = clamp(Math.round(width * 20) / 20, MIN_LANE_WIDTH, MAX_LANE_WIDTH)
  const next: Tags = { ...tags, [widthKey(tags, direction)]: widths.map(formatMeters).join('|') }
  // Вторая сторона фиксируется явно: иначе её ширина начала бы считаться от новой общей
  if (!isOneway(tags)) {
    const other: TravelDirection = direction === 'forward' ? 'backward' : 'forward'
    const otherWidths = other === 'forward' ? profile.widthsForward : profile.widthsBackward
    if (otherWidths.length > 0) next[widthKey(tags, other)] = otherWidths.map(formatMeters).join('|')
  }
  writeTotalWidth(next)
  return next
}

/** Убирает индивидуальные ширины: полосы снова считаются одинаковыми. */
export function withoutLaneWidths(tags: Tags): Tags {
  const next: Tags = { ...tags }
  delete next['width:lanes']
  delete next['width:lanes:forward']
  delete next['width:lanes:backward']
  delete next.width
  return next
}

/** Как можно пересекать линию между соседними полосами: от левой к правой и обратно. */
export type DividerMode = 'both' | 'none' | 'to_right' | 'to_left'

function mayCross(rule: string | undefined, toLeft: boolean): boolean {
  if (rule === 'no') return false
  return rule !== (toLeft ? 'not_left' : 'not_right')
}

/** Можно ли перестроиться между соседними полосами. Полосы нумеруются слева по ходу движения. */
export function canChangeLane(rules: string[] | null, from: number, to: number): boolean {
  if (!rules || Math.abs(from - to) !== 1) return true
  return mayCross(rules[from], to < from)
}

export function dividerMode(rules: string[] | null, boundary: number): DividerMode {
  const toRight = canChangeLane(rules, boundary, boundary + 1)
  const toLeft = canChangeLane(rules, boundary + 1, boundary)
  if (toRight && toLeft) return 'both'
  if (toRight) return 'to_right'
  return toLeft ? 'to_left' : 'none'
}

function ruleValue(left: boolean, right: boolean): string {
  if (left && right) return 'yes'
  if (left) return 'not_right'
  return right ? 'not_left' : 'no'
}

/** Записывает тип линии между полосами boundary и boundary + 1 в тег change:lanes. */
export function withDivider(tags: Tags, direction: TravelDirection, boundary: number, mode: DividerMode): Tags {
  const profile = parseProfile(tags)
  const count = direction === 'forward' ? profile.forward : profile.backward
  const rules = direction === 'forward' ? profile.changeForward : profile.changeBackward
  const allowed = Array.from({ length: count }, (_, lane) => ({
    left: canChangeLane(rules, lane, lane - 1),
    right: canChangeLane(rules, lane, lane + 1),
  }))
  const upper = allowed[boundary]
  const lower = allowed[boundary + 1]
  if (!upper || !lower) return tags
  upper.right = mode === 'both' || mode === 'to_right'
  lower.left = mode === 'both' || mode === 'to_left'

  const next: Tags = { ...tags }
  const values = allowed.map((lane) => ruleValue(lane.left, lane.right))
  const key = profile.oneway ? 'change:lanes' : `change:lanes:${direction}`
  if (profile.oneway) delete next['change:lanes:forward']
  if (values.every((value) => value === 'yes')) delete next[key]
  else next[key] = values.join('|')
  return next
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function totalWidth(profile: LaneProfile): number {
  return [...profile.widthsForward, ...profile.widthsBackward].reduce((sum, value) => sum + value, 0)
}

export interface LaneOffsets {
  /** Смещения полос по ходу дороги: слева направо по ходу движения. */
  forward: number[]
  /** Смещения полос против хода: слева направо по ходу их движения. */
  backward: number[]
  /** Линия между встречными потоками. */
  divider: number
  /** Линии между соседними полосами: i-й элемент разделяет полосы i и i + 1. */
  forwardBoundaries: number[]
  backwardBoundaries: number[]
  left: number
  right: number
}

/** Смещения в поперечном сечении: положительные — слева от оси дороги. Правостороннее движение. */
export function laneOffsets(profile: LaneProfile): LaneOffsets {
  const width = totalWidth(profile)
  const backwardWidth = profile.widthsBackward.reduce((sum, value) => sum + value, 0)
  const divider = width / 2 - backwardWidth
  const walk = (widths: number[], sign: number) => {
    const centers: number[] = []
    const boundaries: number[] = []
    let walked = 0
    widths.forEach((value, index) => {
      centers.push(divider + sign * (walked + value / 2))
      walked += value
      if (index < widths.length - 1) boundaries.push(divider + sign * walked)
    })
    return { centers, boundaries }
  }
  const forward = walk(profile.widthsForward, -1)
  const backward = walk(profile.widthsBackward, 1)
  return {
    forward: forward.centers,
    backward: backward.centers,
    divider,
    forwardBoundaries: forward.boundaries,
    backwardBoundaries: backward.boundaries,
    left: width / 2,
    right: -width / 2,
  }
}

/** Записывает число полос. Лишние манёвры обрезаются, недостающие дополняются пустыми. */
export function withLanes(tags: Tags, forward: number, backward: number): Tags {
  const next: Tags = { ...tags }
  const oneway = isOneway(tags)
  delete next['lanes:forward']
  delete next['lanes:backward']
  if (oneway) {
    const lanes = isReversedOneway(tags) ? backward : forward
    next.lanes = String(Math.max(1, lanes))
    fitTurns(next, 'turn:lanes', Math.max(1, lanes))
    fitTurns(next, 'turn:lanes:forward', Math.max(1, lanes))
    fitChanges(next, 'change:lanes', Math.max(1, lanes))
    fitWidths(next, 'width:lanes', Math.max(1, lanes))
  } else {
    next.lanes = String(forward + backward)
    next['lanes:forward'] = String(forward)
    next['lanes:backward'] = String(backward)
    fitTurns(next, 'turn:lanes:forward', forward)
    fitTurns(next, 'turn:lanes:backward', backward)
    fitChanges(next, 'change:lanes:forward', forward)
    fitChanges(next, 'change:lanes:backward', backward)
    fitWidths(next, 'width:lanes:forward', forward)
    fitWidths(next, 'width:lanes:backward', backward)
  }
  if (next['width:lanes'] || next['width:lanes:forward'] || next['width:lanes:backward']) writeTotalWidth(next)
  return next
}

/** Новая полоса получает ширину соседней: так дорога не меняет характер при добавлении полосы. */
function fitWidths(tags: Tags, key: string, count: number): void {
  const widths = tags[key]?.split('|')
  if (!widths) return
  if (count <= 0) {
    delete tags[key]
    return
  }
  const fitted = widths.slice(0, count)
  while (fitted.length < count) fitted.push(fitted.at(-1)!)
  tags[key] = fitted.join('|')
}

function fitChanges(tags: Tags, key: string, count: number): void {
  const rules = parseTurnLanes(tags[key])
  if (!rules) return
  const fitted = rules.slice(0, count)
  while (fitted.length < count) fitted.push('yes')
  if (fitted.every((value) => value === 'yes') || count <= 0) delete tags[key]
  else tags[key] = fitted.join('|')
}

function fitTurns(tags: Tags, key: string, count: number): void {
  const turns = parseTurnLanes(tags[key])
  if (!turns) return
  if (count <= 0) {
    delete tags[key]
    return
  }
  const fitted = turns.slice(0, count)
  while (fitted.length < count) fitted.push('')
  tags[key] = fitted.join('|')
}

export type TravelDirection = 'forward' | 'backward'

/** Записывает манёвры полос одного направления. */
export function withTurns(tags: Tags, direction: TravelDirection, turns: string[]): Tags {
  const next: Tags = { ...tags }
  const empty = turns.every((turn) => !turn || turn === 'none')
  const oneway = isOneway(tags)
  const key = oneway ? 'turn:lanes' : `turn:lanes:${direction}`
  if (oneway) delete next['turn:lanes:forward']
  if (empty) delete next[key]
  else next[key] = turns.join('|')
  return next
}

/** Переключает один манёвр в значении полосы вида left;through. */
export function toggleTurn(value: string, turn: Turn): string {
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'none')
  const index = parts.indexOf(turn)
  if (index >= 0) parts.splice(index, 1)
  else parts.push(turn)
  const order = ['reverse', 'sharp_left', 'left', 'slight_left', 'through', 'slight_right', 'right', 'sharp_right']
  parts.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return parts.join(';')
}

export function turnAllows(value: string, kind: 'left' | 'through' | 'right' | 'reverse'): boolean {
  const parts = value.split(';').map((part) => part.trim())
  switch (kind) {
    case 'left':
      return parts.some((p) => p === 'left' || p === 'slight_left' || p === 'sharp_left')
    case 'right':
      return parts.some((p) => p === 'right' || p === 'slight_right' || p === 'sharp_right')
    case 'through':
      return parts.includes('through')
    default:
      return parts.includes('reverse')
  }
}
