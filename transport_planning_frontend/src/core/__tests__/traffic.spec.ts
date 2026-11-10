import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { polylineLength, Projector } from '../geo'
import { splitWay } from '../ops'
import {
  addSpeedBump,
  applySpeedSection,
  createParallelWay,
  reducedSections,
  removeSpeedBump,
  signApplies,
  smoothWay,
  toggleSign,
  wayPoints,
} from '../traffic'
import type { RawDocument, Tags } from '../types'

const METER = 1 / 111_319.49
const LAT = 52
const LON_METER = METER / Math.cos((LAT * Math.PI) / 180)

/** Прямая дорога длиной 200 м с запада на восток; `side` примыкает к ней посередине. */
function road(tags: Tags = {}, withSide = false): { doc: OsmDoc; projector: Projector } {
  const raw: RawDocument = {
    bounds: { minlat: LAT - 0.01, minlon: 104 - 0.01, maxlat: LAT + 0.01, maxlon: 104 + 0.01 },
    nodes: [
      { id: 1, lat: LAT, lon: 104 },
      { id: 2, lat: LAT, lon: 104 + 100 * LON_METER },
      { id: 3, lat: LAT, lon: 104 + 200 * LON_METER },
      { id: 4, lat: LAT - 100 * METER, lon: 104 + 100 * LON_METER },
    ],
    ways: [
      { id: 10, nds: [1, 2, 3], tags: { highway: 'secondary', maxspeed: '60', name: 'Главная', ...tags } },
      ...(withSide ? [{ id: 20, nds: [4, 2], tags: { highway: 'residential' } }] : []),
    ],
    relations: [],
  }
  return { doc: new OsmDoc(raw), projector: new Projector(raw.bounds) }
}

const at = (meters: number) => ({ lat: LAT, lon: 104 + meters * LON_METER })
const speeds = (doc: OsmDoc) => [...doc.ways.values()].map((way) => way.tags?.maxspeed).sort()

describe('участок сниженной скорости', () => {
  it('меняет скорость только между двумя точками', () => {
    const { doc, projector } = road()
    const id = doc.transact('t', () => applySpeedSection(doc, projector, 10, at(40), at(70), 30))
    expect(doc.way(id).tags?.maxspeed).toBe('30')
    expect(doc.ways.size).toBe(3)
    expect(speeds(doc)).toEqual(['30', '60', '60'])
    expect(polylineLength(wayPoints(doc, projector, doc.way(id)))).toBeCloseTo(30, 0)
  })

  it('не зависит от порядка кликов и сразу отменяется', () => {
    const { doc, projector } = road()
    doc.transact('t', () => applySpeedSection(doc, projector, 10, at(70), at(40), 30))
    expect(speeds(doc)).toEqual(['30', '60', '60'])
    doc.undo()
    expect(doc.ways.size).toBe(1)
    expect(doc.way(10).tags?.maxspeed).toBe('60')
  })

  it('оставляет манёвры полос только у конца дороги', () => {
    const { doc, projector } = road({ oneway: 'yes', 'turn:lanes': 'left|through' })
    const id = doc.transact('t', () => applySpeedSection(doc, projector, 10, at(40), at(70), 30))
    const withTurns = [...doc.ways.values()].filter((way) => way.tags?.['turn:lanes'])
    expect(doc.way(id).tags?.['turn:lanes']).toBeUndefined()
    expect(withTurns).toHaveLength(1)
    expect(withTurns[0]!.nds.at(-1)).toBe(3)
  })

  it('убирает скорости по направлениям', () => {
    const { doc, projector } = road({ 'maxspeed:forward': '60', 'maxspeed:backward': '40' })
    const id = doc.transact('t', () => applySpeedSection(doc, projector, 10, at(40), at(70), 20))
    expect(doc.way(id).tags?.['maxspeed:forward']).toBeUndefined()
    expect(doc.way(id).tags?.['maxspeed:backward']).toBeUndefined()
  })

  it('не принимает слишком короткий участок', () => {
    const { doc, projector } = road()
    expect(() => doc.transact('t', () => applySpeedSection(doc, projector, 10, at(40), at(41), 20))).toThrow()
    expect(doc.ways.size).toBe(1)
  })
})

describe('лежачий полицейский', () => {
  const options = { kind: 'hump' as const, speed: 20 }

  it('ставит тег и короткий участок низкой скорости', () => {
    const { doc, projector } = road()
    const { nodeId, sectionId } = doc.transact('t', () => addSpeedBump(doc, projector, 10, at(50), options))
    expect(doc.node(nodeId).tags?.traffic_calming).toBe('hump')
    expect(doc.way(sectionId).nds).toContain(nodeId)
    expect(doc.way(sectionId).tags?.maxspeed).toBe('20')
    expect(polylineLength(wayPoints(doc, projector, doc.way(sectionId)))).toBeCloseTo(20, 0)
  })

  it('не заводит участок за перекрёсток', () => {
    const { doc, projector } = road({}, true)
    const { sectionId } = doc.transact('t', () => addSpeedBump(doc, projector, 10, at(95), options))
    expect(doc.way(sectionId).nds.at(-1)).toBe(2)
    expect(polylineLength(wayPoints(doc, projector, doc.way(sectionId)))).toBeCloseTo(15, 0)
  })

  it('не ставится на перекрёсток', () => {
    const { doc, projector } = road({}, true)
    expect(() => doc.transact('t', () => addSpeedBump(doc, projector, 10, at(100), options))).toThrow()
  })

  it('не режет дорогу, где и так медленно', () => {
    const { doc, projector } = road({ maxspeed: '20' })
    doc.transact('t', () => addSpeedBump(doc, projector, 10, at(50), options))
    expect(doc.ways.size).toBe(1)
  })

  it('при снятии возвращает одну дорогу с прежней скоростью и манёврами', () => {
    const { doc, projector } = road({ oneway: 'yes', 'turn:lanes': 'left|through' })
    const { nodeId } = doc.transact('t', () => addSpeedBump(doc, projector, 10, at(50), options))
    expect(doc.ways.size).toBe(3)
    doc.transact('t', () => removeSpeedBump(doc, projector, nodeId))
    expect(doc.ways.size).toBe(1)
    const way = [...doc.ways.values()][0]!
    expect(way.tags?.maxspeed).toBe('60')
    expect(way.tags?.['turn:lanes']).toBe('left|through')
    expect(way.nds[0]).toBe(1)
    expect(way.nds.at(-1)).toBe(3)
    expect(doc.node(nodeId).tags?.traffic_calming).toBeUndefined()
  })

  it('на карте показывается своим значком, а не знаком скорости', () => {
    const { doc, projector } = road()
    doc.transact('t', () => addSpeedBump(doc, projector, 10, at(50), options))
    expect(reducedSections(doc, projector)).toEqual([])
  })

  it('обычный участок виден знаком скорости', () => {
    const { doc, projector } = road()
    doc.transact('t', () => applySpeedSection(doc, projector, 10, at(40), at(70), 30))
    expect(reducedSections(doc, projector).map((item) => item.speed)).toEqual([30])
  })
})

