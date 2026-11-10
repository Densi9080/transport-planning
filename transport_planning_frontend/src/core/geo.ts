import type { Bounds, LatLon, XY } from './types'

const METERS_PER_DEGREE = 111_319.49

/** Локальная проекция в метрах: на участке города искажения пренебрежимо малы. */
export class Projector {
  readonly lat0: number
  readonly lon0: number
  private readonly kx: number

  constructor(bounds: Bounds) {
    this.lat0 = (bounds.minlat + bounds.maxlat) / 2
    this.lon0 = (bounds.minlon + bounds.maxlon) / 2
    this.kx = METERS_PER_DEGREE * Math.cos((this.lat0 * Math.PI) / 180)
  }

  toXY(p: LatLon): XY {
    return { x: (p.lon - this.lon0) * this.kx, y: (p.lat - this.lat0) * METERS_PER_DEGREE }
  }

  toLatLon(p: XY): LatLon {
    return { lat: this.lat0 + p.y / METERS_PER_DEGREE, lon: this.lon0 + p.x / this.kx }
  }

  toLngLat(p: XY): [number, number] {
    return [this.lon0 + p.x / this.kx, this.lat0 + p.y / METERS_PER_DEGREE]
  }
}

export const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: XY, k: number): XY => ({ x: a.x * k, y: a.y * k })
export const dot = (a: XY, b: XY): number => a.x * b.x + a.y * b.y
export const cross = (a: XY, b: XY): number => a.x * b.y - a.y * b.x
export const length = (a: XY): number => Math.hypot(a.x, a.y)
export const dist = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y)
export const leftNormal = (a: XY): XY => ({ x: -a.y, y: a.x })

export function unit(a: XY): XY {
  const len = length(a)
  return len > 1e-9 ? { x: a.x / len, y: a.y / len } : { x: 1, y: 0 }
}

export function polylineLength(points: XY[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  return total
}

/** Точка и направление на расстоянии along от начала полилинии. */
export function pointAlong(points: XY[], along: number): { point: XY; dir: XY } {
  let remaining = Math.max(0, along)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const segment = dist(a, b)
    if (remaining <= segment || i === points.length - 1) {
      const t = segment > 1e-9 ? Math.min(1, remaining / segment) : 0
      return { point: add(a, scale(sub(b, a), t)), dir: unit(sub(b, a)) }
    }
    remaining -= segment
  }
  return { point: points[0]!, dir: { x: 1, y: 0 } }
}

/** Обрезает полилинию с обоих концов на заданное расстояние. */
export function trimPolyline(points: XY[], fromStart: number, fromEnd: number): XY[] {
  const total = polylineLength(points)
  const start = Math.max(0, fromStart)
  const end = total - Math.max(0, fromEnd)
  if (end - start < 1e-6) {
    const middle = pointAlong(points, (start + end) / 2).point
    return [middle, middle]
  }
  const result: XY[] = [pointAlong(points, start).point]
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    walked += dist(points[i - 1]!, points[i]!)
    if (walked > start + 1e-6 && walked < end - 1e-6) result.push(points[i]!)
  }
  result.push(pointAlong(points, end).point)
  return result
}

/**
 * Параллельная линия: offset > 0 — слева по ходу полилинии.
 * Касательные на концах можно задать явно, чтобы стыковать соседние дороги без зазора.
 */
export function offsetPolyline(
  points: XY[],
  offset: number,
  startTangent?: XY | null,
  endTangent?: XY | null,
): XY[] {
  const clean = dedupe(points)
  if (clean.length < 2) return clean.map((p) => ({ ...p }))
  const result: XY[] = []
  for (let i = 0; i < clean.length; i++) {
    const point = clean[i]!
    const dirIn = i > 0 ? unit(sub(point, clean[i - 1]!)) : null
    const dirOut = i < clean.length - 1 ? unit(sub(clean[i + 1]!, point)) : null
    let tangent: XY
    let reference: XY
    if (i === 0) {
      tangent = startTangent ?? dirOut!
      reference = dirOut!
    } else if (i === clean.length - 1) {
      tangent = endTangent ?? dirIn!
      reference = dirIn!
    } else {
      tangent = unit(add(dirIn!, dirOut!))
      reference = dirOut!
    }
    const cos = Math.max(0.35, dot(tangent, reference))
    result.push(add(point, scale(leftNormal(tangent), offset / cos)))
  }
  return result
}

function dedupe(points: XY[]): XY[] {
  const result: XY[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (!last || dist(last, point) > 1e-3) result.push(point)
  }
  return result
}

export interface SegmentHit {
  point: XY
  distance: number
  /** Положение на отрезке от 0 до 1. */
  t: number
}

/** Лежит ли точка внутри многоугольника: подсчёт пересечений луча с рёбрами. */
export function pointInPolygon(point: XY, polygon: XY[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function nearestOnSegment(p: XY, a: XY, b: XY): SegmentHit {
  const ab = sub(b, a)
  const lenSq = dot(ab, ab)
  const t = lenSq > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq)) : 0
  const point = add(a, scale(ab, t))
  return { point, distance: dist(p, point), t }
}

/** Пересечение прямых p + t·d. Возвращает null для почти параллельных. */
export function lineIntersection(p1: XY, d1: XY, p2: XY, d2: XY): XY | null {
  const denominator = cross(d1, d2)
  if (Math.abs(denominator) < 1e-3) return null
  const t = cross(sub(p2, p1), d2) / denominator
  return add(p1, scale(d1, t))
}

/** Пересечение отрезков без учёта касания в концах: параметры строго внутри. */
export function segmentsCross(a1: XY, a2: XY, b1: XY, b2: XY): XY | null {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < 1e-9) return null
  const diff = sub(b1, a1)
  const t = cross(diff, s) / denominator
  const u = cross(diff, r) / denominator
  const eps = 1e-6
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null
  return add(a1, scale(r, t))
}

export function quadraticCurve(a: XY, control: XY, b: XY, steps: number): XY[] {
  const points: XY[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    points.push({
      x: mt * mt * a.x + 2 * mt * t * control.x + t * t * b.x,
      y: mt * mt * a.y + 2 * mt * t * control.y + t * t * b.y,
    })
  }
  return points
}

/** Сглаживание Катмулла — Рома: кривая проходит через все заданные точки. */
export function smoothCurve(points: XY[], spacing = 8): XY[] {
  if (points.length < 3) return points
  const result: XY[] = [points[0]!]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!
    const steps = Math.max(1, Math.round(dist(p1, p2) / spacing))
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (p2.x - p0.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (p2.y - p0.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return result
}

/** Азимут от севера по часовой стрелке, в градусах. */
export function bearing(dir: XY): number {
  return ((Math.atan2(dir.x, dir.y) * 180) / Math.PI + 360) % 360
}
