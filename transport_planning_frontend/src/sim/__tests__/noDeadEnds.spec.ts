import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { Projector } from '@/core/geo'
import type { RawDocument } from '@/core/types'
import { buildSimNet } from '@/sim/net'

export function parseFile(path: string): RawDocument {
  const xml = readFileSync(path, 'utf8')
  const attr = (t: string, n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(t)?.[1] ?? ''
  const tagsOf = (b: string) => Object.fromEntries([...b.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]))
  const nodes = [...xml.matchAll(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)].map((m) => ({ id: Number(attr(m[1]!, 'id')), lat: Number(attr(m[1]!, 'lat')), lon: Number(attr(m[1]!, 'lon')), tags: tagsOf(m[3] ?? '') }))
  const ways = [...xml.matchAll(/<way ([^>]*?)>([\s\S]*?)<\/way>/g)].map((m) => ({ id: Number(attr(m[1]!, 'id')), nds: [...m[2]!.matchAll(/<nd ref="(-?\d+)"/g)].map((n) => Number(n[1])), tags: tagsOf(m[2]!) }))
  const relations = [...xml.matchAll(/<relation ([^>]*?)>([\s\S]*?)<\/relation>/g)].map((m) => ({
    id: Number(attr(m[1]!, 'id')),
    members: [...m[2]!.matchAll(/<member type="(\w+)" ref="(-?\d+)" role="([^"]*)"/g)].map((x) => [x[1] as 'way', Number(x[2]), x[3]!] as ['way', number, string]),
    tags: tagsOf(m[2]!),
  }))
  const b = /<bounds ([^>]*)\/>/.exec(xml)
  const bounds = b
    ? { minlat: +attr(b[1]!, 'minlat'), minlon: +attr(b[1]!, 'minlon'), maxlat: +attr(b[1]!, 'maxlat'), maxlon: +attr(b[1]!, 'maxlon') }
    : { minlat: 52.25113, minlon: 104.25656, maxlat: 52.26942, maxlon: 104.2677 }
  return { bounds, nodes, ways, relations }
}

/** Полосы, которые упираются в узел и никуда не ведут, хотя из узла есть выезды. */
function deadEnds(raw: RawDocument): string[] {
  const doc = new OsmDoc(raw)
  const net = buildSimNet(doc, new Projector(raw.bounds), false)
  const found: string[] = []
  for (const edge of net.edges) {
    const exits = (net.outgoing.get(edge.to) ?? []).filter((out) => out.link !== edge.link)
    if (exits.length === 0) continue
    for (const lane of edge.lanes) {
      if (lane.connectors.length === 0) found.push(`узел ${edge.to}: дорога ${edge.wayId} полоса ${lane.index + 1}/${edge.lanes.length}`)
    }
  }
  return found
}

/**
 * В микромодели полоса не обрывается в узле: ни на развилке, где соседний выезд только для автобусов,
 * ни на съезде, чей запрет «только прямо» ссылается на дорогу за границей выгрузки.
 */
describe('в микромодели нет обрывающихся полос', () => {
  it('example.osm', () => {
    expect(deadEnds(parseFile(resolve(__dirname, '../../../../transport_planning/samples/example.osm')))).toEqual([])
  }, 60_000)

  it('полоса, чей выезд закрыт для машин, едет туда же, куда соседняя', () => {
    // Двухполосная дорога расходится: левая полоса по разметке в автобусный съезд, правая прямо
    const raw: RawDocument = {
      bounds: { minlat: 52.25, minlon: 104.25, maxlat: 52.26, maxlon: 104.27 },
      nodes: [
        { id: 1, lat: 52.255, lon: 104.252 },
        { id: 2, lat: 52.255, lon: 104.255 },
        { id: 3, lat: 52.255, lon: 104.258 },
        { id: 4, lat: 52.2558, lon: 104.258 },
      ],
      ways: [
        { id: 10, nds: [1, 2], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'slight_left|through' } },
        { id: 11, nds: [2, 3], tags: { highway: 'primary', oneway: 'yes', lanes: '1' } },
        { id: 12, nds: [2, 4], tags: { highway: 'primary_link', oneway: 'yes', lanes: '1', motor_vehicle: 'no', psv: 'yes' } },
      ],
      relations: [],
    }
    expect(deadEnds(raw)).toEqual([])
  })

  it('двусторонний проезд с lanes=1 проезжается в обе стороны', () => {
    const raw: RawDocument = {
      bounds: { minlat: 52.25, minlon: 104.25, maxlat: 52.26, maxlon: 104.27 },
      nodes: [
        { id: 1, lat: 52.255, lon: 104.252 },
        { id: 2, lat: 52.255, lon: 104.255 },
      ],
      ways: [{ id: 10, nds: [1, 2], tags: { highway: 'service', lanes: '1' } }],
      relations: [],
    }
    const net = buildSimNet(new OsmDoc(raw), new Projector(raw.bounds), false)
    expect(net.edges.map((edge) => edge.forward).sort()).toEqual([false, true])
  })
})
