import { describe, expect, it } from 'vitest'

import { computeSignal, DEFAULT_CALC_PARAMS, levelOfService, pedestrianGreen, type PhaseInput } from '../signalCalc'

const params = { ...DEFAULT_CALC_PARAMS, phf: 1, lost: 5 }
const car = (flow: number): PhaseInput => ({ flow, saturation: 1800, pedestrian: false, crossing: 0 })

describe('расчёт светофорного цикла', () => {
  it('цикл считается по формуле Вебстера', () => {
    const result = computeSignal([car(540), car(540)], params)
    expect(result.sumRatio).toBeCloseTo(0.6)
    expect(result.cycle).toBe(50)
    expect(result.phases[0]!.green).toBe(20)
  })

  it('задержка считается по HCM для недонасыщенного потока', () => {
    const result = computeSignal([car(540), car(540)], { ...params, k: 0.5, upstream: 1, period: 0.25 })
    const phase = result.phases[0]!
    expect(phase.capacity).toBe(720)
    expect(phase.saturationDegree).toBeCloseTo(0.75)
    expect(phase.delay).toBeGreaterThan(10)
    expect(phase.delay).toBeLessThan(30)
  })

  it('пешеходная фаза занимает время цикла и не даёт транспортной задержки', () => {
    const without = computeSignal([car(540), car(540)], params)
    const withPed = computeSignal([car(540), car(540), { flow: 0, saturation: 0, pedestrian: true, crossing: 13 }], params)
    expect(withPed.phases[2]!.green).toBe(15)
    expect(withPed.cycle).toBeGreaterThan(without.cycle)
    expect(withPed.phases[2]!.los).toBe('—')
  })

  it('зелёный не короче времени перехода параллельных пешеходов', () => {
    const result = computeSignal([{ ...car(90), crossing: 26 }, car(540)], params)
    expect(result.phases[0]!.green).toBeGreaterThanOrEqual(Math.round(pedestrianGreen(26, params)))
  })

  it('при суммарной загрузке выше единицы берётся максимальный цикл', () => {
    const result = computeSignal([car(1200), car(1200)], params)
    expect(result.oversaturated).toBe(true)
    expect(result.cycle).toBe(params.maxCycle)
  })

  it('уровни обслуживания соответствуют порогам HCM', () => {
    expect(levelOfService(10)).toBe('A')
    expect(levelOfService(35)).toBe('C')
    expect(levelOfService(81)).toBe('F')
  })
})
