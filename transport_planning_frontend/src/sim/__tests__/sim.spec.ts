import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { applyElevationRamp, maxSlopePercent, wayHeights } from '@/core/elevation'
import { Projector } from '@/core/geo'
import { parseSample } from '@/core/__tests__/sample'
import type { RawDocument } from '@/core/types'

import { edgeBaseLoad, losFromVc, parseSpeed, runMacro } from '../macro'
import { Car, MicroSim, SIM_STEP_S } from '../micro'
import { buildSimNet, signalState, SimLane } from '../net'

const STEP = 0.001

function crossroads(extra: Record<string, string> = {}): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - STEP },
      { id: 2, lat: 52, lon: 104, tags: extra },
      { id: 3, lat: 52, lon: 104 + STEP },
      { id: 4, lat: 52 - STEP, lon: 104 },
      { id: 5, lat: 52 + STEP, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', lanes: '4', maxspeed: '60' } },
      { id: 11, nds: [2, 3], tags: { highway: 'primary', lanes: '4', maxspeed: '60' } },
      { id: 20, nds: [4, 2], tags: { highway: 'residential' } },
      { id: 21, nds: [2, 5], tags: { highway: 'residential' } },
    ],
    relations: [],
  }
}

function setup(raw: RawDocument, guess = false) {
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  return { doc, projector, net: buildSimNet(doc, projector, guess) }
}

describe('сеть симуляции', () => {
  it('строит направления, полосы и соединения', () => {
    const { net } = setup(crossroads())
    expect(net.edges).toHaveLength(8)
    const main = net.edges.find((edge) => edge.wayId === 10 && edge.forward)!
    expect(main.lanes).toHaveLength(2)
    expect(main.moves.size).toBe(3)
    expect(net.connectors.length).toBeGreaterThan(8)
  })

  it('учитывает одностороннее движение', () => {
    const raw = crossroads()
    raw.ways[0]!.tags = { highway: 'primary', lanes: '2', oneway: 'yes' }
    const { net } = setup(raw)
    expect(net.edges.filter((edge) => edge.wayId === 10)).toHaveLength(1)
  })

  it('не строит манёвр, запрещённый отношением', () => {
    const raw = crossroads()
    raw.relations.push({
      id: 60,
      members: [['way', 10, 'from'], ['node', 2, 'via'], ['way', 21, 'to']],
      tags: { type: 'restriction', restriction: 'no_left_turn' },
    })
    const { net } = setup(raw)
    const main = net.edges.find((edge) => edge.wayId === 10 && edge.forward)!
    expect([...main.moves.keys()].some((edge) => edge.wayId === 21)).toBe(false)
  })

  it('находит конфликтующие траектории и отдаёт преимущество главной дороге', () => {
    const { net } = setup(crossroads())
    const minor = net.connectors.find((c) => c.fromLane.edge.wayId === 20 && c.toLane.edge.wayId === 21)!
    expect(minor.conflicts.length).toBeGreaterThan(0)
    const main = minor.conflicts.find((c) => c.other.fromLane.edge.wayId === 10)
    expect(main?.otherHasPriority).toBe(true)
  })

  it('чередует фазы светофора без одновременного зелёного', () => {
    const { net } = setup(crossroads({ highway: 'traffic_signals' }))
    expect(net.signals).toHaveLength(1)
    const group = net.signals[0]!
    const main = net.connectors.find((c) => c.fromLane.edge.wayId === 10 && c.toLane.edge.wayId === 11)!
    const cross = net.connectors.find((c) => c.fromLane.edge.wayId === 20 && c.toLane.edge.wayId === 21)!
    for (let t = 0; t < group.cycle; t++) {
      const a = signalState(main, t)
      const b = signalState(cross, t)
      expect(a !== 'red' && b !== 'red').toBe(false)
    }
    expect(main.phases).not.toEqual(cross.phases)
  })

  it('угадывает светофор только на перекрёстке крупных дорог', () => {
    expect(setup(crossroads(), true).net.signals).toHaveLength(0)
    const raw = crossroads()
    raw.ways[2]!.tags = { highway: 'secondary', name: 'Поперечная' }
    raw.ways[3]!.tags = { highway: 'secondary', name: 'Поперечная' }
    expect(setup(raw, true).net.signals).toHaveLength(1)
  })
})

describe('макроуровень', () => {
  it('разбирает скорость из разных форм тега', () => {
    expect(parseSpeed('60', 'primary')).toBe(60)
    expect(parseSpeed('RU:urban', 'primary')).toBe(60)
    expect(parseSpeed('30 mph', 'primary')).toBeCloseTo(48.3, 0)
    expect(parseSpeed(undefined, 'service')).toBe(20)
    expect(parseSpeed('мусор', 'residential')).toBe(40)
  })

  it('считает пропускную способность из атрибутов', () => {
    const raw = crossroads()
    const { doc, net } = setup(raw)
    const main = net.edges.find((edge) => edge.wayId === 10 && edge.forward)!
    expect(edgeBaseLoad(doc, net, main).capacity).toBe(3000)

    const narrow = crossroads()
    narrow.ways[0]!.tags = { highway: 'primary', lanes: '4', surface: 'gravel' }
    const second = setup(narrow)
    const edge = second.net.edges.find((item) => item.wayId === 10 && item.forward)!
    expect(edgeBaseLoad(second.doc, second.net, edge).capacity).toBe(2100)

    const signal = setup(crossroads({ highway: 'traffic_signals' }))
    const signalled = signal.net.edges.find((item) => item.wayId === 10 && item.forward)!
    // Две фазы: 33,5 с полезного зелёного из 64-секундного цикла
    expect(edgeBaseLoad(signal.doc, signal.net, signalled).capacity).toBeCloseTo((3000 * 33.5) / 64)
  })

  it('больше полос даёт меньшую загрузку', () => {
    const { doc, net } = setup(crossroads())
    const main = net.edges.find((edge) => edge.wayId === 10 && edge.forward)!
    const wide = edgeBaseLoad(doc, net, main).capacity
    const raw = crossroads()
    raw.ways[0]!.tags = { highway: 'primary', lanes: '2' }
    const narrow = setup(raw)
    const edge = narrow.net.edges.find((item) => item.wayId === 10 && item.forward)!
    expect(edgeBaseLoad(narrow.doc, narrow.net, edge).capacity).toBeLessThan(wide)
  })

  it('переводит загрузку в уровень обслуживания', () => {
    expect(losFromVc(0.1)).toBe(0)
    expect(losFromVc(0.8)).toBe(3)
    expect(losFromVc(1.4)).toBe(5)
  })
})

