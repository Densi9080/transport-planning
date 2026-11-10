import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { readLine } from '../transit'
import { computeRoute, groupLines, oppositeRoute, writeProfileValue } from '../transitCalc'
import type { RawDocument } from '../types'

const STEP = 0.009
const raw: RawDocument = {
  bounds: { minlat: 52, minlon: 104, maxlat: 52.03, maxlon: 104.01 },
  nodes: [
    { id: 1, lat: 52, lon: 104, tags: { name: 'А', public_transport: 'stop_position' } },
    { id: 2, lat: 52 + STEP, lon: 104, tags: { name: 'Б', public_transport: 'stop_position' } },
    { id: 3, lat: 52 + 2 * STEP, lon: 104, tags: { name: 'В', public_transport: 'stop_position' } },
    { id: 9, lat: 52 + STEP, lon: 104.0002, tags: { public_transport: 'platform' } },
  ],
  ways: [{ id: 10, nds: [1, 2, 3], tags: { highway: 'primary' } }],
  relations: [
    { id: 100, members: [['way', 10, ''], ['node', 1, 'stop'], ['node', 2, 'stop'], ['node', 3, 'stop']], tags: { type: 'route', route: 'bus', ref: '5', interval: '10', from: 'А', to: 'В', 'tp:speed': '36' } },
    { id: 101, members: [['way', 10, ''], ['node', 3, 'stop'], ['node', 1, 'stop']], tags: { type: 'route', route: 'bus', ref: '5', interval: '10', from: 'В', to: 'А' } },
  ],
}

function setup() {
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  const line = readLine(doc, doc.relations.get(100)!, projector)
  const back = readLine(doc, doc.relations.get(101)!, projector)
  return { doc, projector, line, back }
}

describe('показатели маршрута', () => {
  it('время хода считается по расстоянию, стоянка только на промежуточных пунктах', () => {
    const { doc, projector, line, back } = setup()
    const result = computeRoute(doc, projector, line, back)
    expect(result.profile.map((p) => p.name)).toEqual(['А', 'Б', 'В'])
    expect(result.profile[1]!.runS).toBeCloseTo(100, 0)
    expect(result.profile[1]!.dwellS).toBe(20)
    expect(result.profile[2]!.dwellS).toBe(0)
    expect(result.totalS).toBeCloseTo(220, 0)
  })

  it('из интервала следуют рейсы, провозная способность и число машин', () => {
    const { doc, projector, line, back } = setup()
    const result = computeRoute(doc, projector, line, back)
    expect(result.tripsPerHour).toBe(6)
    expect(result.capacityPerHour).toBe(480)
    expect(result.hasOpposite).toBe(true)
    expect(result.vehicles).toBe(Math.ceil(result.roundTripS / 600))
  })

  it('заданное время хода важнее расчётного', () => {
    const { doc, projector, line, back } = setup()
    const tags = writeProfileValue(line.tags, 'tp:run', 1, 300, 3)
    const result = computeRoute(doc, projector, { ...line, tags }, back)
    expect(result.profile[1]!.runS).toBe(300)
    expect(result.profile[1]!.runTagged).toBe(true)
  })

  it('маршруты одной линии объединяются, встречный находится по конечным', () => {
    const { line, back } = setup()
    expect(groupLines([line, back])).toHaveLength(1)
    expect(oppositeRoute(line, [line, back])?.id).toBe(101)
  })
})
