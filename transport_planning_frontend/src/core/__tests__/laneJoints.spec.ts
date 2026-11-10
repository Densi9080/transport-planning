import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { nodeConnectors } from '../laneOps'
import { crossingConnectors } from '../scene'
import type { RawDocument, Tags } from '../types'

const M = 1 / 111_320

/** Стык двух односторонних отрезков с запада на восток: до узла 2 и после него. */
function joint(before: Tags, after: Tags) {
  const raw: RawDocument = {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 100 * M },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + 100 * M },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', oneway: 'yes', ...before } },
      { id: 11, nds: [2, 3], tags: { highway: 'primary', oneway: 'yes', ...after } },
    ],
    relations: [],
  }
  const doc = new OsmDoc(raw)
  const connectors = nodeConnectors(doc, new Projector(raw.bounds), 2).connectors
  return { pairs: connectors.map((c) => `${c.fromLane}>${c.toLane}`).sort(), crossings: crossingConnectors(connectors).length }
}

describe('полосы на стыке: расширение и сужение без пересечений', () => {
  it('добавилась полоса направо: она справа, крайняя правая разделяется на прямо и направо', () => {
    expect(joint({ lanes: '2' }, { lanes: '3', 'turn:lanes': 'through|through|right' })).toEqual({ pairs: ['0>0', '1>1', '1>2'], crossings: 0 })
  })

  it('добавилась полоса налево: она слева, крайняя левая разделяется', () => {
    expect(joint({ lanes: '2' }, { lanes: '3', 'turn:lanes': 'left|through|through' })).toEqual({ pairs: ['0>0', '0>1', '1>2'], crossings: 0 })
  })

  it('без разметки новая полоса справа', () => {
    expect(joint({ lanes: '2' }, { lanes: '3' })).toEqual({ pairs: ['0>0', '1>1', '1>2'], crossings: 0 })
  })

  it('по полосе налево и направо с обеих сторон', () => {
    expect(joint({ lanes: '2' }, { lanes: '4', 'turn:lanes': 'left|through|through|right' })).toEqual({ pairs: ['0>0', '0>1', '1>2', '1>3'], crossings: 0 })
  })

  it('сужение: крайняя правая вливается в соседнюю', () => {
    expect(joint({ lanes: '3' }, { lanes: '2' })).toEqual({ pairs: ['0>0', '1>1', '2>1'], crossings: 0 })
  })
})
