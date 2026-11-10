import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { bindPlatform, unboundPlatforms } from '../stopBinding'
import { buildStopHierarchy } from '../stops'
import type { RawDocument } from '../types'
import { validate } from '../validate'
import { parseSample } from './sample'

const M = 1 / 111_320
const LON_M = M / Math.cos((52 * Math.PI) / 180)

/**
 * Улица с запада на восток (дорога 10), перекрёсток в узле 2 с улицей 20.
 * Платформа в 8 м севернее улицы, в маршруте автобуса как platform. Рядом ещё проезд 30 без маршрута.
 */
function street(): RawDocument {
  return {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 },
      { id: 2, lat: 52, lon: 104 + 200 * LON_M },
      { id: 3, lat: 52 - 100 * M, lon: 104 + 200 * LON_M },
      { id: 4, lat: 52 + 6 * M, lon: 104 + 40 * LON_M },
      { id: 5, lat: 52 + 6 * M, lon: 104 + 160 * LON_M },
      { id: 50, lat: 52 + 8 * M, lon: 104 + 100 * LON_M, tags: { highway: 'bus_stop', name: 'Школа' } },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary' } },
      { id: 20, nds: [2, 3], tags: { highway: 'residential' } },
      // Проезд ближе к платформе, но автобус по нему не ходит
      { id: 30, nds: [4, 5], tags: { highway: 'service' } },
    ],
    relations: [
      { id: 900, members: [['way', 10, ''], ['way', 20, ''], ['node', 50, 'platform']], tags: { type: 'route', route: 'bus', ref: '7' } },
    ],
  }
}

describe('привязка остановок к графу', () => {
  it('находит платформу без пункта и ставит пункт на дорогу её маршрута', () => {
    const raw = street()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const [binding, ...rest] = unboundPlatforms(doc, projector)
    expect(rest).toEqual([])
    expect(binding).toMatchObject({ platform: 50, wayId: 10, routesOffRoad: [] })
    expect(binding!.distanceM).toBeCloseTo(8, 0)

    doc.begin('тест')
    const stop = bindPlatform(doc, projector, binding!)
    doc.commit()

    expect(doc.way(10).nds).toContain(stop)
    expect(doc.node(stop).tags).toMatchObject({ public_transport: 'stop_position', bus: 'yes', name: 'Школа', 'tp:stop_area': 'node/50' })
    expect(doc.node(50).tags?.public_transport).toBe('platform')
    // В маршруте пункт идёт перед платформой, как в PTv2
    const members = doc.relations.get(900)!.members.filter(([type]) => type === 'node')
    expect(members).toEqual([['node', stop, 'stop'], ['node', 50, 'platform']])
    // Создана остановка с зоной и пунктом
    const hierarchy = buildStopHierarchy(doc, projector)
    expect(hierarchy.points.get(stop)?.area).toBe('node/50')
    expect(hierarchy.areas.get('node/50')?.stop).not.toBeNull()
    expect(unboundPlatforms(doc, projector)).toEqual([])
  })

  it('не ставит пункт в узел перекрёстка', () => {
    const raw = street()
    raw.nodes.find((node) => node.id === 50)!.lon = 104 + 199 * LON_M
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const binding = unboundPlatforms(doc, projector)[0]!
    const junction = projector.toXY(doc.node(2))
    expect(Math.hypot(binding.point.x - junction.x, binding.point.y - junction.y)).toBeGreaterThanOrEqual(5.9)
    expect(binding.reuseNode).toBeNull()
  })

  it('проверка сети предлагает привязку и после неё молчит', () => {
    const raw = street()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const issue = validate(doc, projector).find((item) => item.code === 'stop_unbound')
    expect(issue?.fix).toBeDefined()
    doc.begin('тест')
    issue!.fix!()
    doc.commit()
    expect(validate(doc, projector).some((item) => item.code === 'stop_unbound')).toBe(false)
  })

  it('в примере все автобусные платформы получают пункты на дорогах своих маршрутов', () => {
    const raw = parseSample()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const bindings = unboundPlatforms(doc, projector)
    expect(bindings.length).toBeGreaterThanOrEqual(8)
    for (const binding of bindings) expect(binding.distanceM).toBeLessThan(35)
    doc.begin('тест')
    for (const binding of bindings) bindPlatform(doc, projector, binding)
    doc.commit()
    expect(unboundPlatforms(doc, projector)).toEqual([])
  })
})

describe('выбор дороги для пункта', () => {
  it('берёт дорогу большинства маршрутов, а не ближайший съезд', () => {
    const raw = street()
    // Съезд 40 ближе к платформе, по нему идёт только маршрут 901; по улице 10 — 900 и 902
    raw.nodes.push({ id: 6, lat: 52 + 5 * M, lon: 104 + 80 * LON_M }, { id: 7, lat: 52 + 5 * M, lon: 104 + 120 * LON_M })
    raw.ways.push({ id: 40, nds: [6, 7], tags: { highway: 'secondary_link' } })
    raw.relations.push(
      { id: 901, members: [['way', 40, ''], ['node', 50, 'platform']], tags: { type: 'route', route: 'bus', ref: '8' } },
      { id: 902, members: [['way', 10, ''], ['node', 50, 'platform']], tags: { type: 'route', route: 'trolleybus', ref: '2' } },
    )
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const binding = unboundPlatforms(doc, projector)[0]!
    expect(binding.wayId).toBe(10)
    expect(binding.routesOffRoad).toEqual([901])
    doc.begin('тест')
    const stop = bindPlatform(doc, projector, binding)
    doc.commit()
    expect(doc.node(stop).tags).toMatchObject({ bus: 'yes', trolleybus: 'yes' })
    expect(doc.relations.get(901)!.members.some(([, ref]) => ref === stop)).toBe(false)
  })
})
