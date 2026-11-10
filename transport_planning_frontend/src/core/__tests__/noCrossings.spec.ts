import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { computeArmGeometries, crossingConnectors, junctionConnectors } from '../scene'
import { buildNetwork } from '../topology'
import type { RawDocument } from '../types'

/** Простой разбор .osm регулярками: в тесте важна форма данных, а не парсер. */
function parseFile(path: string): RawDocument {
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

const SAMPLES = ['example', 'kazan-center', 'spb-nevsky', 'spb-pobedy-roundabout', 'minsk-pobedy-roundabout']

/**
 * Строгое правило редактора: траектории с одного подхода никогда не пересекаются — ни на карте,
 * ни в микромодели. Проверяется на всех участках из samples.
 */
describe('траектории одного подхода не пересекаются', () => {
  for (const name of SAMPLES) {
    it(name, () => {
      const raw = parseFile(resolve(__dirname, `../../../../transport_planning/samples/${name}.osm`))
      const doc = new OsmDoc(raw)
      const network = buildNetwork(doc, new Projector(raw.bounds))
      const geometries = computeArmGeometries(network)
      const found: string[] = []
      for (const [node, arms] of network.arms) {
        if (arms.length < 2) continue
        for (const [a, b] of crossingConnectors(junctionConnectors(doc, node, arms, geometries))) {
          found.push(`узел ${node}: ${a.kind} ${a.fromLane}>${a.toLane} и ${b.kind} ${b.fromLane}>${b.toLane}`)
        }
      }
      expect(found).toEqual([])
    }, 60_000)
  }
})
