import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { nodeConnectors } from '../laneOps'
import type { RawDocument, Tags } from '../types'

const M = 1 / 111_320

/**
 * Правила полос по ПДД (п. 8.5): направо с крайней правой, налево с крайней левой, прямо со всех.
 * Правила работают для любого загруженного файла: в .osm ничего дописывать не нужно.
 */
function junction(approachTags: Tags, exits: { id: number; lat: number; lon: number }[]): RawDocument {
  return {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 100 * M },
      { id: 2, lat: 52, lon: 104 },
      ...exits.map((e) => ({ id: e.id, lat: e.lat, lon: e.lon })),
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', oneway: 'yes', lanes: '3', ...approachTags } },
      ...exits.map((e) => ({ id: 100 + e.id, nds: [2, e.id], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } })),
    ],
    relations: [],
  }
}

function lanes(raw: RawDocument): Record<number, number[]> {
  const doc = new OsmDoc(raw)
  const result: Record<number, number[]> = {}
  for (const c of nodeConnectors(doc, new Projector(raw.bounds), 2).connectors) {
    result[c.to.neighbor] = [...(result[c.to.neighbor] ?? []), c.fromLane].sort()
  }
  return result
}

describe('правила полос ПДД', () => {
  const east = { id: 3, lat: 52, lon: 104 + 100 * M }
  const south = { id: 4, lat: 52 - 100 * M, lon: 104 }
  const north = { id: 5, lat: 52 + 100 * M, lon: 104 }
  // Развилка: съезд уходит вправо под 25 градусов
  const forkRight = { id: 6, lat: 52 - 100 * M * Math.sin((25 * Math.PI) / 180), lon: 104 + 100 * M * Math.cos((25 * Math.PI) / 180) }

  it('без разметки: направо с крайней правой, налево с крайней левой, прямо со всех', () => {
    expect(lanes(junction({}, [east, south, north]))).toEqual({ 3: [0, 1, 2], 4: [2], 5: [0] })
  })

  it('на развилке «прямо» только в самый прямой выезд, правый съезд — с крайней правой', () => {
    expect(lanes(junction({}, [east, forkRight]))).toEqual({ 3: [0, 1, 2], 6: [2] })
  })

  it('крайняя правая без стрелки разрешает поворот направо', () => {
    expect(lanes(junction({ 'turn:lanes': 'left||' }, [east, south, north]))).toEqual({ 3: [1, 2], 4: [2], 5: [0] })
  })

  it('стрелки разметки 1.18 важнее правила крайней полосы', () => {
    expect(lanes(junction({ 'turn:lanes': 'left|through|through' }, [east, south, north]))).toEqual({ 3: [1, 2], 5: [0] })
  })
})
