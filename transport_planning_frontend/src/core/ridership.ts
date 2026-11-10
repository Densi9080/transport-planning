import type { Tags } from './types'

/**
 * Пассажиропотоки по маршруту за расчётный час пик.
 *
 * Вход и выход по пунктам хранятся списками в тегах `tp:board` и `tp:alight` отношения маршрута,
 * в том же порядке, что и профиль времени. Из них по балансу следует наполнение на каждом перегоне.
 * Показатели взяты из классической методики обследования маршрутов:
 * пассажирооборот, средняя дальность поездки, коэффициенты сменности и неравномерности по участкам.
 */

export interface StopFlow {
  board: number
  alight: number
  /** Пассажиров в машинах после отправления с пункта, пасс/ч. */
  loadAfter: number
}

export interface SpanFlow {
  from: number
  to: number
  lengthM: number
  load: number
  /** Наполнение относительно провозной способности в час пик. */
  fill: number
}

export interface FlowResult {
  hasData: boolean
  stops: StopFlow[]
  spans: SpanFlow[]
  boardings: number
  alightings: number
  /** Вход и выход сходятся. */
  balanced: boolean
  /** Пункт, где выходит больше, чем едет: ошибка исходных данных. */
  shortageAt: number | null
  passengerKm: number
  avgTripKm: number
  /** Коэффициент сменности: длина маршрута, делённая на среднюю дальность поездки. */
  turnover: number
  maxLoad: number
  maxSpan: number | null
  /** Коэффициент неравномерности по участкам: наибольшая нагрузка к средней по длине. */
  unevenness: number
  maxFill: number
  /** Рейсов в час, чтобы самый нагруженный перегон уместился во вместимость машин. */
  neededTripsPerHour: number
}

export interface FlowPoint {
  distanceM: number
}

export function readFlowList(tags: Tags, key: string, count: number): (number | null)[] {
  const items = (tags[key] ?? '').split(';')
  return Array.from({ length: count }, (_, i) => {
    const raw = items[i]?.trim() ?? ''
    const value = Number.parseFloat(raw)
    return raw !== '' && Number.isFinite(value) && value >= 0 ? value : null
  })
}

export function writeFlowLists(tags: Tags, board: (number | null)[], alight: (number | null)[]): Tags {
  const next = { ...tags }
  for (const [key, values] of [['tp:board', board], ['tp:alight', alight]] as const) {
    if (values.every((v) => v === null)) delete next[key]
    else next[key] = values.map((v) => (v === null ? '' : String(Math.round(v)))).join(';')
  }
  return next
}

export function computeFlows(tags: Tags, profile: FlowPoint[], capacityPerHour: number, vehicleCapacity: number): FlowResult {
  const n = profile.length
  const boardRaw = readFlowList(tags, 'tp:board', n)
  const alightRaw = readFlowList(tags, 'tp:alight', n)
  const hasData = boardRaw.some((v) => v !== null) || alightRaw.some((v) => v !== null)

  let load = 0
  let shortageAt: number | null = null
  const stops: StopFlow[] = profile.map((_, i) => {
    // На первом пункте никто не выходит, на последнем никто не садится
    const board = i === n - 1 ? 0 : (boardRaw[i] ?? 0)
    let alight = i === 0 ? 0 : (alightRaw[i] ?? 0)
    if (alight > load + 1e-9) {
      if (shortageAt === null) shortageAt = i
      alight = load
    }
    load = load - alight + board
    return { board, alight, loadAfter: load }
  })

  const spans: SpanFlow[] = []
  for (let i = 0; i + 1 < n; i++) {
    const spanLoad = stops[i]!.loadAfter
    spans.push({
      from: i,
      to: i + 1,
      lengthM: Math.max(0, profile[i + 1]!.distanceM - profile[i]!.distanceM),
      load: spanLoad,
      fill: capacityPerHour > 0 ? spanLoad / capacityPerHour : 0,
    })
  }

  const boardings = stops.reduce((sum, s) => sum + s.board, 0)
  const alightings = stops.reduce((sum, s) => sum + s.alight, 0)
  const passengerKm = spans.reduce((sum, s) => sum + (s.load * s.lengthM) / 1000, 0)
  const lengthKm = spans.reduce((sum, s) => sum + s.lengthM, 0) / 1000
  const avgTripKm = boardings > 0 ? passengerKm / boardings : 0
  let maxSpan: number | null = null
  let maxLoad = 0
  spans.forEach((span, index) => {
    if (span.load > maxLoad) {
      maxLoad = span.load
      maxSpan = index
    }
  })
  const meanLoad = lengthKm > 0 ? passengerKm / lengthKm : 0

  return {
    hasData,
    stops,
    spans,
    boardings,
    alightings,
    balanced: Math.abs(boardings - alightings) < 0.5,
    shortageAt,
    passengerKm,
    avgTripKm,
    turnover: avgTripKm > 0 ? lengthKm / avgTripKm : 0,
    maxLoad,
    maxSpan,
    unevenness: meanLoad > 0 ? maxLoad / meanLoad : 0,
    maxFill: capacityPerHour > 0 ? maxLoad / capacityPerHour : 0,
    neededTripsPerHour: vehicleCapacity > 0 ? maxLoad / vehicleCapacity : 0,
  }
}

/**
 * Черновая оценка по общему числу входящих: с каждого пункта, кроме последнего, садится поровну,
 * а выходят пассажиры равновероятно на любом следующем пункте. Это допущение, а не обследование:
 * оно нужно, чтобы увидеть порядок нагрузки до появления реальных данных.
 */
export function estimateFlows(count: number, total: number): { board: number[]; alight: number[] } {
  if (count < 2 || total <= 0) return { board: Array(count).fill(0), alight: Array(count).fill(0) }
  const perStop = total / (count - 1)
  const alightExact = Array<number>(count).fill(0)
  for (let i = 0; i < count - 1; i++) {
    const share = perStop / (count - 1 - i)
    for (let j = i + 1; j < count; j++) alightExact[j]! += share
  }
  const board = Array.from({ length: count }, (_, i) => (i === count - 1 ? 0 : Math.round(perStop)))
  const totalBoard = board.reduce((a, b) => a + b, 0)
  const alight = alightExact.map((v) => Math.round(v))
  // Округление не должно нарушать баланс: разница уходит на конечный пункт
  alight[count - 1] = Math.max(0, totalBoard - alight.slice(0, -1).reduce((a, b) => a + b, 0))
  return { board, alight }
}
