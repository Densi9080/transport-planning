import proj4 from 'proj4'
import { describe, expect, it } from 'vitest'

import { formatPosition } from '@/core/crs'
import { CRS_CATALOG } from '@/core/crsCatalog'

import {
  ellipsoidMercatorRow,
  ellipsoidTileUrl,
  fillTemplate,
  latitudeOfWebMercatorRow,
  sourceRows,
} from '../ellipsoidMercator'
import { basemapSource, guessTileCrs } from '../style'

const R = 6378137
const IRKUTSK = { lat: 52.26712, lon: 104.25785 }
const DEF_3395 = CRS_CATALOG.find((entry) => entry.id === 'EPSG:3395')!.def!

/** Северная координата из строки пикселей: так формулы сверяются с proj4. */
function northingOfRow(row: number, worldPx: number): number {
  return (1 - (2 * row) / worldPx) * Math.PI * R
}

describe('EPSG:3395 (Яндекс)', () => {
  it('есть в каталоге и показывается в метрах', () => {
    const text = formatPosition(IRKUTSK, 'EPSG:3395', null)
    const northing = Number(/N ([\d.]+)/.exec(text)?.[1])
    const [, expected] = proj4('EPSG:4326', DEF_3395, [IRKUTSK.lon, IRKUTSK.lat])
    expect(northing).toBeCloseTo(expected!, 0)
  })

  it('строка пикселей совпадает с proj4', () => {
    const worldPx = 256 * 2 ** 17
    const row = ellipsoidMercatorRow((IRKUTSK.lat * Math.PI) / 180, worldPx)
    const [, expected] = proj4('EPSG:4326', DEF_3395, [IRKUTSK.lon, IRKUTSK.lat])
    expect(northingOfRow(row, worldPx)).toBeCloseTo(expected!, 1)
  })

  it('широта строки 3857 обратна прямой формуле', () => {
    const worldPx = 256 * 2 ** 15
    const lat = (IRKUTSK.lat * Math.PI) / 180
    const row = ((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2) * worldPx
    expect(latitudeOfWebMercatorRow(row, worldPx)).toBeCloseTo(lat, 12)
  })

  it('без пересчёта подложка в Иркутске съехала бы на ~20,7 км к югу', () => {
    const lat = (IRKUTSK.lat * Math.PI) / 180
    const worldPx = 256 * 2 ** 17
    const sphere = ((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2) * worldPx
    const metersPerPx = (2 * Math.PI * R * Math.cos(lat)) / worldPx
    const shift = (ellipsoidMercatorRow(lat, worldPx) - sphere) * metersPerPx
    expect(shift).toBeGreaterThan(20_500)
    expect(shift).toBeLessThan(20_900)
  })

  it('строки выходного тайла берутся из одного-двух соседних тайлов 3395 подряд', () => {
    const z = 17
    const y = Math.floor(((1 - Math.log(Math.tan(Math.PI / 4 + (IRKUTSK.lat * Math.PI) / 360)) / Math.PI) / 2) * 2 ** z)
    const rows = sourceRows(z, y, 256)
    const tiles = [...new Set(rows.map((row) => row.tile))]
    expect(tiles.length).toBeLessThanOrEqual(2)
    expect(tiles[0]).toBeGreaterThan(y)
    // Порядок строк сохраняется: картинка не переворачивается и не рвётся
    const positions = rows.map((row) => row.tile + row.offset)
    for (let i = 1; i < positions.length; i++) expect(positions[i]!).toBeGreaterThan(positions[i - 1]!)
  })

  it('адрес тайлов кодируется так, что MapLibre подставляет только свои z/x/y', () => {
    const template = 'https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}'
    const url = ellipsoidTileUrl(template)
    expect(url.startsWith('merc3395://{z}/{x}/{y}/')).toBe(true)
    expect(url.slice('merc3395://{z}/{x}/{y}/'.length)).not.toContain('{')
    expect(fillTemplate(template, 17, 1, 2)).toBe('https://core-sat.maps.yandex.net/tiles?l=sat&x=1&y=2&z=17')
  })

  it('проекция своего адреса угадывается и применяется', () => {
    expect(guessTileCrs('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}')).toBe('EPSG:3395')
    expect(guessTileCrs('https://tile.openstreetmap.org/{z}/{x}/{y}.png')).toBe('EPSG:3857')
    const url = 'https://example.org/{z}/{x}/{y}.png'
    expect(basemapSource('custom', url, 'EPSG:3857')[0]!.tiles).toEqual([url])
    expect(basemapSource('custom', url, 'EPSG:3395')[0]!.tiles![0]).toMatch(/^merc3395:/)
    expect(basemapSource('custom', 'https://example.org/tiles.png', 'EPSG:3857')).toEqual([])
    expect(basemapSource('yandexSat', '', 'EPSG:3857')[0]!.tiles![0]).toMatch(/^merc3395:/)
  })
})
