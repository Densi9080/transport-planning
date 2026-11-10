import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { Projector } from '@/core/geo'
import { parseSample } from '@/core/__tests__/sample'
import { SIGNAL_PLAN_TAG } from '@/core/signals'
import type { RawDocument } from '@/core/types'

import { sumoSignalGroups } from '../sumoSignals'

const STEP = 0.001

function crossroads(signal: Record<string, string>): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - STEP },
      { id: 2, lat: 52, lon: 104, tags: signal },
      { id: 3, lat: 52, lon: 104 + STEP },
      { id: 4, lat: 52 - STEP, lon: 104 },
      { id: 5, lat: 52 + STEP, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', lanes: '4' } },
      { id: 20, nds: [4, 2, 5], tags: { highway: 'residential' } },
    ],
    relations: [],
  }
}

describe('фазы для SUMO', () => {
  it('отдаёт план и фазы каждого манёвра настоящего светофора', () => {
    const plan = { offset: 7, yellow: 4, allRed: 1, phases: [{ green: 25, movements: ['2:1>3'] }, { green: 15, movements: ['2:4>5'] }] }
    const raw = crossroads({ highway: 'traffic_signals', [SIGNAL_PLAN_TAG]: JSON.stringify(plan) })
    const [group] = sumoSignalGroups(new OsmDoc(raw), new Projector(raw.bounds))
    expect(group!.nodes).toEqual([2])
    expect(group!.plan).toEqual({ offset: 7, yellow: 4, allRed: 1, phases: [{ green: 25 }, { green: 15 }] })
    expect(group!.movements['2:1>3']).toEqual([0])
    expect(group!.movements['2:4>5']).toEqual([1])
    // Манёвров вне плана модель пускает по оси движения: так же они поедут и в SUMO
    expect(group!.movements['2:3>1']).toEqual([0])
    expect(Object.values(group!.movements).every((phases) => phases.length > 0)).toBe(true)
  })

  it('не берёт светофоры, которые модель только предположила', () => {
    const raw = crossroads({})
    expect(sumoSignalGroups(new OsmDoc(raw), new Projector(raw.bounds))).toEqual([])
  })

  it('находит оба светофора на Лермонтова в примере', () => {
    const raw = parseSample()
    const groups = sumoSignalGroups(new OsmDoc(raw), new Projector(raw.bounds))
    const nodes = groups.flatMap((group) => group.nodes)
    expect(nodes).toContain(1872643965)
    expect(nodes).toContain(1498865642)
  })
})
