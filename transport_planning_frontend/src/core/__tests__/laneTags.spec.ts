import { describe, expect, it } from 'vitest'

import { readLaneValue, writeLaneValue } from '../laneTags'

describe('значения по полосам', () => {
  it('на односторонней дороге пишет общий тег и сохраняет остальные полосы', () => {
    const tags = { highway: 'secondary', oneway: 'yes', lanes: '3', maxspeed: '60' }
    const next = writeLaneValue(tags, 'maxspeed', true, 2, '40')
    expect(next['maxspeed:lanes']).toBe('60|60|40')
    expect(readLaneValue(next, 'maxspeed', true, 2)).toBe('40')
    expect(readLaneValue(next, 'maxspeed', true, 0)).toBe('60')
  })

  it('на двусторонней дороге направления хранятся раздельно', () => {
    const tags = { highway: 'secondary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2', maxspeed: '60' }
    const next = writeLaneValue(tags, 'maxspeed', false, 1, '30')
    expect(next['maxspeed:lanes:backward']).toBe('60|30')
    expect(next['maxspeed:lanes:forward']).toBeUndefined()
  })

  it('значение с неверным числом полос не читается', () => {
    const tags = { highway: 'secondary', oneway: 'yes', lanes: '3', 'maxspeed:lanes': '60|40' }
    expect(readLaneValue(tags, 'maxspeed', true, 0)).toBe('')
  })
})
