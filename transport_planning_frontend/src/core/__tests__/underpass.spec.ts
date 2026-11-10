import { describe, expect, it } from 'vitest'

import { wayHeights } from '../elevation'
import { OsmDoc } from '../doc'
import { dist, Projector } from '../geo'
import { parseProfile, totalWidth } from '../lanes'
import { tunnelUnderBridge } from '../underpass'
import type { RawDocument } from '../types'
import { validate } from '../validate'

/** Мост с запада на восток над дорогой с юга на север; у моста подходы на земле. */
function scene(): RawDocument {
  return {
    bounds: { minlat: 52.25, minlon: 104.25, maxlat: 52.26, maxlon: 104.27 },
    nodes: [
      { id: 1, lat: 52.255, lon: 104.252 },
      { id: 2, lat: 52.255, lon: 104.2545 },
      { id: 3, lat: 52.255, lon: 104.2555 },
      { id: 4, lat: 52.255, lon: 104.258 },
      { id: 5, lat: 52.2535, lon: 104.255 },
      { id: 6, lat: 52.2565, lon: 104.255 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary', lanes: '4' } },
      { id: 11, nds: [2, 3], tags: { highway: 'secondary', lanes: '4', bridge: 'yes', layer: '1' } },
      { id: 12, nds: [3, 4], tags: { highway: 'secondary', lanes: '4' } },
      { id: 20, nds: [5, 6], tags: { highway: 'primary', lanes: '2', oneway: 'yes' } },
    ],
    relations: [],
  }
}

describe('тоннель под мостом', () => {
  it('режет дорогу по краям настила и ставит tunnel=yes, layer=-1 только куску под мостом', () => {
    const raw = scene()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const result = doc.transact('Тоннель', () => tunnelUnderBridge(doc, projector, 11))
    expect(result.crossed).toEqual([20])
    expect(result.tunnels).toHaveLength(1)
    const tunnel = doc.way(result.tunnels[0]!)
    expect(tunnel.tags).toMatchObject({ highway: 'primary', lanes: '2', oneway: 'yes', tunnel: 'yes', layer: '-1' })
    const length = dist(projector.toXY(doc.node(tunnel.nds[0]!)), projector.toXY(doc.node(tunnel.nds.at(-1)!)))
    const deck = totalWidth(parseProfile(doc.way(11).tags ?? {}))
    expect(length).toBeGreaterThan(deck)
    expect(length).toBeLessThan(deck + 10)
    // Остальная дорога на земле, направление сохранилось
    const ground = [...doc.ways.values()].filter((way) => way.tags?.highway === 'primary' && !way.tags.tunnel)
    expect(ground).toHaveLength(2)
    expect(doc.node(ground.find((way) => way.nds[0] === 5)!.nds[0]!).lat).toBeLessThan(52.255)
    // Концы тоннеля примыкают к дороге того же направления: это не ошибка склейки уровней
    expect(validate(doc, projector).filter((issue) => issue.code === 'glued_levels')).toEqual([])
    // Повтор ничего не меняет
    expect(doc.transact('Ещё раз', () => tunnelUnderBridge(doc, projector, 11)).tunnels).toEqual([])
  })

  it('мост стоит на высоте целиком, подходы поднимаются к нему', () => {
    const doc = new OsmDoc(scene())
    const bridge = wayHeights(doc, doc.way(11))
    expect(Math.min(...bridge.values())).toBeGreaterThan(5)
    expect(wayHeights(doc, doc.way(10)).get(1)).toBeLessThan(1)
    expect(wayHeights(doc, doc.way(10)).get(2)).toBeGreaterThan(5)
  })
})
