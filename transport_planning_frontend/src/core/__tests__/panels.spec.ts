import { describe, expect, it } from 'vitest'

import { toGaussKruger, toUtm, toWebMercator } from '../crs'
import { OsmDoc } from '../doc'
import { computeHidden, countMatches, matchingWays, type FilterRule } from '../filter'
import { Projector } from '../geo'
import { convexHull } from '../../sim/macro'
import { arrivalArm, departureArm, laneAtPoint, lanePorts } from '../lanePick'
import { nodeConnectors, setLaneConnection } from '../laneOps'
import { laneOffsets, parseProfile, totalWidth, withLanes, withLaneWidth, withoutLaneWidths } from '../lanes'
import { matchingPreset, ROAD_PRESETS, withPreset } from '../presets'
import { buildNetwork } from '../topology'
import type { RawDocument } from '../types'

describe('системы координат (эталон: PROJ из QGIS)', () => {
  const point = { lat: 52.26, lon: 104.26 }

  it('UTM', () => {
    const { zone, easting, northing } = toUtm(point)
    expect(zone).toBe(48)
    expect(easting).toBeCloseTo(449493.787, 2)
    expect(northing).toBeCloseTo(5790214.723, 2)
  })

  it('Web Mercator', () => {
    const { x, y } = toWebMercator(point)
    expect(x).toBeCloseTo(11606170.11, 2)
    expect(y).toBeCloseTo(6847274.008, 2)
  })

  it('Пулково-42, Гаусс — Крюгер', () => {
    const near = toGaussKruger(point)
    expect(near.zone).toBe(18)
    expect(near.y).toBeCloseTo(18449453.429, 0)
    expect(near.x).toBeCloseTo(5792564.576, 0)
    const other = toGaussKruger({ lat: 52.2548, lon: 104.2633 })
    expect(other.y).toBeCloseTo(18449672.859, 0)
    expect(other.x).toBeCloseTo(5791983.679, 0)
  })
})

describe('ширина полос', () => {
  const road = { highway: 'secondary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' }

  it('читает ширину каждой полосы и считает смещения', () => {
    const tags = { ...road, 'width:lanes:forward': '3.5|3', 'width:lanes:backward': '3|3.75' }
    const profile = parseProfile(tags)
    expect(profile.widthsForward).toEqual([3.5, 3])
    expect(totalWidth(profile)).toBeCloseTo(13.25)
    const offsets = laneOffsets(profile)
    const divider = 13.25 / 2 - 6.75
    expect(offsets.divider).toBeCloseTo(divider)
    expect(offsets.forward[0]).toBeCloseTo(divider - 1.75)
    expect(offsets.forward[1]).toBeCloseTo(divider - 5)
    expect(offsets.backward[1]).toBeCloseTo(divider + 3 + 1.875)
    expect(offsets.forwardBoundaries[0]).toBeCloseTo(divider - 3.5)
    expect(offsets.left).toBeCloseTo(13.25 / 2)
  })

  it('игнорирует ширины с неверным числом значений', () => {
    expect(parseProfile({ ...road, 'width:lanes:forward': '3|3|3' }).widthsForward).toEqual([3.5, 3.5])
  })

  it('пишет ширину полосы и общую ширину, не меняя другую сторону', () => {
    const before = parseProfile(road).widthsBackward
    const next = withLaneWidth(road, 'forward', 1, 4)
    expect(next['width:lanes:forward']).toBe('3.5|4')
    expect(next['width:lanes:backward']).toBe(before.join('|'))
    expect(next.width).toBe('14.5')
    expect(parseProfile(next).widthsBackward).toEqual(before)
  })

  it('ограничивает ширину разумными пределами', () => {
    expect(withLaneWidth(road, 'forward', 0, 9)['width:lanes:forward']).toBe('6|3.5')
  })

  it('на односторонней дороге использует общий тег', () => {
    const next = withLaneWidth({ highway: 'primary', oneway: 'yes', lanes: '2' }, 'forward', 0, 4)
    expect(next['width:lanes']).toBe('4|3.5')
    expect(next.width).toBe('7.5')
  })

  it('новая полоса получает ширину соседней', () => {
    const wide = withLaneWidth(road, 'forward', 1, 4)
    const next = withLanes(wide, 3, 2)
    expect(next['width:lanes:forward']).toBe('3.5|4|4')
    expect(next.width).toBe('18.5')
  })

  it('сброс возвращает одинаковые полосы', () => {
    const next = withoutLaneWidths(withLaneWidth(road, 'forward', 1, 4))
    expect(next.width).toBeUndefined()
    expect(parseProfile(next).widthsForward).toEqual([3.5, 3.5])
  })
})

