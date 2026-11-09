import type { Feature } from 'geojson'

import { offsetPolyline, trimPolyline } from './geo'
import { laneOffsets } from './lanes'
import { armsByLink, computeArmGeometries } from './scene'
import type { Network } from './topology'
import type { XY } from './types'

/** Каждая полоса как отдельная линия по направлению движения: так сеть выглядит вблизи. */
export function laneLineFeatures(network: Network): Feature[] {
  const features: Feature[] = []
  const geometries = computeArmGeometries(network)
  const ends = armsByLink(network)
  const projector = network.projector

  for (const link of network.links) {
    const arms = ends.get(link)
    const fromStart = arms?.start ? (geometries.get(arms.start)?.trim ?? 0) : 0
    const fromEnd = arms?.end ? (geometries.get(arms.end)?.trim ?? 0) : 0
    const offsets = laneOffsets(link.profile)
    const add = (offset: number, lane: number, forward: boolean): void => {
      const line: XY[] = trimPolyline(offsetPolyline(link.points, offset), fromStart, fromEnd)
      if (line.length < 2) return
      const ordered = forward ? line : [...line].reverse()
      features.push({
        type: 'Feature',
        properties: { way: link.wayId, lane, forward },
        geometry: { type: 'LineString', coordinates: ordered.map((point) => projector.toLngLat(point)) },
      })
    }
    offsets.forward.forEach((offset, lane) => add(offset, lane, true))
    offsets.backward.forEach((offset, lane) => add(offset, lane, false))
  }
  return features
}
