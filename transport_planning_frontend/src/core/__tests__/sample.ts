import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { RawDocument } from '../types'

const SAMPLE = resolve(__dirname, '../../../../transport_planning/samples/example.osm')

/** Простой разбор регулярками: в тесте важна форма данных, а не парсер. */
export function parseSample(): RawDocument {
  const xml = readFileSync(SAMPLE, 'utf8')
  const attribute = (text: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(text)?.[1] ?? ''
  const tagsOf = (body: string) => {
    const tags: Record<string, string> = {}
    for (const match of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)) tags[match[1]!] = match[2]!
    return tags
  }
  const nodes: RawDocument['nodes'] = []
  for (const match of xml.matchAll(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
    nodes.push({
      id: Number(attribute(match[1]!, 'id')),
      lat: Number(attribute(match[1]!, 'lat')),
      lon: Number(attribute(match[1]!, 'lon')),
      tags: tagsOf(match[3] ?? ''),
    })
  }
  const ways: RawDocument['ways'] = []
  for (const match of xml.matchAll(/<way ([^>]*?)>([\s\S]*?)<\/way>/g)) {
    ways.push({
      id: Number(attribute(match[1]!, 'id')),
      nds: [...match[2]!.matchAll(/<nd ref="(\d+)"/g)].map((nd) => Number(nd[1])),
      tags: tagsOf(match[2]!),
    })
  }
  const relations: RawDocument['relations'] = []
  for (const match of xml.matchAll(/<relation ([^>]*?)>([\s\S]*?)<\/relation>/g)) {
    relations.push({
      id: Number(attribute(match[1]!, 'id')),
      members: [...match[2]!.matchAll(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"/g)].map(
        (m) => [m[1] as 'way', Number(m[2]), m[3]!],
      ),
      tags: tagsOf(match[2]!),
    })
  }
  return {
    bounds: { minlat: 52.25113, minlon: 104.25656, maxlat: 52.26942, maxlon: 104.2677 },
    nodes,
    ways,
    relations,
  }
}
