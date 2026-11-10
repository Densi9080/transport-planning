import { describe, expect, it } from 'vitest'

import { computeFlows, estimateFlows, writeFlowLists } from '../ridership'
import {
  buildJourneys,
  departures,
  formatClock,
  hourGrid,
  parseIntervalPeriods,
  peakInterval,
  serviceWindow,
  timetableCsv,
  writeIntervalPeriods,
  writeServiceWindow,
} from '../timetable'

describe('расписание', () => {
  it('время работы читается из opening_hours и записывается туда же', () => {
    expect(serviceWindow({ opening_hours: 'Mo-Su 05:30-23:10' })).toEqual({ firstMin: 330, lastMin: 1390, tagged: true })
    expect(serviceWindow({ opening_hours: '06:00-01:00' }).lastMin).toBe(25 * 60)
    expect(serviceWindow({})).toEqual({ firstMin: 360, lastMin: 22 * 60, tagged: false })
    const tags = writeServiceWindow({ 'tp:hours': '12' }, 330, 1390)
    expect(tags).toEqual({ opening_hours: '05:30-23:10' })
  })

  it('интервалы по периодам читаются из interval:conditional и пишутся обратно', () => {
    const periods = parseIntervalPeriods({ 'interval:conditional': '5 @ (Mo-Fr 07:00-10:00); 00:08 @ (16:00-19:00)' })
    expect(periods).toEqual([
      { fromMin: 420, toMin: 600, interval: 5 },
      { fromMin: 960, toMin: 1140, interval: 8 },
    ])
    expect(writeIntervalPeriods({}, periods)['interval:conditional']).toBe('5 @ (07:00-10:00); 8 @ (16:00-19:00)')
    expect(writeIntervalPeriods({ 'interval:conditional': 'x' }, [])).toEqual({})
  })

  it('в пик рейсы идут чаще, машины считаются по наименьшему интервалу', () => {
    const window = { firstMin: 360, lastMin: 600, tagged: true }
    const periods = [{ fromMin: 420, toMin: 480, interval: 5 }]
    const starts = departures(window, 20, periods)
    expect(starts.map(formatClock)).toEqual(['06:00', '06:20', '06:40', '07:00', '07:05', '07:10', '07:15', '07:20', '07:25', '07:30', '07:35', '07:40', '07:45', '07:50', '07:55', '08:00', '08:20', '08:40', '09:00', '09:20', '09:40', '10:00'])
    expect(peakInterval(20, periods)).toBe(5)
  })

  it('время по пунктам следует из профиля, табличка остановки группирует по часам', () => {
    const journeys = buildJourneys([360, 380], [{ arrivalS: 0, dwellS: 0 }, { arrivalS: 300, dwellS: 30 }])
    expect(journeys[1]!.times[1]).toEqual({ arriveS: 380 * 60 + 300, departS: 380 * 60 + 330 })
    expect(hourGrid(journeys, 1)).toEqual([{ hour: 6, minutes: [6, 26] }])
    expect(timetableCsv(['А', 'Б; угол'], journeys).split('\r\n')).toEqual(['Пункт;Рейс 1;Рейс 2', 'А;06:00;06:20', '"Б; угол";06:06;06:26'])
  })
})

describe('пассажиропотоки', () => {
  const profile = [{ distanceM: 0 }, { distanceM: 1000 }, { distanceM: 3000 }, { distanceM: 4000 }]

  it('наполнение по перегонам следует из баланса входа и выхода', () => {
    const tags = writeFlowLists({}, [100, 50, 20, null], [null, 30, 60, 80])
    const result = computeFlows(tags, profile, 480, 80)
    expect(result.stops.map((s) => s.loadAfter)).toEqual([100, 120, 80, 0])
    expect(result.spans.map((s) => s.load)).toEqual([100, 120, 80])
    expect(result.balanced).toBe(true)
    expect(result.passengerKm).toBeCloseTo(100 * 1 + 120 * 2 + 80 * 1)
    expect(result.avgTripKm).toBeCloseTo(420 / 170)
    expect(result.turnover).toBeCloseTo(4 / (420 / 170))
    expect(result.maxSpan).toBe(1)
    expect(result.maxFill).toBeCloseTo(120 / 480)
    expect(result.unevenness).toBeCloseTo(120 / (420 / 4))
    expect(result.neededTripsPerHour).toBeCloseTo(1.5)
  })

  it('выход больше числа едущих отмечается и урезается', () => {
    const tags = writeFlowLists({}, [10, 0, 0, null], [null, 30, 0, 0])
    const result = computeFlows(tags, profile, 480, 80)
    expect(result.shortageAt).toBe(1)
    expect(result.stops[1]!.alight).toBe(10)
  })

  it('без данных показатели нулевые', () => {
    const result = computeFlows({}, profile, 480, 80)
    expect(result.hasData).toBe(false)
    expect(result.maxLoad).toBe(0)
  })

  it('равномерная оценка сохраняет баланс', () => {
    const { board, alight } = estimateFlows(5, 300)
    expect(board.reduce((a, b) => a + b, 0)).toBe(alight.reduce((a, b) => a + b, 0))
    expect(board[4]).toBe(0)
    expect(alight[0]).toBe(0)
    const result = computeFlows(writeFlowLists({}, board, alight), [0, 1, 2, 3, 4].map((i) => ({ distanceM: i * 500 })), 600, 80)
    expect(result.shortageAt).toBeNull()
    expect(result.stops.at(-1)!.loadAfter).toBe(0)
  })
})
