import { describe, expect, it } from 'vitest'

import { outLaneFor } from '../scene'

/** Полосы считаются слева направо по ходу движения: 0 — крайняя левая. */
describe('полоса выезда после поворота', () => {
  it('направо — в ближнюю, то есть в крайнюю правую и соседние', () => {
    expect([0, 1].map((index) => outLaneFor(index, 2, 3, 'right'))).toEqual([1, 2])
    expect(outLaneFor(0, 1, 3, 'right')).toBe(2)
  })

  it('налево и в разворот — в крайнюю левую и соседние', () => {
    expect([0, 1].map((index) => outLaneFor(index, 2, 3, 'left'))).toEqual([0, 1])
    expect(outLaneFor(0, 1, 3, 'left')).toBe(0)
    expect(outLaneFor(0, 1, 3, 'reverse')).toBe(0)
  })

  it('добавленная к левому повороту правая полоса не уходит в дальнюю полосу выезда', () => {
    // Было: «тот же номер справа» давал полосу 2 — дальнюю для левого поворота
    const used = [0, 1]
    expect(outLaneFor(used.indexOf(1), used.length, 3, 'left')).toBe(1)
  })
})
