import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import type { ONode, ORelation, OWay, RawDocument, Tags } from '../types'
import { type Issue, validate } from '../validate'
import { parseSample } from './sample'

const LAT0 = 52
const LON0 = 104
const M_LAT = 1 / 111_320
const M_LON = 1 / (111_320 * Math.cos((LAT0 * Math.PI) / 180))

/** Узел по координатам в метрах: x на восток, y на север. */
function at(id: number, x: number, y: number, tags?: Tags): ONode {
  return { id, lat: LAT0 + y * M_LAT, lon: LON0 + x * M_LON, ...(tags ? { tags } : {}) }
}

function run(nodes: ONode[], ways: OWay[], relations: ORelation[] = []): Issue[] {
  const raw: RawDocument = { bounds: { minlat: LAT0 - 0.01, minlon: LON0 - 0.01, maxlat: LAT0 + 0.01, maxlon: LON0 + 0.01 }, nodes, ways, relations }
  return validate(new OsmDoc(raw), new Projector(raw.bounds))
}

const of = (issues: Issue[], code: Issue['code']) => issues.filter((issue) => issue.code === code)

/**
 * Карман идёт на север вдоль улицы, в узле 3 короткий съезд уводит на запад,
 * а с него можно уехать по двусторонней дороге на юг, обратно вдоль кармана.
 */
function pocketScene(approach: Tags, bridgeTags: Tags, bridgeLength = 15) {
  const nodes = [at(1, 0, -50), at(2, 0, 0), at(3, 0, 100), at(4, -bridgeLength, 100), at(5, -bridgeLength, -50), at(6, -bridgeLength, 200)]
  const ways: OWay[] = [
    { id: 10, nds: [1, 2, 3], tags: approach },
    { id: 11, nds: [3, 4], tags: bridgeTags },
    { id: 12, nds: [6, 4, 5], tags: { highway: 'secondary' } },
  ]
  return { nodes, ways }
}

const POCKET = { highway: 'service', oneway: 'yes', motor_vehicle: 'no' }
const BUS_ONLY = { highway: 'secondary_link', oneway: 'yes', motor_vehicle: 'no', psv: 'yes' }
const busRoute = (wayIds: number[]): ORelation => ({
  id: 90,
  members: wayIds.map((id) => ['way', id, ''] as ['way', number, string]),
  tags: { type: 'route', route: 'bus', ref: '455' },
})

describe('скрытый разворот', () => {
  it('из автобусного кармана через съезд для ОТ — ошибка', () => {
    const { nodes, ways } = pocketScene(POCKET, BUS_ONLY)
    const found = of(run(nodes, ways, [busRoute([10, 11])]), 'hidden_uturn')
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('error')
    expect(found[0]!.wayIds).toEqual([10, 11, 12])
    expect(found[0]!.message).toContain('только общественному транспорту')
  })

  it('с основной дороги через разрыв — предупреждение со сверкой по снимку', () => {
    const { nodes, ways } = pocketScene({ highway: 'secondary', oneway: 'yes' }, { highway: 'secondary_link', oneway: 'yes' })
    const found = of(run(nodes, ways), 'hidden_uturn')
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('warning')
  })

  it('с двусторонней дороги разворот не скрытый: развернуться можно на ней самой', () => {
    const { nodes, ways } = pocketScene({ highway: 'secondary' }, { highway: 'secondary_link', oneway: 'yes' })
    expect(of(run(nodes, ways), 'hidden_uturn')).toHaveLength(0)
  })

  it('объезд квартала по длинной улице разворотом не считается', () => {
    const { nodes, ways } = pocketScene({ highway: 'secondary', oneway: 'yes' }, { highway: 'residential' }, 60)
    expect(of(run(nodes, ways), 'hidden_uturn')).toHaveLength(0)
  })
})

