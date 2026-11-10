import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { Projector } from '@/core/geo'
import { parseSample } from '@/core/__tests__/sample'
import { createZone, countedVolume, JOBS_TAG, laneVolumes, readUserZones, RESIDENTS_TAG, withLaneVolume } from '@/core/zones'

import { estimateZonePopulation, runMacro } from '../macro'
import { buildSimNet } from '../net'

describe('интенсивность по полосам', () => {
  it('пишется по полосам и суммируется по направлению', () => {
    let tags: Record<string, string> = { highway: 'primary', lanes: '4' }
    tags = withLaneVolume(tags, true, 0, '420')
    tags = withLaneVolume(tags, true, 1, '380')
    expect(tags['tp:volume:lanes:forward']).toBe('420|380')
    expect(laneVolumes(tags, true)).toEqual([420, 380])
    expect(countedVolume(tags, true)).toBe(800)
    expect(countedVolume(tags, false)).toBeNull()
    tags = withLaneVolume(withLaneVolume(tags, true, 0, ''), true, 1, '')
    expect(tags['tp:volume:lanes:forward']).toBeUndefined()
  })

  it('на одностороннем отрезке хранится без направления', () => {
    const tags = withLaneVolume({ highway: 'secondary', oneway: 'yes', lanes: '2' }, true, 1, '300')
    expect(tags['tp:volume:lanes']).toBe('|300')
    expect(laneVolumes(tags, true)).toEqual([null, 300])
  })
})

describe('районы с жителями в макромодели', () => {
  const raw = parseSample()

  /** Квадрат 400 × 400 м вокруг центра участка. */
  function square(doc: OsmDoc, projector: Projector) {
    const center = projector.toXY({ lat: (raw.bounds.minlat + raw.bounds.maxlat) / 2, lon: (raw.bounds.minlon + raw.bounds.maxlon) / 2 })
    return [
      { x: center.x - 200, y: center.y - 200 },
      { x: center.x + 200, y: center.y - 200 },
      { x: center.x + 200, y: center.y + 200 },
      { x: center.x - 200, y: center.y + 200 },
    ].map((point) => projector.toLatLon(point))
  }

  it('район заменяет застройку внутри и даёт спрос от жителей', () => {
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const before = runMacro(doc, buildSimNet(doc, projector, false), { period: 'morning', demand: 1 })

    doc.begin('район')
    const id = createZone(doc, square(doc, projector), { name: 'Студгородок', [RESIDENTS_TAG]: '6000', [JOBS_TAG]: '500' })
    doc.commit()
    const zone = readUserZones(doc, projector)[0]!
    expect(zone).toMatchObject({ wayId: id, name: 'Студгородок', residents: 6000, jobs: 500 })

    const after = runMacro(doc, buildSimNet(doc, projector, false), { period: 'morning', demand: 1 })
    const user = after.zones.find((item) => item.userWay === id)
    expect(user).toBeDefined()
    // Утром жители уезжают: отправление района больше прибытия
    expect(user!.production).toBeGreaterThan(user!.attraction)
    expect(user!.production).toBeCloseTo(6000 * 25 * 0.0035 + 500 * 30 * 0.005 * 0.1, 3)
    // Спрос районов из застройки уменьшился: дома внутри контура считаются только через жителей
    const auto = (result: typeof before) =>
      result.zones.filter((item) => item.kind === 'internal' && item.userWay === undefined).reduce((sum, item) => sum + item.production, 0)
    expect(auto(after)).toBeLessThan(auto(before))
    expect(after.flows.some((flow) => flow.from.userWay === id)).toBe(true)
  })

  it('оценка по застройке находит жителей в жилых домах', () => {
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const polygon = square(doc, projector).map((point) => projector.toXY(point))
    const estimate = estimateZonePopulation(doc, projector, polygon)
    expect(estimate.residents + estimate.jobs).toBeGreaterThan(0)
  })

  it('интенсивность на въезде задаёт поток въезда вместо оценки', () => {
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const base = runMacro(doc, buildSimNet(doc, projector, false), { period: 'morning', demand: 1 })
    const gateway = base.zones.find((zone) => zone.kind === 'gateway' && zone.production > 0)!
    // Ставим 111 авт/ч на каждую полосу всех отрезков, выходящих из этого въезда
    const net = buildSimNet(doc, projector, false)
    const edges = net.edges.filter((edge) => edge.from === gateway.node)
    doc.begin('интенсивность')
    for (const edge of edges) {
      let tags = doc.way(edge.link.wayId).tags ?? {}
      laneVolumes(tags, edge.forward).forEach((_, lane) => (tags = withLaneVolume(tags, edge.forward, lane, '111')))
      doc.putWay({ ...doc.way(edge.link.wayId), tags })
    }
    doc.commit()
    const counted = runMacro(doc, buildSimNet(doc, projector, false), { period: 'morning', demand: 1 })
    const same = counted.zones.find((zone) => zone.kind === 'gateway' && zone.node === gateway.node)!
    const lanes = edges.reduce((sum, edge) => sum + edge.lanes.length, 0)
    expect(same.production).toBeCloseTo(111 * lanes, 0)
  })
})