describe('типовые профили', () => {
  const primary = ROAD_PRESETS.find((preset) => preset.id === 'primary-6')!

  it('меняет профиль и сохраняет название', () => {
    const next = withPreset({ highway: 'residential', name: 'Ленина', lanes: '2', surface: 'asphalt' }, primary)
    expect(next).toMatchObject({ highway: 'primary', name: 'Ленина', lanes: '6', maxspeed: '70', width: '21', surface: 'asphalt' })
    expect(parseProfile(next).laneWidth).toBeCloseTo(3.5)
  })

  it('при другом числе полос снимает манёвры', () => {
    const next = withPreset({ highway: 'primary', lanes: '2', 'turn:lanes:forward': 'left' }, primary)
    expect(next['turn:lanes:forward']).toBeUndefined()
  })

  it('узнаёт дорогу по её профилю', () => {
    expect(matchingPreset(primary.tags)?.id).toBe('primary-6')
    expect(matchingPreset({ highway: 'primary', lanes: '5' })).toBeUndefined()
  })
})

describe('фильтр', () => {
  function sample(): OsmDoc {
    const nodes = [1, 2, 3, 4].map((id) => ({ id, lat: 52, lon: 104 + id / 1000 }))
    const raw: RawDocument = {
      bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
      nodes,
      ways: [
        { id: 10, nds: [1, 2], tags: { highway: 'primary', lanes: '6', maxspeed: '60' } },
        { id: 11, nds: [2, 3], tags: { highway: 'residential', maxspeed: '40' } },
        { id: 12, nds: [3, 4], tags: { building: 'yes' } },
      ],
      relations: [],
    }
    return new OsmDoc(raw)
  }
  const rule = (over: Partial<FilterRule>): FilterRule => ({ id: 1, enabled: true, key: 'highway', op: 'eq', value: 'primary', ...over })

  it('считает полосы, даже если их нет в тегах', () => {
    expect(countMatches(sample(), { key: '@lanes', op: 'ge', value: '4' })).toBe(1)
    expect(countMatches(sample(), { key: '@lanes', op: 'le', value: '2' })).toBe(1)
  })

  it('«только найденное» скрывает остальное', () => {
    expect([...computeHidden(sample(), [rule({})], 'only').ways].sort()).toEqual([11, 12])
  })

  it('условия сочетаются через «все»', () => {
    const rules = [rule({}), rule({ id: 2, key: 'maxspeed', op: 'eq', value: '40' })]
    expect(matchingWays(sample(), rules, 'all')).toEqual([])
    expect(matchingWays(sample(), rules, 'any').sort()).toEqual([10, 11])
  })
})

describe('районы', () => {
  it('граница района — выпуклая оболочка застройки', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual({ x: 5, y: 5 })
  })
})

