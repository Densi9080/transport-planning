import type { Tags } from './types'

/**
 * План светофорного объекта. В OSM нет стандартного способа хранить фазы, поэтому план лежит
 * в служебном теге узла. Симуляторы этот тег игнорируют и строят свою программу:
 * план работает в моделях редактора, а в файл попадает только как справочные данные.
 */

export const SIGNAL_PLAN_TAG = 'signal:plan'

export interface SignalPhase {
  /** Длительность зелёного, с. */
  green: number
  /** Манёвры, у которых зелёный: ключи из movementKey. */
  movements: string[]
  /** Транспорт стоит, идут только пешеходы. */
  pedestrian?: boolean
}

export interface SignalPlan {
  offset: number
  yellow: number
  allRed: number
  phases: SignalPhase[]
}

export const DEFAULT_YELLOW_S = 3
export const DEFAULT_ALL_RED_S = 2
export const MIN_GREEN_S = 3
export const MAX_GREEN_S = 180
export const MAX_YELLOW_S = 10
export const MAX_ALL_RED_S = 30

/** Манёвр задаётся соседними узлами: они не меняются при разрезании дорог. */
export function movementKey(node: number, fromNeighbor: number, toNeighbor: number): string {
  return `${node}:${fromNeighbor}>${toNeighbor}`
}

export function parseSignalPlan(tags: Tags | undefined): SignalPlan | null {
  const raw = tags?.[SIGNAL_PLAN_TAG]
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<SignalPlan>
    if (!Array.isArray(value.phases) || value.phases.length === 0) return null
    return {
      offset: Number(value.offset) || 0,
      yellow: Number.isFinite(value.yellow) ? Number(value.yellow) : DEFAULT_YELLOW_S,
      allRed: Number.isFinite(value.allRed) ? Number(value.allRed) : DEFAULT_ALL_RED_S,
      phases: value.phases.map((phase) => ({
        green: Math.max(1, Number(phase.green) || MIN_GREEN_S),
        movements: Array.isArray(phase.movements) ? phase.movements.map(String) : [],
        ...(phase.pedestrian ? { pedestrian: true } : {}),
      })),
    }
  } catch {
    // Тег могли править вручную: кривой план не должен ломать открытие файла
    return null
  }
}

export function serializeSignalPlan(plan: SignalPlan): string {
  return JSON.stringify(plan)
}

export function cycleLength(plan: SignalPlan): number {
  return plan.phases.reduce((sum, phase) => sum + phase.green + plan.yellow + plan.allRed, 0)
}

export type SignalColor = 'green' | 'yellow' | 'red'

export interface PhaseWindow {
  start: number
  green: number
  /** Вся фаза вместе с жёлтым и общим красным. */
  length: number
}

export function phaseWindows(plan: SignalPlan): PhaseWindow[] {
  let start = 0
  return plan.phases.map((phase) => {
    const length = phase.green + plan.yellow + plan.allRed
    const window = { start, green: phase.green, length }
    start += length
    return window
  })
}

/** Сигнал манёвра в момент цикла. Если манёвр идёт и в следующей фазе, зелёный не прерывается. */
export function colorAt(
  plan: SignalPlan,
  windows: PhaseWindow[],
  phases: readonly number[],
  cycleTime: number,
): SignalColor {
  for (const index of phases) {
    const window = windows[index]
    if (!window) continue
    const local = cycleTime - window.start
    if (local < 0 || local >= window.length) continue
    if (local < window.green) return 'green'
    if (phases.includes((index + 1) % windows.length) && windows.length > 1) return 'green'
    return local < window.green + plan.yellow ? 'yellow' : 'red'
  }
  return 'red'
}

export interface SignalSegment {
  start: number
  length: number
  color: SignalColor
}

/** Сигнал манёвра за весь цикл точными отрезками. Правила те же, что в colorAt. */
export function signalSegments(plan: SignalPlan, phases: readonly number[]): SignalSegment[] {
  const windows = phaseWindows(plan)
  const segments: SignalSegment[] = []
  const push = (start: number, length: number, color: SignalColor) => {
    if (length <= 0) return
    const last = segments.at(-1)
    if (last?.color === color) last.length += length
    else segments.push({ start, length, color })
  }
  windows.forEach((window, index) => {
    if (!phases.includes(index)) {
      push(window.start, window.length, 'red')
      return
    }
    push(window.start, window.green, 'green')
    const afterGreen = window.start + window.green
    if (windows.length > 1 && phases.includes((index + 1) % windows.length)) {
      push(afterGreen, plan.yellow + plan.allRed, 'green')
    } else {
      push(afterGreen, plan.yellow, 'yellow')
      push(afterGreen + plan.yellow, plan.allRed, 'red')
    }
  })
  return segments
}

export interface SignalTimes {
  green: number
  yellow: number
  red: number
}

