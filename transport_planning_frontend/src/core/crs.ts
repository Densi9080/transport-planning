import type { Projector } from './geo'
import type { LatLon } from './types'

/**
 * Системы координат для показа положения. Сам граф всегда хранится в WGS 84,
 * как того требует формат OSM, поэтому выбор системы ничего не меняет в файле.
 */

export type CrsId = 'wgs84' | 'dms' | 'utm' | 'gk42' | 'mercator' | 'local'

export const CRS_OPTIONS: { id: CrsId; label: string; short: string }[] = [
  { id: 'wgs84', label: 'WGS 84, градусы (EPSG:4326)', short: 'WGS 84' },
  { id: 'dms', label: 'WGS 84, градусы и минуты', short: 'WGS 84 ГМС' },
  { id: 'utm', label: 'UTM, WGS 84', short: 'UTM' },
  { id: 'gk42', label: 'Пулково-42, Гаусс — Крюгер', short: 'СК-42' },
  { id: 'mercator', label: 'Web Mercator (EPSG:3857)', short: 'Mercator' },
  { id: 'local', label: 'Локальные метры от центра участка', short: 'Локальная' },
]

interface Ellipsoid {
  a: number
  f: number
}

const WGS84: Ellipsoid = { a: 6_378_137, f: 1 / 298.257223563 }
const KRASOVSKY: Ellipsoid = { a: 6_378_245, f: 1 / 298.3 }

/** Параметры перехода Пулково-42 → WGS 84: м, угловые секунды, млн⁻¹ (EPSG:5044). */
const PULKOVO_TO_WGS84 = { dx: 23.57, dy: -140.95, dz: -79.8, rx: 0, ry: 0.35, rz: 0.79, ppm: -0.22 }

const RAD = Math.PI / 180
const ARCSEC = RAD / 3600

function toEcef(lat: number, lon: number, { a, f }: Ellipsoid): [number, number, number] {
  const e2 = f * (2 - f)
  const sinLat = Math.sin(lat * RAD)
  const cosLat = Math.cos(lat * RAD)
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat)
  return [n * cosLat * Math.cos(lon * RAD), n * cosLat * Math.sin(lon * RAD), n * (1 - e2) * sinLat]
}

function fromEcef([x, y, z]: [number, number, number], { a, f }: Ellipsoid): LatLon {
  const e2 = f * (2 - f)
  const p = Math.hypot(x, y)
  let lat = Math.atan2(z, p * (1 - e2))
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat)
    const n = a / Math.sqrt(1 - e2 * sinLat * sinLat)
    const height = p / Math.cos(lat) - n
    lat = Math.atan2(z, p * (1 - (e2 * n) / (n + height)))
  }
  return { lat: lat / RAD, lon: Math.atan2(y, x) / RAD }
}

/** Обратное преобразование Гельмерта с малыми углами. */
export function wgs84ToPulkovo(point: LatLon): LatLon {
  const { dx, dy, dz, rx, ry, rz, ppm } = PULKOVO_TO_WGS84
  const [x, y, z] = toEcef(point.lat, point.lon, WGS84)
  const u = x - dx
  const v = y - dy
  const w = z - dz
  const scale = 1 + ppm * 1e-6
  const ax = rx * ARCSEC
  const ay = ry * ARCSEC
  const az = rz * ARCSEC
  return fromEcef(
    [(u + az * v - ay * w) / scale, (-az * u + v + ax * w) / scale, (ay * u - ax * v + w) / scale],
    KRASOVSKY,
  )
}

/** Поперечная проекция Меркатора по рядам Крюгера. */
function transverseMercator(
  point: LatLon,
  centralMeridian: number,
  { a, f }: Ellipsoid,
  k0: number,
): { easting: number; northing: number } {
  const e = Math.sqrt(f * (2 - f))
  const n = f / (2 - f)
  const n2 = n * n
  const n3 = n2 * n
  const n4 = n3 * n
  const radius = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64)
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
    (61 * n3) / 240 - (103 * n4) / 140,
    (49561 * n4) / 161280,
  ]
  const sinLat = Math.sin(point.lat * RAD)
  const lambda = (point.lon - centralMeridian) * RAD
  const t = Math.sinh(Math.atanh(sinLat) - e * Math.atanh(e * sinLat))
  const xi = Math.atan2(t, Math.cos(lambda))
  const eta = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t))
  let easting = eta
  let northing = xi
  alpha.forEach((value, index) => {
    const j = 2 * (index + 1)
    easting += value * Math.cos(j * xi) * Math.sinh(j * eta)
    northing += value * Math.sin(j * xi) * Math.cosh(j * eta)
  })
  return { easting: k0 * radius * easting, northing: k0 * radius * northing }
}

export function toUtm(point: LatLon): { zone: number; easting: number; northing: number } {
  const zone = Math.floor((point.lon + 180) / 6) + 1
  const { easting, northing } = transverseMercator(point, zone * 6 - 183, WGS84, 0.9996)
  return { zone, easting: 500_000 + easting, northing: point.lat < 0 ? northing + 10_000_000 : northing }
}

/** Плоские координаты Гаусса — Крюгера: X на север, Y на восток с номером зоны впереди. */
export function toGaussKruger(point: LatLon): { zone: number; x: number; y: number } {
  const local = wgs84ToPulkovo(point)
  const zone = Math.floor(local.lon / 6) + 1
  const { easting, northing } = transverseMercator(local, zone * 6 - 3, KRASOVSKY, 1)
  return { zone, x: northing, y: zone * 1_000_000 + 500_000 + easting }
}

export function toWebMercator(point: LatLon): { x: number; y: number } {
  return {
    x: WGS84.a * point.lon * RAD,
    y: WGS84.a * Math.log(Math.tan(Math.PI / 4 + (point.lat * RAD) / 2)),
  }
}

function dms(value: number, positive: string, negative: string): string {
  const absolute = Math.abs(value)
  let degrees = Math.floor(absolute)
  let minutes = Math.floor((absolute - degrees) * 60)
  let seconds = (absolute - degrees - minutes / 60) * 3600
  if (seconds >= 59.995) {
    seconds = 0
    minutes++
  }
  if (minutes === 60) {
    minutes = 0
    degrees++
  }
  return `${degrees}°${String(minutes).padStart(2, '0')}′${seconds.toFixed(2).padStart(5, '0')}″${value >= 0 ? positive : negative}`
}

export function formatPosition(point: LatLon, crs: CrsId, projector: Projector | null): string {
  switch (crs) {
    case 'wgs84':
      return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
    case 'dms':
      return `${dms(point.lat, ' с.ш.', ' ю.ш.')}, ${dms(point.lon, ' в.д.', ' з.д.')}`
    case 'utm': {
      const { zone, easting, northing } = toUtm(point)
      return `${zone}N  E ${easting.toFixed(2)}  N ${northing.toFixed(2)}`
    }
    case 'gk42': {
      const { x, y } = toGaussKruger(point)
      return `X ${x.toFixed(2)}  Y ${y.toFixed(2)}`
    }
    case 'mercator': {
      const { x, y } = toWebMercator(point)
      return `X ${x.toFixed(2)}  Y ${y.toFixed(2)}`
    }
    case 'local': {
      if (!projector) return ''
      const { x, y } = projector.toXY(point)
      return `x ${x.toFixed(2)} м  y ${y.toFixed(2)} м`
    }
  }
}
