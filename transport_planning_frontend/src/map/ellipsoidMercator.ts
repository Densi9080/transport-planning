/**
 * Тайлы в эллипсоидальной проекции Меркатора (EPSG:3395, так режет карту Яндекс) поверх карты
 * в EPSG:3857. Долгота в обеих проекциях одна и та же, а широта на эллипсоиде ложится южнее:
 * без пересчёта подложка в Иркутске съезжает на 20,7 км к югу. Поэтому столбцы тайла берём как есть, а каждую строку
 * пикселей пересчитываем: широта строки в 3857 → строка в 3395 → строка исходного тайла.
 */
import type { addProtocol } from 'maplibre-gl'

export const ELLIPSOID_PROTOCOL = 'merc3395'

/** Эксцентриситет эллипсоида WGS 84. */
const WGS84_E = 0.0818191908426215
const CACHE_LIMIT = 96

/** Широта (радианы) строки пикселей в EPSG:3857; globalY считается от верхнего края мира. */
export function latitudeOfWebMercatorRow(globalY: number, worldPx: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - (2 * globalY) / worldPx)))
}

/** Строка пикселей в EPSG:3395 на той же широте. */
export function ellipsoidMercatorRow(latitude: number, worldPx: number): number {
  const sin = Math.sin(latitude)
  const psi = Math.log(Math.tan(Math.PI / 4 + latitude / 2) * Math.pow((1 - WGS84_E * sin) / (1 + WGS84_E * sin), WGS84_E / 2))
  return ((1 - psi / Math.PI) / 2) * worldPx
}

/** Адрес для MapLibre: шаблон исходных тайлов закодирован, поэтому его {z}/{x}/{y} MapLibre не трогает. */
export function ellipsoidTileUrl(template: string): string {
  return `${ELLIPSOID_PROTOCOL}://{z}/{x}/{y}/${encodeURIComponent(template)}`
}

export function fillTemplate(template: string, z: number, x: number, y: number): string {
  return template.replace(/\{z\}/g, String(z)).replace(/\{x\}/g, String(x)).replace(/\{y\}/g, String(y))
}

export interface SourceRow {
  /** Номер исходного тайла по вертикали. */
  tile: number
  /** Строка внутри него, доля от 0 до 1. */
  offset: number
}

/** Для каждой строки выходного тайла 3857 размером size: какой тайл 3395 и какая его строка. */
export function sourceRows(z: number, y: number, size: number): SourceRow[] {
  const worldPx = size * 2 ** z
  const last = 2 ** z - 1
  const rows: SourceRow[] = []
  for (let r = 0; r < size; r++) {
    const latitude = latitudeOfWebMercatorRow(y * size + r + 0.5, worldPx)
    const row = ellipsoidMercatorRow(latitude, worldPx) / size
    const tile = Math.min(last, Math.max(0, Math.floor(row)))
    rows.push({ tile, offset: Math.min(1, Math.max(0, row - tile)) })
  }
  return rows
}

const cache = new Map<string, Promise<ImageBitmap | null>>()

function loadTile(url: string): Promise<ImageBitmap | null> {
  const hit = cache.get(url)
  if (hit) {
    cache.delete(url)
    cache.set(url, hit)
    return hit
  }
  // Общий запрос для соседних тайлов не отменяем: он нужен и тем, кого ещё не отменили
  const request = fetch(url)
    .then((response) => (response.ok ? response.blob() : null))
    .then((blob) => (blob ? createImageBitmap(blob) : null))
    .catch(() => null)
  cache.set(url, request)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string
    void cache.get(oldest)?.then((bitmap) => bitmap?.close())
    cache.delete(oldest)
  }
  return request
}

const PATTERN = new RegExp(`^${ELLIPSOID_PROTOCOL}://(\\d+)/(\\d+)/(\\d+)/(.+)$`)

async function loadReprojected(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const match = PATTERN.exec(url)
  if (!match) throw new Error(`Неверный адрес тайла: ${url}`)
  const [z, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const template = decodeURIComponent(match[4]!)
  // Строки считаем по 256 пикселям: так набор нужных исходных тайлов не зависит от их размера
  const needed = [...new Set(sourceRows(z, y, 256).map((row) => row.tile))]
  const bitmaps = new Map<number, ImageBitmap>()
  await Promise.all(
    needed.map(async (tile) => {
      const bitmap = await loadTile(fillTemplate(template, z, x, tile))
      if (bitmap) bitmaps.set(tile, bitmap)
    }),
  )
  if (signal.aborted) throw new DOMException('Отменено', 'AbortError')
  if (!bitmaps.size) throw new Error('Тайлы подложки не загрузились')
  // Тайлы для экранов высокой плотности бывают по 512 пикселей: выход делаем того же размера
  const size = [...bitmaps.values()][0]!.width
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Холст недоступен')
  sourceRows(z, y, size).forEach((row, r) => {
    const bitmap = bitmaps.get(row.tile)
    if (!bitmap) return
    const sy = Math.min(bitmap.height - 1, Math.floor(row.offset * bitmap.height))
    context.drawImage(bitmap, 0, sy, bitmap.width, 1, 0, r, size, 1)
  })
  return createImageBitmap(canvas)
}

let registered = false

/**
 * Регистрирует протокол один раз на страницу. addProtocol передаёт карта: так модуль не тянет
 * MapLibre туда, где нужны только формулы (стили, тесты).
 */
export function registerEllipsoidMercator(add: typeof addProtocol): void {
  if (registered) return
  registered = true
  add(ELLIPSOID_PROTOCOL, async (params, abortController) => ({
    data: await loadReprojected(params.url, abortController.signal),
  }))
}
