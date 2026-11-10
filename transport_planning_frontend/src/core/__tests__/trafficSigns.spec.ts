import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { buildScene, forbiddenTurns, computeArmGeometries } from '../scene'
import { buildNetwork } from '../topology'
import { parseTrafficSign, placeSigns } from '../trafficSigns'
import type { RawDocument } from '../types'

const STEP = 0.001

/** Крест: подход с юга (20), запрет налево на запад (10) и разворота. */
function cross(restrictions: [string, number, number][]): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - STEP },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + STEP },
      { id: 4, lat: 52 - STEP, lon: 104 },
      { id: 5, lat: 52 + STEP, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary' } },
      { id: 11, nds: [2, 3], tags: { highway: 'secondary' } },
      { id: 20, nds: [4, 2], tags: { highway: 'secondary' } },
      { id: 21, nds: [2, 5], tags: { highway: 'secondary' } },
    ],
    relations: restrictions.map(([value, from, to], index) => ({
      id: 100 + index,
      members: [['way', from, 'from'], ['node', 2, 'via'], ['way', to, 'to']],
      tags: { type: 'restriction', restriction: value },
    })),
  }
}

describe('разбор traffic_sign', () => {
  it('номер, значение, страна и несколько знаков', () => {
    expect(parseTrafficSign('RU:3.24[40]')).toEqual([{ country: 'RU', code: '3.24', value: '40' }])
    expect(parseTrafficSign('RU:3.18.2;RU:3.19')).toEqual([
      { country: 'RU', code: '3.18.2', value: undefined },
      { country: 'RU', code: '3.19', value: undefined },
    ])
    expect(parseTrafficSign('BY:2.4,5.16').map((sign) => sign.code)).toEqual(['2.4', '5.16'])
  })

  it('слова OSM переводятся в номера ПДД', () => {
    expect(parseTrafficSign('maxspeed', { maxspeed: '40' })).toEqual([{ country: '', code: '3.24', value: '40' }])
    expect(parseTrafficSign('stop')[0]!.code).toBe('2.5')
    expect(parseTrafficSign('city_limit')[0]!.code).toBe('5.23.1')
    expect(parseTrafficSign('hazard')[0]!.code).toBe('hazard')
    expect(parseTrafficSign(undefined)).toEqual([])
  })
})

describe('знаки и запреты на карте', () => {
  it('запрет налево даёт знак 3.18.2 справа на подходе', () => {
    const raw = cross([['no_left_turn', 20, 10]])
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const signs = placeSigns(doc, buildNetwork(doc, projector), projector)
    expect(signs).toHaveLength(1)
    const sign = signs[0]!
    expect(sign).toMatchObject({ code: '3.18.2', derived: true, node: 2 })
    const center = projector.toXY(doc.node(2))
    // Подход с юга: знак южнее узла и правее, то есть восточнее оси
    expect(sign.point.y).toBeLessThan(center.y)
    expect(sign.point.x).toBeGreaterThan(center.x)
  })

  it('«только прямо» даёт знак 4.1.1 и две запрещённые траектории', () => {
    const raw = cross([['only_straight_on', 20, 21]])
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const network = buildNetwork(doc, projector)
    expect(placeSigns(doc, network, projector).map((sign) => sign.code)).toEqual(['4.1.1'])
    const forbidden = forbiddenTurns(doc, 2, network.arms.get(2)!, computeArmGeometries(network))
    expect(forbidden.map((item) => item.kind).sort()).toEqual(['left', 'right'])
  })

  it('запрещённый манёвр в сцене помечен и не смешан с разрешёнными', () => {
    const raw = cross([['no_left_turn', 20, 10]])
    const { scene } = buildScene(new OsmDoc(raw), new Projector(raw.bounds))
    const fromSouth = scene.turnPaths.features.filter((feature) => feature.properties?.from === 4)
    const forbidden = fromSouth.filter((feature) => feature.properties?.forbidden)
    expect(forbidden.map((feature) => feature.properties?.to)).toEqual([1])
    expect(fromSouth.some((feature) => !feature.properties?.forbidden && feature.properties?.to === 1)).toBe(false)
    expect(scene.trafficSigns.features.some((feature) => feature.properties?.icon === 'sign:3.18.2')).toBe(true)
  })

  it('явный знак из тега стоит у своего узла', () => {
    const raw = cross([])
    raw.nodes.push({ id: 7, lat: 52 - STEP / 2, lon: 104 + 0.00003, tags: { traffic_sign: 'RU:3.24[40];RU:3.20' } })
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const signs = placeSigns(doc, buildNetwork(doc, projector), projector)
    expect(signs.map((sign) => `${sign.code}:${sign.value ?? ''}:${sign.derived}`)).toEqual(['3.24:40:false', '3.20::false'])
  })
})
