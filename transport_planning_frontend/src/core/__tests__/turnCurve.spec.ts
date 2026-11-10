import { describe, expect, it } from 'vitest'

import { dot, sub } from '../geo'
import { turnCurve } from '../scene'
import type { XY } from '../types'

/** Кривая не должна ни на одном шаге идти против направления въезда в начале и выезда в конце. */
function goesBack(points: XY[], travelIn: XY, travelOut: XY): boolean {
  const first = sub(points[1]!, points[0]!)
  const last = sub(points.at(-1)!, points.at(-2)!)
  return dot(first, travelIn) <= 0 || dot(last, travelOut) <= 0
}

describe('траектория манёвра', () => {
  it('прямой угол строится через пересечение направлений', () => {
    const points = turnCurve({ x: 0, y: -10 }, { x: 0, y: 1 }, { x: 10, y: 0 }, { x: 1, y: 0 })
    expect(points[0]).toEqual({ x: 0, y: -10 })
    expect(points.at(-1)).toEqual({ x: 10, y: 0 })
    expect(goesBack(points, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(false)
  })

  it('если пересечение позади стоп-линии, кривая всё равно идёт вперёд', () => {
    // Выезд начинается левее и позади подхода: пересечение направлений лежит за спиной водителя
    const travelIn = { x: 0, y: 1 }
    const travelOut = { x: -1, y: 0.2 }
    const points = turnCurve({ x: 0, y: 0 }, travelIn, { x: -8, y: -3 }, travelOut)
    expect(goesBack(points, travelIn, travelOut)).toBe(false)
  })

  it('проезд прямо со смещением полосы остаётся плавным', () => {
    const points = turnCurve({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 20 }, { x: 0, y: 1 })
    expect(goesBack(points, { x: 0, y: 1 }, { x: 0, y: 1 })).toBe(false)
    for (let i = 1; i < points.length; i++) expect(points[i]!.y).toBeGreaterThanOrEqual(points[i - 1]!.y)
  })
})
