import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { applyJunctionPriority, junctionPriority, MAIN_ROAD_TAG } from '../priority'
import { buildScene } from '../scene'
import { buildNetwork } from '../topology'
import type { RawDocument } from '../types'

const M = 1 / 111_320

/** Крестообразный перекрёсток: запад 1, восток 3, юг 4, север 5, центр 2. */
function cross(): { doc: OsmDoc; projector: Projector } {
  const raw: RawDocument = {
    bounds: { minlat: 51.99, minlon: 103.99, maxlat: 52.01, maxlon: 104.01 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - 100 * M },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + 100 * M },
      { id: 4, lat: 52 - 100 * M, lon: 104 },
      { id: 5, lat: 52 + 100 * M, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', name: 'Запад' } },
      { id: 11, nds: [2, 3], tags: { highway: 'primary', name: 'Восток' } },
      { id: 12, nds: [4, 2], tags: { highway: 'residential', name: 'Юг' } },
      { id: 13, nds: [2, 5], tags: { highway: 'residential', name: 'Север' } },
    ],
    relations: [],
  }
  return { doc: new OsmDoc(raw), projector: new Projector(raw.bounds) }
}

function apply(doc: OsmDoc, projector: Projector, main: [number, number] | null, signs: Record<number, 'give_way' | 'stop'> = {}) {
  doc.begin('тест')
  applyJunctionPriority(doc, projector, 2, main, signs)
  doc.commit()
  return junctionPriority(doc, buildNetwork(doc, projector), 2)!
}

describe('приоритет перекрёстка по ПДД', () => {
  it('без знаков перекрёсток равнозначный', () => {
    const { doc, projector } = cross()
    expect(junctionPriority(doc, buildNetwork(doc, projector), 2)!.kind).toBe('equal')
  })

  it('главная прямо: второстепенные получают знаки, противоречий нет', () => {
    const { doc, projector } = cross()
    const result = apply(doc, projector, [1, 3], { 5: 'stop' })
    expect(result).toMatchObject({ kind: 'main', explicit: true, bend: 'through' })
    expect(result.arms.filter((a) => a.role === 'minor').map((a) => [a.arm.link.wayId, a.sign]).sort()).toEqual([[12, 'give_way'], [13, 'stop']])
    expect(result.arms.filter((a) => a.role === 'main').every((a) => a.sign === null)).toBe(true)
    expect(result.issues).toEqual([])
    expect(doc.node(2).tags?.[MAIN_ROAD_TAG]).toBe('1;3')
  })

  it('главная поворачивает: с запада на юг — направо, нужна табличка 8.13', () => {
    const { doc, projector } = cross()
    const result = apply(doc, projector, [1, 4])
    expect(result.bend).toBe('right')
    expect(result.arms.find((a) => a.arm.link.wayId === 11)!.sign).toBe('give_way')
    expect(result.arms.find((a) => a.arm.link.wayId === 12)!.sign).toBeNull()
  })

  it('смена главной переносит знаки, равнозначный снимает всё', () => {
    const { doc, projector } = cross()
    apply(doc, projector, [1, 3])
    const moved = apply(doc, projector, [4, 5])
    expect(moved.arms.filter((a) => a.sign).map((a) => a.arm.link.wayId).sort()).toEqual([10, 11])
    const equal = apply(doc, projector, null)
    expect(equal.kind).toBe('equal')
    expect(doc.node(2).tags?.[MAIN_ROAD_TAG]).toBeUndefined()
  })

  it('на карте: 2.1 на главных подходах, с табличкой 8.13 если главная поворачивает, 2.4 на второстепенных', () => {
    const { doc, projector } = cross()
    apply(doc, projector, [1, 3])
    const icons = (d: OsmDoc) => buildScene(d, projector).scene.trafficSigns.features.map((f) => f.properties?.icon as string).sort()
    expect(icons(doc)).toEqual(['sign-give-way', 'sign-give-way', 'sign-main', 'sign-main'])
    apply(doc, projector, [1, 4])
    expect(icons(doc)).toEqual(['sign-give-way', 'sign-give-way', 'sign-main-bent', 'sign-main-bent'])
  })

  it('знак на главной дороге — ошибка, подход без знака — предупреждение', () => {
    const { doc, projector } = cross()
    apply(doc, projector, [1, 3])
    doc.begin('тест')
    doc.putNode({ ...doc.node(2), tags: { [MAIN_ROAD_TAG]: '4;5' } })
    doc.commit()
    const result = junctionPriority(doc, buildNetwork(doc, projector), 2)!
    expect(result.issues.map((i) => i.severity)).toContain('error')
    expect(result.issues.some((i) => i.text.includes('Второстепенный подход без знака'))).toBe(true)
  })
})
