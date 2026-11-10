import { describe, expect, it } from 'vitest'

import { buildSimNet, signalGroupAt } from '@/sim/net'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { isSignalNode, toggledCrossingTags, toggledSignalTags } from '../nodeKinds'
import { toggleNodeHighway } from '../ops'
import { buildNetwork } from '../topology'
import type { RawDocument } from '../types'

/** Прямая улица в 200 м с пешеходным переходом посередине, без перекрёстка. */
function street(crossingTags: Record<string, string>): RawDocument {
  return {
    bounds: { minlat: 52.25, minlon: 104.25, maxlat: 52.26, maxlon: 104.27 },
    nodes: [
      { id: 1, lat: 52.255, lon: 104.255, tags: {} },
      { id: 2, lat: 52.255, lon: 104.2565, tags: crossingTags },
      { id: 3, lat: 52.255, lon: 104.258, tags: {} },
    ],
    ways: [{ id: 10, nds: [1, 2, 3], tags: { highway: 'secondary', lanes: '2', maxspeed: '60' } }],
    relations: [],
  }
}

describe('светофор на пешеходном переходе без перекрёстка', () => {
  it('светофор на переходе делает его регулируемым и не стирает переход', () => {
    const on = toggledSignalTags({ highway: 'crossing', crossing: 'uncontrolled' })
    expect(on.enabled).toBe(true)
    expect(on.tags).toMatchObject({ highway: 'traffic_signals', crossing: 'traffic_signals', 'crossing:signals': 'yes' })
    const off = toggledSignalTags(on.tags)
    expect(off.enabled).toBe(false)
    expect(off.tags).toEqual({ highway: 'crossing', crossing: 'uncontrolled' })
    // Переход на светофоре: светофор остаётся
    expect(toggledCrossingTags({ highway: 'traffic_signals' }).tags).toMatchObject({ highway: 'traffic_signals', crossing: 'traffic_signals' })
  })

  it('переход из OSM с crossing=traffic_signals считается светофором', () => {
    expect(isSignalNode({ highway: 'crossing', crossing: 'traffic_signals' })).toBe(true)
    expect(isSignalNode({ highway: 'crossing', crossing: 'uncontrolled' })).toBe(false)
  })

  it('узел перехода становится узлом сети с двумя подходами, а дорога через него идёт без разрыва', () => {
    const raw = street({ highway: 'crossing', crossing: 'uncontrolled' })
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    expect(buildNetwork(doc, projector).arms.get(2)).toBeUndefined()
    doc.transact('Светофор', () => toggleNodeHighway(doc, 2, 'traffic_signals'))
    const network = buildNetwork(doc, projector)
    expect(network.arms.get(2)?.length).toBe(2)
    expect(network.links.filter((link) => link.wayId === 10).length).toBe(2)
  })

  it('получает план с пешеходной фазой, а машины в обе стороны стоят на одной фазе', () => {
    const raw = street({ highway: 'crossing', crossing: 'traffic_signals' })
    const doc = new OsmDoc(raw)
    const group = signalGroupAt(buildSimNet(doc, new Projector(raw.bounds), false), 2)
    expect(group).not.toBeNull()
    expect(group!.plan.phases).toHaveLength(2)
    expect(group!.plan.phases[1]).toMatchObject({ pedestrian: true, movements: [] })
    const through = new Set(group!.connectors.filter((c) => c.kind === 'through').map((c) => c.movement))
    expect(through.size).toBe(2)
    for (const movement of through) expect(group!.plan.phases[0]!.movements).toContain(movement)
  })
})
