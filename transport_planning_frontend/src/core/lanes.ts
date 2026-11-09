import type { Tags } from './types'

export type Turn = 'left' | 'slight_left' | 'through' | 'slight_right' | 'right' | 'reverse'

export interface LaneProfile {
  /** Полос по ходу порядка узлов дороги. */
  forward: number
  /** Полос против хода порядка узлов дороги. */
  backward: number
  oneway: boolean
  laneWidth: number
  /** Манёвры полос слева направо по ходу движения; null, если не заданы. */
  turnsForward: string[] | null
  turnsBackward: string[] | null
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
  const laneWidth =
    Number.isFinite(widthTag) && widthTag > 0
      ? clamp(widthTag / (forward + backward), 2.25, 5)
      : (DEFAULT_LANE_WIDTH[highway.replace('_link', '')] ?? 3)

  const allDirections = parseTurnLanes(tags['turn:lanes'])
  let turnsForward = parseTurnLanes(tags['turn:lanes:forward'])
  let turnsBackward = parseTurnLanes(tags['turn:lanes:backward'])
  if (oneway && allDirections) {
    if (reversed) turnsBackward = allDirections
    else turnsForward = allDirections
  }
  if (oneway && reversed && !turnsBackward) turnsBackward = turnsForward

  return { forward, backward, oneway, laneWidth, turnsForward, turnsBackward, inferred }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function totalWidth(profile: LaneProfile): number {
  return (profile.forward + profile.backward) * profile.laneWidth
}

export interface LaneOffsets {
  /** Смещения полос по ходу дороги: слева направо по ходу движения. */
  forward: number[]
  /** Смещения полос против хода: слева направо по ходу их движения. */
  backward: number[]
  /** Линия между встречными потоками. */
  divider: number
  left: number
  right: number
}

/** Смещения в поперечном сечении: положительные — слева от оси дороги. Правостороннее движение. */
export function laneOffsets(profile: LaneProfile): LaneOffsets {
  const width = totalWidth(profile)
  const divider = width / 2 - profile.backward * profile.laneWidth
  const forward: number[] = []
  const backward: number[] = []
  for (let i = 0; i < profile.forward; i++) forward.push(divider - (i + 0.5) * profile.laneWidth)
  for (let i = 0; i < profile.backward; i++) backward.push(divider + (i + 0.5) * profile.laneWidth)
  return { forward, backward, divider, left: width / 2, right: -width / 2 }
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
  } else {
    next.lanes = String(forward + backward)
    next['lanes:forward'] = String(forward)
    next['lanes:backward'] = String(backward)
    fitTurns(next, 'turn:lanes:forward', forward)
    fitTurns(next, 'turn:lanes:backward', backward)
  }
  return next
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
