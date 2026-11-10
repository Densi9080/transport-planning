import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { buildStopHierarchy, createStopForArea, moveAreaToStop, stopIssues, withStopArea } from '../stops'
import type { RawDocument } from '../types'

const M = 1 / 111_320

function setup(): { doc: OsmDoc; projector: Projector } {
  const raw: RawDocument = {
    bounds: { minlat: 52, minlon: 104, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104, tags: { public_transport: 'stop_position', name: 'Площадь, сев.' } },
      { id: 2, lat: 52 + 30 * M, lon: 104, tags: { public_transport: 'stop_position', name: 'Площадь, юж.' } },
      { id: 10, lat: 52 + 3 * M, lon: 104 + 8 * M, tags: { public_transport: 'platform' } },
      { id: 11, lat: 52 + 33 * M, lon: 104 + 8 * M, tags: { public_transport: 'platform' } },
      // Одинокий пункт без остановки: зона ищется по расстоянию
      { id: 3, lat: 52 + 500 * M, lon: 104, tags: { highway: 'bus_stop' } },
      { id: 12, lat: 52 + 520 * M, lon: 104, tags: { public_transport: 'platform' } },
      { id: 4, lat: 52 + 900 * M, lon: 104, tags: { public_transport: 'stop_position' } },
    ],
    ways: [],
    relations: [
      { id: 100, members: [['node', 1, 'stop'], ['node', 2, 'stop'], ['node', 10, 'platform'], ['node', 11, 'platform']], tags: { type: 'public_transport', public_transport: 'stop_area', name: 'Площадь' } },
    ],
  }
  return { doc: new OsmDoc(raw), projector: new Projector(raw.bounds) }
}

describe('иерархия остановок', () => {
  it('пункт входит в ближайшую зону своей остановки, зона — в остановку', () => {
    const { doc, projector } = setup()
    const h = buildStopHierarchy(doc, projector)
    expect(h.points.get(1)!.area).toBe('node/10')
    expect(h.points.get(2)!.area).toBe('node/11')
    expect(h.areas.get('node/10')!.stop).toBe(100)
    expect(h.stops.get(100)!.areas).toEqual(['node/10', 'node/11'])
    expect(h.stops.get(100)!.points.sort()).toEqual([1, 2])
  })

  it('вне остановок зона ищется в радиусе, дальше пункт остаётся без зоны', () => {
    const { doc, projector } = setup()
    const h = buildStopHierarchy(doc, projector)
    expect(h.points.get(3)!.area).toBe('node/12')
    expect(h.points.get(4)!.area).toBeNull()
  })

  it('явная привязка важнее расстояния', () => {
    const { doc, projector } = setup()
    doc.begin('тест')
    doc.putNode({ ...doc.node(1), tags: withStopArea(doc.node(1).tags, 'node/11') })
    doc.commit()
    const h = buildStopHierarchy(doc, projector)
    expect(h.points.get(1)).toMatchObject({ area: 'node/11', explicit: true })
    expect(h.areas.get('node/10')!.points).toEqual([])
  })

  it('зона переходит в другую остановку и может стать новой остановкой', () => {
    const { doc, projector } = setup()
    doc.begin('тест')
    const id = createStopForArea(doc, buildStopHierarchy(doc, projector), 'node/12', 'Школа')
    doc.commit()
    let h = buildStopHierarchy(doc, projector)
    expect(h.areas.get('node/12')!.stop).toBe(id)
    expect(h.stops.get(id)!.points).toEqual([3])
    doc.begin('тест')
    moveAreaToStop(doc, 'node', 12, 100)
    doc.commit()
    h = buildStopHierarchy(doc, projector)
    expect(h.areas.get('node/12')!.stop).toBe(100)
    expect(doc.relations.get(id)!.members.some(([, ref]) => ref === 12)).toBe(false)
  })

  it('нарушения иерархии перечисляются', () => {
    const { doc, projector } = setup()
    const kinds = stopIssues(buildStopHierarchy(doc, projector)).map((issue) => `${issue.kind}:${issue.target.id}`)
    expect(kinds).toContain('point-without-area:4')
    expect(kinds).toContain('area-without-stop:12')
    expect(kinds).not.toContain('stop-without-points:100')
  })
})
