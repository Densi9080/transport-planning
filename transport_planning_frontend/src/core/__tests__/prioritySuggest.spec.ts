import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { applyPrioritySigns, suggestPrioritySigns } from '../prioritySuggest'
import { buildNetwork } from '../topology'
import { signApplies } from '../traffic'
import type { RawDocument, Tags } from '../types'
import { parseSample } from './sample'

const M = 1 / 111_320

/** Т-образный перекрёсток: главная идёт с запада на восток, боковая подходит с юга. */
function tJunction(sideTags: Tags, junctionTags?: Tags): RawDocument {
  return {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 100 * M },
      { id: 2, lat: 52, lon: 104, tags: junctionTags },
      { id: 3, lat: 52, lon: 104 + 100 * M },
      { id: 4, lat: 52 - 100 * M, lon: 104 },
      { id: 5, lat: 52 - 20 * M, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', name: 'Главная' } },
      { id: 11, nds: [4, 5, 2], tags: { name: 'Боковая', ...sideTags } },
    ],
    relations: [],
  }
}

function run(raw: RawDocument) {
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  return { doc, projector, summary: suggestPrioritySigns(doc, projector, buildNetwork(doc, projector)) }
}

describe('черновая расстановка знаков приоритета', () => {
  it('младшая дорога уступает главной, знак ставится на её узел по ходу к перекрёстку', () => {
    const { doc, projector, summary } = run(tJunction({ highway: 'residential' }))
    expect(summary.suggestions).toHaveLength(1)
    const item = summary.suggestions[0]!
    expect(item).toMatchObject({ junction: 2, wayId: 11, signNode: 5, direction: 'forward', mainName: 'Главная' })
    doc.begin('тест')
    applyPrioritySigns(doc, projector, summary.suggestions)
    doc.commit()
    expect(signApplies(doc.node(5).tags, true)).toBe(true)
    expect(signApplies(doc.node(5).tags, false)).toBe(false)
    // Повторный подбор видит поставленный знак
    expect(run({ ...tJunction({ highway: 'residential' }), nodes: [...doc.nodes.values()] }).summary.alreadySigned).toBe(1)
  })

  it('светофор, равнозначный перекрёсток и выезд с прилегающей территории не трогаются', () => {
    expect(run(tJunction({ highway: 'residential' }, { highway: 'traffic_signals' })).summary).toMatchObject({ signalized: 1, suggestions: [] })
    expect(run(tJunction({ highway: 'primary' })).summary.equal).toEqual([2])
    expect(run(tJunction({ highway: 'service' })).summary.suggestions).toEqual([])
  })

  it('на кольце уступают въезды', () => {
    const raw = tJunction({ highway: 'primary' })
    raw.ways[0]!.tags = { highway: 'tertiary', junction: 'roundabout', oneway: 'yes' }
    const { summary } = run(raw)
    expect(summary.suggestions.map((item) => item.wayId)).toEqual([11])
    expect(summary.suggestions[0]!.roundabout).toBe(true)
  })

  it('на файле кейса предложений разумно немного, все на въездах в перекрёстки', () => {
    const raw = parseSample()
    const { summary } = run(raw)
    expect(summary.junctions).toBeGreaterThan(50)
    expect(summary.suggestions.length).toBeGreaterThan(0)
    expect(summary.suggestions.length).toBeLessThan(summary.junctions * 2)
    for (const item of summary.suggestions) expect(summary.equal).not.toContain(item.junction)
  })
})
