import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { nodeConnectors, setMovementLanes } from '../laneOps'
import type { RawDocument } from '../types'

const M = 1 / 111_320

/** Главная с запада на восток, две полосы в каждую сторону; боковая уходит на юг. */
function setup(mainTags: Record<string, string>) {
  const raw: RawDocument = {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 100 * M },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + 100 * M },
      { id: 4, lat: 52 - 100 * M, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2', ...mainTags } },
      { id: 11, nds: [4, 2], tags: { highway: 'residential' } },
    ],
    relations: [],
  }
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  const rightTurn = () => nodeConnectors(doc, projector, 2).connectors.filter((c) => c.from.neighbor === 1 && c.to.neighbor === 4)
  const run = (allowed: boolean) => {
    doc.begin('тест')
    setMovementLanes(doc, projector, 2, 1, 4, allowed)
    doc.commit()
  }
  return { rightTurn, run }
}

describe('манёвр целиком через соединения полос', () => {
  it('выключение снимает все полосы манёвра, включение возвращает правую', () => {
    const { rightTurn, run } = setup({})
    expect(rightTurn().length).toBeGreaterThan(0)
    run(false)
    expect(rightTurn()).toHaveLength(0)
    run(true)
    expect(rightTurn().map((c) => c.fromLane)).toEqual([1])
  })

  it('манёвр, которого нет в разметке полос, включается с крайней правой', () => {
    const { rightTurn, run } = setup({ 'turn:lanes:forward': 'through|through' })
    expect(rightTurn()).toHaveLength(0)
    run(true)
    expect(rightTurn().map((c) => c.fromLane)).toEqual([1])
  })
})