describe('высоты', () => {
  it('плавный переход проходит через заданные высоты без рывка в концах', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 6, lat: 52, lon: 104 + 2 * STEP }, { id: 7, lat: 52, lon: 104 + 3 * STEP })
    raw.ways.push({ id: 30, nds: [3, 6, 7], tags: { highway: 'primary' } })
    const { doc, projector } = setup(raw)
    doc.transact('z', () => applyElevationRamp(doc, projector, 30, 0, 6))
    const heights = wayHeights(doc, doc.way(30))
    expect(heights.get(3)).toBeCloseTo(0, 5)
    expect(heights.get(6)).toBeCloseTo(3, 1)
    expect(heights.get(7)).toBeCloseTo(6, 5)
    expect(maxSlopePercent(doc, doc.way(30), projector)).toBeLessThan(10)
  })

  it('мост без ele поднимается и опускается к земле', () => {
    const raw = crossroads()
    raw.nodes.push(
      { id: 6, lat: 52, lon: 104 + 2 * STEP },
      { id: 7, lat: 52, lon: 104 + 3 * STEP },
      { id: 8, lat: 52, lon: 104 + 4 * STEP },
    )
    raw.ways.push({ id: 30, nds: [3, 6, 7], tags: { highway: 'primary', bridge: 'yes', layer: '1' } })
    raw.ways.push({ id: 31, nds: [7, 8], tags: { highway: 'primary' } })
    const { doc } = setup(raw)
    const heights = wayHeights(doc, doc.way(30))
    expect(heights.get(3)).toBe(0)
    expect(heights.get(6)).toBeGreaterThan(4)
    expect(heights.get(7)).toBe(0)
  })
})

function runFor(sim: MicroSim, seconds: number, each?: () => void): void {
  const steps = Math.round(seconds / SIM_STEP_S)
  for (let i = 0; i < steps; i++) {
    sim.step(SIM_STEP_S)
    if (i % 5 === 0) each?.()
  }
}

/** Проверяем физику: машины на одной полосе не должны проезжать друг сквозь друга. */
function assertOrder(net: ReturnType<typeof buildSimNet>): void {
  for (const edge of net.edges) {
    for (const lane of edge.lanes) {
      for (let i = 1; i < lane.cars.length; i++) {
        expect(lane.cars[i]!.s).toBeGreaterThanOrEqual(lane.cars[i - 1]!.s)
      }
    }
  }
}

describe('настоящий файл', () => {
  const raw = parseSample()

  it('макромодель распределяет спрос и находит загруженные участки', () => {
    const { doc, net } = setup(raw)
    const result = runMacro(doc, net, { period: 'morning', demand: 1 })
    expect(result.flows.length).toBeGreaterThan(50)
    expect(result.totals.trips).toBeGreaterThan(1000)
    expect(result.totals.unservedTrips / result.totals.trips).toBeLessThan(0.1)
    for (const load of result.loads.values()) {
      expect(Number.isFinite(load.vc)).toBe(true)
      expect(load.speedKmh).toBeGreaterThan(0)
    }
  })

  it('больший спрос даёт большую загрузку', () => {
    const { doc, net } = setup(raw)
    const low = runMacro(doc, net, { period: 'morning', demand: 0.5 })
    const high = runMacro(doc, net, { period: 'morning', demand: 1.5 })
    expect(high.totals.vehKm).toBeGreaterThan(low.totals.vehKm)
    expect(high.totals.avgSpeedKmh).toBeLessThanOrEqual(low.totals.avgSpeedKmh)
  })

  it('микромодель едет без наложений и почти без застреваний', () => {
    const { doc, net } = setup(raw, true)
    const macro = runMacro(doc, net, { period: 'morning', demand: 1 })
    const sim = new MicroSim(net, macro.flows, { scale: 1 })
    runFor(sim, 600, () => assertOrder(net))
    const stats = sim.stats()
    expect(stats.spawned).toBeGreaterThan(200)
    expect(stats.finished).toBeGreaterThan(50)
    expect(stats.teleported / Math.max(1, stats.spawned)).toBeLessThan(0.05)
    for (const car of sim.cars) {
      expect(Number.isFinite(car.s)).toBe(true)
      expect(car).toBeInstanceOf(Car)
    }
    expect(net.edges.some((edge) => edge.lanes[0] instanceof SimLane)).toBe(true)
    // 10 минут модельного времени: тест о поведении машин, а не о скорости, и при параллельных тестах ему нужен запас
  }, 30_000)
})
