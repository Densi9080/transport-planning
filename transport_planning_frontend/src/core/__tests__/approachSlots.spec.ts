import { describe, expect, it } from 'vitest'

import { approachSlots } from '../scene'
import type { Arm } from '../topology'

function arm(x: number, y: number): Arm {
  return { dir: { x, y } } as Arm
}

describe('цвет подхода к узлу', () => {
  it('стороны света получают постоянные номера', () => {
    const north = arm(0, 1)
    const east = arm(1, 0)
    const south = arm(0, -1)
    const west = arm(-1, 0)
    const slots = approachSlots([south, west, north, east])
    expect(slots.get(north)).toBe(0)
    expect(slots.get(east)).toBe(1)
    expect(slots.get(south)).toBe(2)
    expect(slots.get(west)).toBe(3)
  })

  it('два подхода с одной стороны получают разные цвета', () => {
    const exact = arm(0, 1)
    const close = arm(0.26, 0.97)
    const slots = approachSlots([close, exact])
    expect(slots.get(exact)).toBe(0)
    expect(slots.get(close)).not.toBe(0)
  })

  it('на сложном узле номера не повторяются', () => {
    const arms = [arm(0, 1), arm(0.3, 0.95), arm(-0.3, 0.95), arm(0.1, 0.99), arm(1, 0), arm(0, -1)]
    const slots = approachSlots(arms)
    expect(new Set(slots.values()).size).toBe(arms.length)
  })
})