describe('обход запрета', () => {
  /** Улица на север, перед узлом 4 от неё отходит карман и возвращается в тот же узел. Налево с улицы запрещено. */
  function scene(sideFromStreet: boolean) {
    const nodes = [at(1, 0, -200), at(2, 0, -60), at(3, 8, -30), at(4, 0, 0), at(5, -100, 0), at(6, 100, 0), at(7, 0, 100), at(8, 30, -200)]
    const ways: OWay[] = [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary', oneway: 'yes' } },
      { id: 11, nds: [2, 4], tags: { highway: 'secondary', oneway: 'yes' } },
      { id: 12, nds: sideFromStreet ? [2, 3, 4] : [8, 3, 4], tags: { highway: 'service', oneway: 'yes' } },
      { id: 13, nds: [4, 5], tags: { highway: 'residential' } },
      { id: 14, nds: [4, 7], tags: { highway: 'secondary', oneway: 'yes' } },
      { id: 15, nds: [6, 4], tags: { highway: 'residential' } },
    ]
    const relations: ORelation[] = [
      { id: 50, members: [['way', 11, 'from'], ['node', 4, 'via'], ['way', 13, 'to']], tags: { type: 'restriction', restriction: 'no_left_turn' } },
    ]
    return run(nodes, ways, relations)
  }

  it('находит карман, с которого запрещённый поворот разрешён', () => {
    const found = of(scene(true), 'restriction_bypass')
    expect(found).toHaveLength(1)
    expect(found[0]!.wayIds).toEqual([11, 12, 13])
  })

  it('не трогает самостоятельный подход с другой дороги', () => {
    expect(of(scene(false), 'restriction_bypass')).toHaveLength(0)
  })
})

describe('маршруты ОТ', () => {
  function line(tags: Tags, reversed = false) {
    const nodes = [at(1, 0, 0), at(2, 0, 100), at(3, 0, 200)]
    const ways: OWay[] = [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary' } },
      { id: 11, nds: reversed ? [3, 2] : [2, 3], tags },
    ]
    return run(nodes, ways, [busRoute([10, 11])])
  }

  it('замечает дорогу, закрытую для автобуса', () => {
    const found = of(line({ highway: 'service', motor_vehicle: 'no' }), 'transit_access')
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toContain('автобус 455')
  })

  it('пропускает дорогу, открытую для ОТ', () => {
    expect(of(line({ highway: 'service', motor_vehicle: 'no', psv: 'yes' }), 'transit_access')).toHaveLength(0)
  })

  it('замечает движение против oneway и не путает его со встречной полосой для автобусов', () => {
    expect(of(line({ highway: 'secondary', oneway: 'yes' }, true), 'transit_against_oneway')).toHaveLength(1)
    expect(of(line({ highway: 'secondary', oneway: 'yes', 'oneway:bus': 'no' }, true), 'transit_against_oneway')).toHaveLength(0)
    expect(of(line({ highway: 'secondary', oneway: 'yes' }), 'transit_against_oneway')).toHaveLength(0)
  })
})

describe('вторая проезжая часть без oneway', () => {
  function pair(gap: number) {
    const nodes = [at(1, 0, 0), at(2, 0, 150), at(3, gap, 150), at(4, gap, 0)]
    const ways: OWay[] = [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary', oneway: 'yes', name: 'Лермонтова' } },
      { id: 11, nds: [3, 4], tags: { highway: 'secondary' } },
    ]
    return run(nodes, ways)
  }

  it('подозревает безымянную двустороннюю дорогу вплотную к односторонней', () => {
    const found = of(pair(12), 'missing_oneway')
    expect(found).toHaveLength(1)
    expect(found[0]!.wayIds).toEqual([11, 10])
  })

  it('не трогает дорогу в стороне', () => {
    expect(of(pair(60), 'missing_oneway')).toHaveLength(0)
  })
})

describe('пример: Лермонтова – Жуковского', () => {
  const raw = parseSample()
  const issues = validate(new OsmDoc(raw), new Projector(raw.bounds))

  it('разворот автобуса из кармана — ошибка', () => {
    const found = of(issues, 'hidden_uturn').find((issue) => issue.wayIds[0] === 863833210 && issue.wayIds[1] === 1476181279)
    expect(found?.severity).toBe('error')
  })

  it('запрет поворота с Лермонтова обходится через карман', () => {
    expect(of(issues, 'restriction_bypass').some((issue) => issue.wayIds.join() === '1473925806,863833210,1476181279')).toBe(true)
  })

  it('маршруты идут по карману, закрытому для машин без разрешения для ОТ', () => {
    expect(of(issues, 'transit_access').map((issue) => issue.wayIds[0])).toContain(863833210)
  })
})
