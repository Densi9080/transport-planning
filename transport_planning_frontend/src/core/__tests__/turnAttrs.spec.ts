import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { readTurnAttrs, writeTurnAttrs } from '../turnAttrs'
import type { RawDocument } from '../types'

const raw: RawDocument = {
  bounds: { minlat: 52, minlon: 104, maxlat: 53, maxlon: 105 },
  nodes: [{ id: 1, lat: 52.1, lon: 104.1 }],
  ways: [],
  relations: [],
}

describe('атрибуты поворота', () => {
  it('сохраняются для конкретного манёвра и читаются обратно', () => {
    const doc = new OsmDoc(raw)
    doc.transact('Тест', () => writeTurnAttrs(doc, 1, 10, 20, { capacity: '900', penalty: '12', tsys: ['car', 'bus'] }))
    expect(readTurnAttrs(doc, 1, 10, 20)).toEqual({ capacity: '900', penalty: '12', tsys: ['car', 'bus'] })
    expect(readTurnAttrs(doc, 1, 10, 30)).toEqual({ capacity: '', penalty: '', tsys: [] })
  })

  it('пустые атрибуты не оставляют отношения в файле', () => {
    const doc = new OsmDoc(raw)
    doc.transact('Тест', () => writeTurnAttrs(doc, 1, 10, 20, { capacity: '900', penalty: '', tsys: [] }))
    expect(doc.relations.size).toBe(1)
    doc.transact('Тест', () => writeTurnAttrs(doc, 1, 10, 20, { capacity: '', penalty: '', tsys: [] }))
    expect(doc.relations.size).toBe(0)
  })
})
