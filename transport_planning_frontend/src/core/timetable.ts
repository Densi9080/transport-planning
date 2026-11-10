import type { Tags } from './types'

/**
 * Расписание рейсов маршрута.
 *
 * Время работы хранится в теге OSM `opening_hours` отношения маршрута ("06:00-23:00"),
 * интервалы по периодам суток в `interval:conditional` ("5 @ (07:00-10:00); 8 @ (16:00-19:00)").
 * Оба тега описаны в схеме общественного транспорта PTv2. Дни недели в условиях не различаются:
 * расписание строится на один расчётный день.
 */

export const DEFAULT_FIRST_MIN = 6 * 60
export const DEFAULT_HOURS = 16
const MAX_JOURNEYS = 2000
const DAY_MIN = 24 * 60

export interface ServiceWindow {
  /** Отправление первого рейса, мин от полуночи. */
  firstMin: number
  /** Отправление последнего рейса, мин от полуночи. После полуночи значение больше 1440. */
  lastMin: number
  /** Время работы задано в файле. */
  tagged: boolean
}

export interface IntervalPeriod {
  fromMin: number
  toMin: number
  /** Интервал, мин. */
  interval: number
}

export interface JourneyTime {
  /** Прибытие, с от полуночи. */
  arriveS: number
  /** Отправление, с от полуночи. */
  departS: number
}

export interface Journey {
  number: number
  departMin: number
  times: JourneyTime[]
}

export interface ProfileTiming {
  arrivalS: number
  dwellS: number
}

export function parseClock(value: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return minutes < 60 && hours <= 48 ? hours * 60 + minutes : null
}

/** Часы и минуты. Время после полуночи остаётся за пределами суток: 24:15, как в расписаниях. */
export function formatClock(minutes: number): string {
  const total = Math.round(minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function formatClockSeconds(seconds: number): string {
  return formatClock(Math.round(seconds / 60))
}

function intervalValue(raw: string): number | null {
  const clock = parseClock(raw)
  if (clock !== null) return clock > 0 ? clock : null
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

const RANGE = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g

function ranges(text: string): [number, number][] {
  const found: [number, number][] = []
  for (const match of text.matchAll(RANGE)) {
    const from = parseClock(match[1]!)
    let to = parseClock(match[2]!)
    if (from === null || to === null) continue
    if (to <= from) to += DAY_MIN
    found.push([from, to])
  }
  return found
}

export function serviceWindow(tags: Tags): ServiceWindow {
  const open = ranges(tags.opening_hours ?? '')
  if (open.length > 0) {
    return { firstMin: Math.min(...open.map((r) => r[0])), lastMin: Math.max(...open.map((r) => r[1])), tagged: true }
  }
  const first = parseClock(tags['tp:first'] ?? '') ?? DEFAULT_FIRST_MIN
  const hours = Number.parseFloat(tags['tp:hours'] ?? '')
  const tagged = Number.isFinite(hours) && hours > 0
  return { firstMin: first, lastMin: first + (tagged ? hours : DEFAULT_HOURS) * 60, tagged }
}

export function writeServiceWindow(tags: Tags, firstMin: number, lastMin: number): Tags {
  const next = { ...tags }
  delete next['tp:first']
  delete next['tp:hours']
  next.opening_hours = `${formatClock(firstMin % DAY_MIN)}-${formatClock(lastMin % DAY_MIN)}`
  return next
}

export function parseIntervalPeriods(tags: Tags): IntervalPeriod[] {
  const periods: IntervalPeriod[] = []
  for (const match of (tags['interval:conditional'] ?? '').matchAll(/([\d.:]+)\s*@\s*\(([^)]*)\)/g)) {
    const interval = intervalValue(match[1]!)
    if (interval === null) continue
    for (const [fromMin, toMin] of ranges(match[2]!)) periods.push({ fromMin, toMin, interval })
  }
  return periods.sort((a, b) => a.fromMin - b.fromMin)
}

export function writeIntervalPeriods(tags: Tags, periods: IntervalPeriod[]): Tags {
  const next = { ...tags }
  const valid = periods.filter((p) => p.interval > 0 && p.toMin > p.fromMin).sort((a, b) => a.fromMin - b.fromMin)
  if (valid.length === 0) delete next['interval:conditional']
  else {
    next['interval:conditional'] = valid
      .map((p) => `${p.interval} @ (${formatClock(p.fromMin % DAY_MIN)}-${formatClock(p.toMin % DAY_MIN)})`)
      .join('; ')
  }
  return next
}

export function intervalAt(minute: number, base: number, periods: IntervalPeriod[]): number {
  return periods.find((p) => minute >= p.fromMin && minute < p.toMin)?.interval ?? base
}

/** Отправления с начального пункта: шаг берётся из периода, в который попадает очередной рейс. */
export function departures(window: ServiceWindow, base: number, periods: IntervalPeriod[]): number[] {
  const result: number[] = []
  let minute = window.firstMin
  while (minute <= window.lastMin + 1e-6 && result.length < MAX_JOURNEYS) {
    result.push(minute)
    minute += intervalAt(minute, base, periods)
  }
  return result
}

export function buildJourneys(starts: number[], profile: ProfileTiming[]): Journey[] {
  return starts.map((departMin, index) => ({
    number: index + 1,
    departMin,
    times: profile.map((point) => {
      const arriveS = departMin * 60 + point.arrivalS
      return { arriveS, departS: arriveS + point.dwellS }
    }),
  }))
}

/** Наименьший интервал за день: по нему считается выпуск машин в час пик. */
export function peakInterval(base: number, periods: IntervalPeriod[]): number {
  return Math.min(base, ...periods.map((p) => p.interval))
}

/** Отправления с пункта по часам, как на табличке остановки. */
export function hourGrid(journeys: Journey[], stopIndex: number): { hour: number; minutes: number[] }[] {
  const byHour = new Map<number, number[]>()
  for (const journey of journeys) {
    const time = journey.times[stopIndex]
    if (!time) continue
    const minute = Math.round(time.departS / 60)
    const hour = Math.floor(minute / 60)
    const list = byHour.get(hour) ?? []
    list.push(minute % 60)
    byHour.set(hour, list)
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, minutes]) => ({ hour, minutes }))
}

export function timetableCsv(names: string[], journeys: Journey[]): string {
  const quote = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const header = ['Пункт', ...journeys.map((j) => `Рейс ${j.number}`)]
  const rows = names.map((name, index) => [
    quote(name),
    ...journeys.map((j) => formatClockSeconds(j.times[index]?.departS ?? 0)),
  ])
  return [header, ...rows].map((row) => row.join(';')).join('\r\n')
}
