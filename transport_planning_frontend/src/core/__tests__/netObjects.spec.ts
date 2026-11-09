import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { CUSTOM_TYPES, customObjectOf, customObjectTags, isCustomObject, matchesNode, matchesWay, pickTypeOf } from '../netObjects'
import type { RawDocument } from '../types'

const raw: RawDocument = {
  bounds: { minlat: 52, minlon: 104, maxlat: 53, maxlon: 105 },
  nodes: [
    { id: 1, lat: 52.1, lon: 104.1 },
    { id: 2, lat: 52.2, lon: 104.2, tags: { highway: 'traffic_signals' } },
    { id: 3, lat: 52.3, lon: 104.3, tags: { public_transport: 'stop_position' } },
    { id: 4, lat: 52.4, lon: 104.4, tags: { public_transport: 'platform' } },
    { id: 5, lat: 52.5, lon: 104.5, tags: customObjectTags('detectors', 10) },
    { id: 6, lat: 52.6, lon: 104.6, tags: { highway: 'stop' } },
    { id: 7, lat: 52.7, lon: 104.7, tags: { crossing: 'traffic_signals', highway: 'crossing' } },
  ],
  ways: [{ id: 10, nds: [1, 2, 3, 6, 7], tags: { highway: 'residential' } }],
  relations: [],
}

function makeDoc(): OsmDoc {
  return new OsmDoc(raw)
}

describe('объекты сети', () => {
  it('узел вне дорог с tp:type распознаётся как объект и не считается узлом графа', () => {
    const doc = makeDoc()
    const detector = doc.node(5)
    expect(customObjectOf(detector.tags)).toBe('detectors')
    expect(matchesNode('detectors', detector, doc)).toBe(true)
    expect(matchesNode('nodes', detector, doc)).toBe(false)
    expect(matchesNode('inflows', detector, doc)).toBe(false)
  })

  it('каждый свой тип хранит ссылку на отрезок и параметры по умолчанию', () => {
    for (const type of Object.keys(CUSTOM_TYPES) as (keyof typeof CUSTOM_TYPES)[]) {
      const tags = customObjectTags(type, 77)
      expect(tags['tp:way']).toBe('77')
      expect(customObjectOf(tags)).toBe(type)
      expect(isCustomObject(type)).toBe(true)
    }
  })

  it('данные OSM попадают в нужные типы', () => {
    const doc = makeDoc()
    expect(matchesNode('signals', doc.node(2), doc)).toBe(true)
    expect(matchesNode('signals', doc.node(7), doc)).toBe(true)
    expect(matchesNode('stopPoints', doc.node(3), doc)).toBe(true)
    expect(matchesNode('stopAreas', doc.node(4), doc)).toBe(true)
    expect(matchesNode('stopSigns', doc.node(6), doc)).toBe(true)
    expect(matchesWay('links', doc.way(10))).toBe(true)
  })

  it('при выборе отрезков и точечных объектов щелчок ищет разные элементы', () => {
    expect(pickTypeOf('links')).toBe('links')
    expect(pickTypeOf('detectors')).toBe('links')
    expect(pickTypeOf('signals')).toBe('nodes')
    expect(pickTypeOf('stopAreas')).toBe('auto')
  })
})
