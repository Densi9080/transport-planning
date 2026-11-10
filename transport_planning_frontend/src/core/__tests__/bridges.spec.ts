import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { buildScene } from '../scene'
import type { RawDocument } from '../types'

const STEP = 0.001

/** Дорога с запада на восток: подход, мост из двух отрезков, съезд; под мостом тоннель. */
function overpass(): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 2 * STEP },
      { id: 2, lat: 52, lon: 104 - STEP },
      { id: 3, lat: 52, lon: 104 },
      { id: 4, lat: 52, lon: 104 + STEP },
      { id: 5, lat: 52, lon: 104 + 2 * STEP },
      { id: 6, lat: 52 - STEP, lon: 104 - STEP / 2 },
      { id: 7, lat: 52 + STEP, lon: 104 - STEP / 2 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary' } },
      { id: 11, nds: [2, 3], tags: { highway: 'primary', bridge: 'yes', layer: '1' } },
      { id: 12, nds: [3, 4], tags: { highway: 'primary', bridge: 'yes', layer: '1' } },
      { id: 13, nds: [4, 5], tags: { highway: 'primary' } },
      { id: 20, nds: [6, 7], tags: { highway: 'secondary', tunnel: 'yes', layer: '-1' } },
    ],
    relations: [],
  }
}

describe('мосты и тоннели на карте', () => {
  it('у концов моста края отогнуты, на стыке пролётов — нет', () => {
    const raw = overpass()
    const { scene } = buildScene(new OsmDoc(raw), new Projector(raw.bounds))
    const wings = scene.markings.features.filter((feature) => feature.properties?.kind === 'wing')
    // По два крыла на въезде (отрезок 11) и съезде (отрезок 12), на стыке 11 и 12 крыльев нет
    expect(wings.map((feature) => feature.properties?.wayId).sort()).toEqual([11, 11, 12, 12])
    expect(wings.every((feature) => feature.properties?.level === 1)).toBe(true)
  })

  it('крыло уходит от моста наружу', () => {
    const raw = overpass()
    const projector = new Projector(raw.bounds)
    const doc = new OsmDoc(raw)
    const { scene } = buildScene(doc, projector)
    const start = projector.toXY(doc.node(2))
    for (const feature of scene.markings.features.filter((item) => item.properties?.wayId === 11 && item.properties?.kind === 'wing')) {
      const [from, to] = (feature.geometry as GeoJSON.LineString).coordinates.map(([lon, lat]) => projector.toXY({ lat: lat!, lon: lon! }))
      // Мост идёт на восток, значит крыло у западного конца смотрит на запад и в сторону от оси
      expect(to!.x).toBeLessThan(from!.x)
      expect(Math.abs(to!.y - start.y)).toBeGreaterThan(Math.abs(from!.y - start.y))
    }
  })

  it('тоннель рисуется на своём уровне, его кромки отдельно от наземных', () => {
    const raw = overpass()
    const { scene } = buildScene(new OsmDoc(raw), new Projector(raw.bounds))
    const tunnelEdges = scene.markings.features.filter((feature) => feature.properties?.wayId === 20 && feature.properties?.kind === 'edge')
    expect(tunnelEdges.length).toBe(2)
    expect(tunnelEdges.every((feature) => feature.properties?.level === -1)).toBe(true)
  })
})