/** Сколько секунд за цикл манёвр видит каждый сигнал. */
export function signalTimes(plan: SignalPlan, phases: readonly number[]): SignalTimes {
  const times: SignalTimes = { green: 0, yellow: 0, red: 0 }
  for (const segment of signalSegments(plan, phases)) times[segment.color] += segment.length
  return times
}

/** Текущий сигнал и сколько он ещё будет гореть. У постоянного сигнала остаток бесконечен. */
export function signalRemaining(plan: SignalPlan, phases: readonly number[], cycleTime: number): { color: SignalColor; left: number } {
  const segments = signalSegments(plan, phases)
  const first = segments[0]
  if (!first) return { color: 'red', left: Number.POSITIVE_INFINITY }
  if (segments.length === 1) return { color: first.color, left: Number.POSITIVE_INFINITY }
  const index = segments.findIndex((segment) => cycleTime < segment.start + segment.length)
  const position = index < 0 ? segments.length - 1 : index
  const current = segments[position]!
  let left = current.start + current.length - cycleTime
  // Цикл замкнут: красный в конце цикла продолжается красным в его начале
  if (position === segments.length - 1 && first.color === current.color) left += first.length
  return { color: current.color, left }
}

/** Доля зелёного в цикле: от неё зависит пропускная способность подхода в макромодели. */
export function greenShare(plan: SignalPlan, phases: readonly number[]): number {
  const cycle = cycleLength(plan)
  if (cycle <= 0) return 0
  const times = signalTimes(plan, phases)
  return Math.min(1, (times.green + times.yellow * 0.5) / cycle)
}

function clonePlan(plan: SignalPlan): SignalPlan {
  return { ...plan, phases: plan.phases.map((phase) => ({ green: phase.green, movements: [...phase.movements] })) }
}

/**
 * Меняет суммарный зелёный выбранных фаз на delta секунд, сохраняя их пропорции.
 * Ни одна фаза не выходит за допустимые пределы, поэтому результат может быть ближе к границе, чем просили.
 */
function shiftGreens(plan: SignalPlan, indexes: readonly number[], delta: number): SignalPlan {
  const next = clonePlan(plan)
  const phases = indexes.map((index) => next.phases[index]).filter((phase) => phase !== undefined)
  if (phases.length === 0) return next
  const total = phases.reduce((sum, phase) => sum + phase.green, 0)
  const target = Math.min(phases.length * MAX_GREEN_S, Math.max(phases.length * MIN_GREEN_S, Math.round(total + delta)))
  const ratio = total > 0 ? target / total : 1
  for (const phase of phases) phase.green = Math.min(MAX_GREEN_S, Math.max(MIN_GREEN_S, Math.round(phase.green * ratio)))
  // Остаток от округления и упёршихся в предел фаз раздаём по секунде самым длинным из тех, что могут измениться
  let rest = target - phases.reduce((sum, phase) => sum + phase.green, 0)
  while (rest !== 0) {
    const step = Math.sign(rest)
    const movable = phases.filter((phase) => (step > 0 ? phase.green < MAX_GREEN_S : phase.green > MIN_GREEN_S))
    const longest = movable.reduce((best, phase) => (phase.green > best.green ? phase : best), movable[0]!)
    longest.green += step
    rest -= step
  }
  return next
}

/** Сколько должно гореть зелёным: меняются фазы этого направления, длина цикла следует за ними. */
export function withGreenTime(plan: SignalPlan, phases: readonly number[], seconds: number): SignalPlan {
  const indexes = plan.phases.flatMap((_, index) => (phases.includes(index) ? [index] : []))
  return shiftGreens(plan, indexes, seconds - signalTimes(plan, phases).green)
}

/** Сколько должно гореть красным: зелёный направления не меняется, а меняются остальные фазы. */
export function withRedTime(plan: SignalPlan, phases: readonly number[], seconds: number): SignalPlan {
  const indexes = plan.phases.flatMap((_, index) => (phases.includes(index) ? [] : [index]))
  return shiftGreens(plan, indexes, seconds - signalTimes(plan, phases).red)
}

/** Новая длина цикла: зелёный фаз меняется пропорционально. */
export function withCycleLength(plan: SignalPlan, seconds: number): SignalPlan {
  return shiftGreens(plan, plan.phases.map((_, index) => index), seconds - cycleLength(plan))
}

/** Передаёт секунды зелёного от одной фазы другой. Цикл при этом не меняется. */
export function withGreenMoved(plan: SignalPlan, from: number, to: number, seconds: number): SignalPlan {
  const next = clonePlan(plan)
  const giver = next.phases[from]
  const taker = next.phases[to]
  if (!giver || !taker || from === to) return next
  const low = Math.max(MIN_GREEN_S - taker.green, giver.green - MAX_GREEN_S)
  const high = Math.min(giver.green - MIN_GREEN_S, MAX_GREEN_S - taker.green)
  const amount = Math.min(high, Math.max(low, Math.round(seconds)))
  giver.green -= amount
  taker.green += amount
  return next
}
