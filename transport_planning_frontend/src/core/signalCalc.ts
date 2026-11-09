/**
 * Расчёт светофорного цикла. Длительность цикла по Вебстеру, задержка и уровень
 * обслуживания по HCM 2000. Все коэффициенты задаются пользователем.
 */

export interface CalcParams {
  /** Коэффициент часа пик: часовой поток делится на него. */
  phf: number
  /** Потерянное время на фазу, с. */
  lost: number
  minCycle: number
  maxCycle: number
  /** Минимальный зелёный транспортной фазы, с. */
  minGreen: number
  /** Скорость пешехода, м/с. */
  pedSpeed: number
  /** Время на начало перехода, с. */
  pedStart: number
  /** Длительность периода анализа, ч. */
  period: number
  /** Коэффициент приращения задержки. */
  k: number
  /** Коэффициент влияния соседних перекрёстков. */
  upstream: number
}

export const DEFAULT_CALC_PARAMS: CalcParams = { phf: 0.92, lost: 4, minCycle: 30, maxCycle: 120, minGreen: 5, pedSpeed: 1.3, pedStart: 5, period: 0.25, k: 0.5, upstream: 1 }

export interface PhaseInput {
  /** Поток на критическом подходе, авт/ч. */
  flow: number
  /** Поток насыщения критического подхода, авт/ч. */
  saturation: number
  /** Только для пешеходов: транспорт стоит. */
  pedestrian: boolean
  /** Длина перехода, м. Ноль, если в этой фазе пешеходы не идут. */
  crossing: number
}

export interface PhaseResult {
  ratio: number
  green: number
  capacity: number
  saturationDegree: number
  delay: number
  los: string
}

export interface CalcResult {
  sumRatio: number
  lostTotal: number
  cycle: number
  oversaturated: boolean
  phases: PhaseResult[]
  delay: number
  los: string
}

const LOS_LIMITS: [number, string][] = [[10, 'A'], [20, 'B'], [35, 'C'], [55, 'D'], [80, 'E']]

export function levelOfService(delay: number): string {
  return LOS_LIMITS.find(([limit]) => delay <= limit)?.[1] ?? 'F'
}

export function pedestrianGreen(crossing: number, params: CalcParams): number {
  return params.pedStart + crossing / params.pedSpeed
}

function phaseDelay(cycle: number, green: number, degree: number, capacity: number, params: CalcParams): number {
  if (green <= 0 || capacity <= 0) return 0
  const share = green / cycle
  const uniform = (0.5 * cycle * (1 - share) ** 2) / (1 - Math.min(1, degree) * share)
  const { period, k, upstream } = params
  const excess = degree - 1
  const incremental = 900 * period * (excess + Math.sqrt(excess ** 2 + (8 * k * upstream * degree) / (capacity * period)))
  return uniform + incremental
}

export function computeSignal(inputs: PhaseInput[], params: CalcParams): CalcResult {
  const ratios = inputs.map((phase) => (phase.pedestrian || phase.saturation <= 0 ? 0 : phase.flow / params.phf / phase.saturation))
  const sumRatio = ratios.reduce((sum, value) => sum + value, 0)
  const pedTime = inputs.reduce((sum, phase) => sum + (phase.pedestrian ? pedestrianGreen(phase.crossing, params) : 0), 0)
  const lostTotal = inputs.length * params.lost + pedTime
  const oversaturated = sumRatio >= 1
  const ideal = oversaturated ? params.maxCycle : (1.5 * lostTotal + 5) / (1 - sumRatio)
  const cycle = Math.round(Math.max(params.minCycle, Math.min(params.maxCycle, ideal)))
  const available = Math.max(0, cycle - lostTotal)
  const vehicles = inputs.filter((phase) => !phase.pedestrian).length

  let weighted = 0
  let totalFlow = 0
  const phases = inputs.map((phase, index) => {
    if (phase.pedestrian) return { ratio: 0, green: Math.round(pedestrianGreen(phase.crossing, params)), capacity: 0, saturationDegree: 0, delay: 0, los: '—' }
    const share = sumRatio > 0 ? ratios[index]! / sumRatio : 1 / Math.max(1, vehicles)
    const floor = Math.max(params.minGreen, phase.crossing > 0 ? pedestrianGreen(phase.crossing, params) : 0)
    const green = Math.max(available * share, floor)
    const volume = phase.flow / params.phf
    const capacity = (phase.saturation * green) / cycle
    const degree = capacity > 0 ? volume / capacity : 0
    const delay = phaseDelay(cycle, green, degree, capacity, params)
    weighted += delay * volume
    totalFlow += volume
    return { ratio: ratios[index]!, green: Math.round(green), capacity: Math.round(capacity), saturationDegree: degree, delay, los: levelOfService(delay) }
  })
  const delay = totalFlow > 0 ? weighted / totalFlow : 0
  return { sumRatio, lostTotal, cycle, oversaturated, phases, delay, los: levelOfService(delay) }
}
