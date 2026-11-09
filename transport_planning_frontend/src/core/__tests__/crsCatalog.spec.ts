import { describe, expect, it } from 'vitest'

import { checkCrsDefinition, formatPosition, resolveCrs, setCustomCrs, toGaussKruger, toUtm } from '../crs'
import { CRS_CATALOG } from '../crsCatalog'

const POINT = { lat: 52.26712, lon: 104.25785 }

function numbers(text: string): number[] {
  return [...text.matchAll(/-?\d+\.\d+/g)].map((match) => Number(match[0]))
}

describe('каталог систем координат', () => {
  it('коды не повторяются', () => {
    expect(new Set(CRS_CATALOG.map((entry) => entry.id)).size).toBe(CRS_CATALOG.length)
  })

  it('UTM из каталога совпадает с собственной формулой', () => {
    const [easting, northing] = numbers(formatPosition(POINT, 'EPSG:32648', null))
    const own = toUtm(POINT)
    expect(easting).toBeCloseTo(own.easting, 0)
    expect(northing).toBeCloseTo(own.northing, 0)
  })

  it('Гаусс — Крюгер зоны 18 близок к собственной формуле', () => {
    const [x, y] = numbers(formatPosition(POINT, 'EPSG:28418', null))
    const own = toGaussKruger(POINT)
    expect(Math.abs(x! - own.x)).toBeLessThan(1)
    expect(Math.abs(y! - own.y)).toBeLessThan(1)
  })

  it('своя система проверяется и находится по коду', () => {
    const def = '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=500000 +y_0=0 +ellps=krass +units=m +no_defs'
    expect(checkCrsDefinition(def, POINT).ok).toBe(true)
    setCustomCrs([{ id: 'USER:100001', name: 'Своя', group: 'Свои', def, custom: true }])
    expect(resolveCrs('USER:100001')?.name).toBe('Своя')
    expect(formatPosition(POINT, 'USER:100001', null)).toMatch(/^E /)
    setCustomCrs([])
  })

  it('неверные параметры не принимаются', () => {
    expect(checkCrsDefinition('чепуха', POINT).ok).toBe(false)
    expect(checkCrsDefinition('', POINT).ok).toBe(false)
  })

  it('старые значения настроек понимаются', () => {
    expect(resolveCrs('wgs84')?.id).toBe('EPSG:4326')
    expect(resolveCrs('gk42')?.id).toBe('EPSG:28418')
  })
})
