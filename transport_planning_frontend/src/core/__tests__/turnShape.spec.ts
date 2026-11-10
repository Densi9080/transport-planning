import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { dist, Projector } from '../geo'
import { nodeConnectors } from '../laneOps'
import { laneOffsets, parseProfile, withLaneShift } from '../lanes'
import { type Connector, crossingConnectors, curveMiddle, readTurnShapes, shapedCurve, turnCurve, writeTurnShape } from '../scene'
import type { RawDocument } from '../types'

const M = 1 / 111_320

describe('сдвиг полосы', () => {
  it('полоса сдвигается вправо по ходу движения в обоих направлениях, разметка остаётся', () => {
    const base = { highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' }
    const before = laneOffsets(parseProfile(base))
    let tags = withLaneShift(base, 'forward', 1, 0.4)
    tags = withLaneShift(tags, 'backward', 0, 0.3)
    expect(tags['tp:lane_shift:forward']).toBe('0|0.4')
    const after = laneOffsets(parseProfile(tags))
    // Попутная полоса уходит вправо по ходу, то есть к меньшему смещению; встречная — к большему
    expect(after.forward[1]! - before.forward[1]!).toBeCloseTo(-0.4)
    expect(after.backward[0]! - before.backward[0]!).toBeCloseTo(0.3)
    expect(after.forwardBoundaries).toEqual(before.forwardBoundaries)
    expect(after.divider).toBe(before.divider)
  })

  it('сдвиг ограничен третью ширины полосы и снимается нулём', () => {
    const base = { highway: 'residential', oneway: 'yes', lanes: '2' }
    const tags = withLaneShift(base, 'forward', 0, 5)
    expect(parseProfile(tags).shiftForward[0]).toBeCloseTo(parseProfile(base).widthsForward[0]! / 3)
    expect(withLaneShift(tags, 'forward', 0, 0)).toEqual(base)
  })
})

describe('форма манёвра', () => {
  it('середина кривой встаёт туда, куда её перетащили, концы остаются на полосах', () => {
    const base = turnCurve({ x: 0, y: -10 }, { x: 0, y: 1 }, { x: 10, y: 0 }, { x: 1, y: 0 })
    const shaped = shapedCurve(base, { x: 2, y: -1 })
    expect(shaped[0]).toEqual(base[0])
    expect(shaped.at(-1)).toEqual(base.at(-1))
    const target = { x: curveMiddle(base).x + 2, y: curveMiddle(base).y - 1 }
    expect(dist(curveMiddle(shaped), target)).toBeLessThan(1e-6)
  })

  it('пересечение траекторий с одного подхода находится, параллельные не считаются', () => {
    const arm = {} as Connector['from']
    const other = {} as Connector['to']
    const make = (fromLane: number, toLane: number, points: { x: number; y: number }[]) =>
      ({ node: 1, from: arm, to: other, fromLane, toLane, kind: 'through', points }) as Connector
    const straight0 = make(0, 0, [{ x: 0, y: 0 }, { x: 0, y: 20 }])
    const straight1 = make(1, 1, [{ x: 3, y: 0 }, { x: 3, y: 20 }])
    const crossing = make(1, 2, [{ x: 3, y: 0 }, { x: -1, y: 20 }])
    expect(crossingConnectors([straight0, straight1])).toHaveLength(0)
    expect(crossingConnectors([straight0, crossing])).toHaveLength(1)
  })

  it('тег хранит форму по паре узлов и снимается сбросом', () => {
    let tags = writeTurnShape({}, 11, 22, { x: 1.234, y: -0.56 })
    tags = writeTurnShape(tags, 33, 44, { x: 2, y: 2 })
    expect(readTurnShapes(tags)).toEqual([{ from: 11, to: 22, dx: 1.2, dy: -0.6 }, { from: 33, to: 44, dx: 2, dy: 2 }])
    tags = writeTurnShape(tags, 11, 22, null)
    tags = writeTurnShape(tags, 33, 44, null)
    expect(tags).toEqual({})
  })

  it('сохранённая форма меняет траектории всех полос манёвра на карте и в модели', () => {
    const raw: RawDocument = {
      bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
      nodes: [
        { id: 1, lat: 52, lon: 104 - 100 * M },
        { id: 2, lat: 52, lon: 104 },
        { id: 3, lat: 52, lon: 104 + 100 * M },
        { id: 4, lat: 52 - 100 * M, lon: 104 },
      ],
      ways: [
        { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', lanes: '4' } },
        { id: 11, nds: [4, 2], tags: { highway: 'primary', lanes: '2' } },
      ],
      relations: [],
    }
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const leftTurn = () => nodeConnectors(doc, projector, 2).connectors.filter((c) => c.from.neighbor === 4 && c.to.neighbor === 1)
    const before = leftTurn().map((c) => curveMiddle(c.points))
    doc.begin('тест')
    doc.putNode({ ...doc.node(2), tags: writeTurnShape(doc.node(2).tags, 4, 1, { x: 3, y: 0 }) })
    doc.commit()
    const after = leftTurn().map((c) => curveMiddle(c.points))
    expect(after.length).toBe(before.length)
    after.forEach((point, i) => {
      expect(point.x - before[i]!.x).toBeCloseTo(3, 1)
      expect(point.y - before[i]!.y).toBeCloseTo(0, 1)
    })
  })
})