describe('знаки приоритета', () => {
  const near = { lat: LAT, lon: 104 + 180 * LON_METER }

  it('ставит знак с направлением к ближайшему концу', () => {
    const { doc, projector } = road()
    const { nodeId } = doc.transact('t', () => toggleSign(doc, projector, { wayId: 10, position: near }, 'give_way'))
    expect(doc.node(nodeId).tags).toMatchObject({ highway: 'give_way', direction: 'forward' })
    const back = { lat: LAT, lon: 104 + 20 * LON_METER }
    const other = doc.transact('t', () => toggleSign(doc, projector, { wayId: 10, position: back }, 'stop'))
    expect(doc.node(other.nodeId).tags).toMatchObject({ highway: 'stop', direction: 'backward' })
  })

  it('на односторонней дороге обходится без направления', () => {
    const { doc, projector } = road({ oneway: 'yes' })
    const { nodeId } = doc.transact('t', () => toggleSign(doc, projector, { wayId: 10, position: near }, 'stop'))
    expect(doc.node(nodeId).tags?.direction).toBeUndefined()
  })

  it('повторный клик снимает знак', () => {
    const { doc, projector } = road()
    const first = doc.transact('t', () => toggleSign(doc, projector, { wayId: 10, position: near }, 'stop'))
    const second = doc.transact('t', () =>
      toggleSign(doc, projector, { nodeId: first.nodeId, position: doc.node(first.nodeId) }, 'stop'),
    )
    expect(second.enabled).toBe(false)
    expect(doc.node(first.nodeId).tags?.highway).toBeUndefined()
    expect(doc.node(first.nodeId).tags?.direction).toBeUndefined()
  })

  it('не ставится на перекрёсток', () => {
    const { doc, projector } = road({}, true)
    expect(() => doc.transact('t', () => toggleSign(doc, projector, { nodeId: 2, position: at(100) }, 'stop'))).toThrow()
  })

  it('действует только в своём направлении', () => {
    expect(signApplies({ highway: 'stop', direction: 'forward' }, true)).toBe(true)
    expect(signApplies({ highway: 'stop', direction: 'forward' }, false)).toBe(false)
    expect(signApplies({ highway: 'give_way' }, false)).toBe(true)
    expect(signApplies({ highway: 'crossing' }, true)).toBe(false)
  })
})

describe('геометрия дороги', () => {
  it('сглаживание сохраняет все узлы и их порядок', () => {
    const { doc, projector } = road()
    doc.transact('t', () => doc.putNode({ ...doc.node(2), lat: LAT + 40 * METER }))
    const added = doc.transact('t', () => smoothWay(doc, projector, 10))
    const nds = doc.way(10).nds
    expect(added).toBeGreaterThan(0)
    expect([nds[0], nds.at(-1)]).toEqual([1, 3])
    expect(nds).toContain(2)
    expect(nds.indexOf(2)).toBeGreaterThan(0)
    expect(nds.indexOf(2)).toBeLessThan(nds.length - 1)
  })

  it('прямую из двух точек не трогает', () => {
    const { doc, projector } = road()
    doc.transact('t', () => splitWay(doc, 10, 2))
    const short = [...doc.ways.values()][0]!
    expect(doc.transact('t', () => smoothWay(doc, projector, short.id))).toBe(0)
  })

  it('параллельная дорога лежит на заданном расстоянии слева и не связана с исходной', () => {
    const { doc, projector } = road()
    const id = doc.transact('t', () => createParallelWay(doc, projector, 10, 12))
    const copy = doc.way(id)
    expect(copy.tags?.name).toBe('Главная')
    expect(copy.nds.some((nd) => doc.way(10).nds.includes(nd))).toBe(false)
    for (const point of wayPoints(doc, projector, copy)) {
      expect(point.y - projector.toXY(at(0)).y).toBeCloseTo(12, 1)
    }
  })

  it('с отрицательным смещением уходит вправо', () => {
    const { doc, projector } = road()
    const id = doc.transact('t', () => createParallelWay(doc, projector, 10, -8))
    const point = wayPoints(doc, projector, doc.way(id))[0]!
    expect(point.y - projector.toXY(at(0)).y).toBeCloseTo(-8, 1)
  })
})