describe('соединение полос на карте', () => {
  const STEP = 0.001
  /** Перекрёсток: запад и восток по две полосы в сторону, юг по одной. */
  function junction(): { doc: OsmDoc; projector: Projector } {
    const raw: RawDocument = {
      bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
      nodes: [
        { id: 1, lat: 52, lon: 104 - STEP },
        { id: 2, lat: 52, lon: 104 },
        { id: 3, lat: 52, lon: 104 + STEP },
        { id: 4, lat: 52 - STEP, lon: 104 },
      ],
      ways: [
        { id: 10, nds: [1, 2], tags: { highway: 'primary', lanes: '4' } },
        { id: 11, nds: [2, 3], tags: { highway: 'primary', lanes: '4' } },
        { id: 20, nds: [4, 2], tags: { highway: 'residential', lanes: '2' } },
      ],
      relations: [],
    }
    return { doc: new OsmDoc(raw), projector: new Projector(raw.bounds) }
  }

  it('различает полосы и направления по точке щелчка', () => {
    const { doc, projector } = junction()
    const network = buildNetwork(doc, projector)
    const center = projector.toXY({ lat: 52, lon: 104 - STEP / 2 })
    // Движение на восток идёт южнее оси, крайняя правая полоса дальше всего от неё
    const right = laneAtPoint(network, { x: center.x, y: center.y - 5.25 })!
    expect(right.forward).toBe(true)
    expect(right.lane).toBe(1)
    const left = laneAtPoint(network, { x: center.x, y: center.y - 1.75 })!
    expect([left.forward, left.lane]).toEqual([true, 0])
    const opposite = laneAtPoint(network, { x: center.x, y: center.y + 1.75 })!
    expect([opposite.forward, opposite.lane]).toEqual([false, 0])
    expect(laneAtPoint(network, { x: center.x, y: center.y + 50 })).toBeNull()
  })

  it('ставит точки въезда и выезда на каждую полосу у перекрёстка', () => {
    const { doc, projector } = junction()
    const ports = lanePorts(buildNetwork(doc, projector)).filter((port) => port.node === 2)
    // Запад и восток по 2 + 2 полосы, юг 1 + 1: всего 10 точек, по 5 на въезд и выезд
    expect(ports).toHaveLength(10)
    expect(ports.filter((port) => port.incoming)).toHaveLength(5)
    const west = ports.filter((port) => port.neighbor === 1 && port.incoming)
    expect(west.map((port) => port.lane).sort()).toEqual([0, 1])
    // Движение на восток идёт южнее оси, значит, въезд с запада лежит ниже центра узла
    const center = projector.toXY({ lat: 52, lon: 104 })
    for (const port of west) {
      expect(port.point.y).toBeLessThan(center.y)
      expect(port.point.x).toBeLessThan(center.x)
    }
  })

  it('находит подходы и пишет соединение из полосы в полосу', () => {
    const { doc, projector } = junction()
    const network = buildNetwork(doc, projector)
    const west = projector.toXY({ lat: 52, lon: 104 - STEP / 2 })
    const south = projector.toXY({ lat: 52 - STEP / 2, lon: 104 })
    const from = laneAtPoint(network, { x: west.x, y: west.y - 1.75 })!
    const arrival = arrivalArm(network, from)!
    expect(arrival.node).toBe(2)
    expect(arrival.neighbor).toBe(1)

    // Выезд на юг идёт против порядка узлов дороги 20, а правая сторона при движении на юг — западная
    const to = laneAtPoint(network, { x: south.x - 1.5, y: south.y })!
    expect(to.forward).toBe(false)
    const departure = departureArm(network, to, 2)!
    expect(departure.neighbor).toBe(4)
    expect(arrivalArm(network, to)?.node).toBe(4)
    expect(departureArm(network, from, 2)).toBeNull()

    doc.transact('t', () => setLaneConnection(doc, projector, 2, 1, from.lane, 4, to.lane, true))
    const made = nodeConnectors(doc, projector, 2).connectors.filter((c) => c.from.neighbor === 1 && c.to.neighbor === 4)
    expect(made.map((c) => [c.fromLane, c.toLane])).toContainEqual([from.lane, to.lane])
  })
})
