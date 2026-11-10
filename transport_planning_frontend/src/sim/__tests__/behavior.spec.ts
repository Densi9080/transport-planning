import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { parseSample } from '@/core/__tests__/sample'
import {
  collectKeyStats,
  computeHidden,
  countMatches,
  type FilterRule,
  matchesRule,
} from '@/core/filter'
import { Projector } from '@/core/geo'
import { nodeConnectors, resetLaneConnections, setLaneConnection, setSignalPlan } from '@/core/laneOps'
import { canChangeLane, dividerMode, parseProfile, withDivider, withLanes } from '@/core/lanes'
import { buildScene } from '@/core/scene'
import {
  colorAt,
  cycleLength,
  greenShare,
  MAX_GREEN_S,
  MIN_GREEN_S,
  movementKey,
  parseSignalPlan,
  phaseWindows,
  type SignalPlan,
  signalRemaining,
  signalSegments,
  signalTimes,
  withCycleLength,
  withGreenMoved,
  withGreenTime,
  withRedTime,
} from '@/core/signals'
import { connectivityAt, formatConnectivity, parseConnectivity } from '@/core/topology'
import {
  addLineStop,
  addLineWay,
  createLine,
  deleteLine,
  lineSegments,
  listLines,
  parseInterval,
  readLine,
  removeLineWay,
} from '@/core/transit'
import type { RawDocument } from '@/core/types'

import { runMacro } from '../macro'
import { MicroSim, SIM_STEP_S } from '../micro'
import { signalDirections } from '../signalView'
import { buildSimNet, signalGroupAt, signalState, refreshSignalPlans } from '../net'
import { buildServices } from '../transit'

const STEP = 0.001

function crossroads(): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - STEP },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + STEP },
      { id: 4, lat: 52 - STEP, lon: 104 },
      { id: 5, lat: 52 + STEP, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' } },
      { id: 11, nds: [2, 3], tags: { highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' } },
      { id: 20, nds: [4, 2], tags: { highway: 'residential' } },
      { id: 21, nds: [2, 5], tags: { highway: 'residential' } },
    ],
    relations: [],
  }
}

function setup(raw: RawDocument = crossroads()) {
  const doc = new OsmDoc(raw)
  return { doc, projector: new Projector(raw.bounds) }
}

const rule = (fields: Partial<FilterRule>): FilterRule => ({ id: 1, enabled: true, key: 'building', op: 'exists', value: '', ...fields })

describe('скрытие по атрибутам', () => {
  it('понимает все виды условий', () => {
    expect(matchesRule({ building: 'yes' }, rule({}))).toBe(true)
    expect(matchesRule({}, rule({}))).toBe(false)
    expect(matchesRule({}, rule({ op: 'missing' }))).toBe(true)
    expect(matchesRule({ highway: 'footway' }, rule({ key: 'highway', op: 'eq', value: 'footway' }))).toBe(true)
    expect(matchesRule({ highway: 'primary' }, rule({ key: 'highway', op: 'ne', value: 'footway' }))).toBe(true)
    expect(matchesRule({ name: 'Улица Лермонтова' }, rule({ key: 'name', op: 'contains', value: 'лермонтова' }))).toBe(true)
    expect(matchesRule({ lanes: '4' }, rule({ key: 'lanes', op: 'gt', value: '2' }))).toBe(true)
    expect(matchesRule({ lanes: 'много' }, rule({ key: 'lanes', op: 'lt', value: '2' }))).toBe(false)
  })

  it('не считает условие ≠ верным для объектов без ключа', () => {
    expect(matchesRule({}, rule({ key: 'highway', op: 'ne', value: 'footway' }))).toBe(false)
  })

  it('прячет здания настоящего файла и не трогает дороги', () => {
    const { doc } = setup(parseSample())
    const hidden = computeHidden(doc, [rule({})])
    expect(hidden.ways.size).toBeGreaterThan(300)
    for (const id of hidden.ways) expect(doc.way(id).tags?.building).toBeDefined()
    expect(countMatches(doc, { key: 'building', op: 'exists', value: '' })).toBeGreaterThanOrEqual(hidden.ways.size)
  })

  it('игнорирует выключенные и недописанные правила', () => {
    const { doc } = setup(parseSample())
    expect(computeHidden(doc, [rule({ enabled: false })]).ways.size).toBe(0)
    expect(computeHidden(doc, [rule({ op: 'eq', value: '' })]).ways.size).toBe(0)
  })

  it('собирает подсказки ключей без служебного шума', () => {
    const { doc } = setup(parseSample())
    const stats = collectKeyStats(doc)
    expect(stats.find((stat) => stat.key === 'highway')?.values.some((item) => item.value === 'footway')).toBe(true)
    expect(stats.some((stat) => stat.key.startsWith('addr:'))).toBe(false)
  })
})

describe('разделители полос', () => {
  it('разбирает правила change:lanes с точки зрения полосы', () => {
    expect(canChangeLane(['not_right', 'yes'], 0, 1)).toBe(false)
    expect(canChangeLane(['not_right', 'yes'], 1, 0)).toBe(true)
    expect(canChangeLane(['no', 'no'], 1, 0)).toBe(false)
    expect(canChangeLane(null, 0, 1)).toBe(true)
  })

  it('пишет и читает сплошную и двойную линии', () => {
    const base = { highway: 'primary', oneway: 'yes', lanes: '3' }
    const solid = withDivider(base, 'forward', 0, 'none')
    expect(solid['change:lanes']).toBe('not_right|not_left|yes')
    expect(dividerMode(parseProfile(solid).changeForward, 0)).toBe('none')
    expect(dividerMode(parseProfile(solid).changeForward, 1)).toBe('both')

    const half = withDivider(base, 'forward', 1, 'to_right')
    expect(dividerMode(parseProfile(half).changeForward, 1)).toBe('to_right')
    const back = withDivider(half, 'forward', 1, 'both')
    expect(back['change:lanes']).toBeUndefined()
  })

  it('ведёт правила отдельно по направлениям двусторонней дороги', () => {
    const tags = withDivider({ highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' }, 'backward', 0, 'none')
    expect(tags['change:lanes:backward']).toBe('not_right|not_left')
    expect(tags['change:lanes:forward']).toBeUndefined()
  })

  it('подгоняет правила при смене числа полос', () => {
    const tags = withLanes({ highway: 'primary', oneway: 'yes', lanes: '3', 'change:lanes': 'no|no|no' }, 2, 0)
    expect(tags['change:lanes']).toBe('no|no')
  })

  it('рисует сплошную линию там, где перестраиваться нельзя', () => {
    const raw = crossroads()
    raw.ways[0]!.tags = withDivider({ highway: 'primary', oneway: 'yes', lanes: '3' }, 'forward', 0, 'none')
    const { doc, projector } = setup(raw)
    const { scene } = buildScene(doc, projector)
    const kinds = scene.markings.features.filter((f) => f.properties?.wayId === 10).map((f) => f.properties?.kind)
    expect(kinds).toContain('lane-solid')
    expect(kinds).toContain('lane')
  })

  it('законопослушный водитель не пересекает сплошную', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 6, lat: 52, lon: 104 - 3 * STEP })
    raw.ways.push({
      id: 30,
      nds: [6, 1],
      tags: withDivider({ highway: 'primary', oneway: 'yes', lanes: '2' }, 'forward', 0, 'none'),
    })
    raw.ways[0]!.tags = { highway: 'primary', oneway: 'yes', lanes: '1' }
    raw.ways[1]!.tags = { highway: 'primary', oneway: 'yes', lanes: '1' }
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, false)
    const edge = net.edges.find((item) => item.wayId === 30)!
    expect(canChangeLane(edge.link.profile.changeForward, 0, 1)).toBe(false)
  })
})

describe('соединения полос', () => {
  it('разбирает и собирает значение connectivity', () => {
    expect(parseConnectivity('1:1,2|2:3')).toEqual([[0, 0], [0, 1], [1, 2]])
    expect(parseConnectivity('1:(2)')).toEqual([[0, 1]])
    expect(formatConnectivity([[1, 2], [0, 1], [0, 0]])).toBe('1:1,2|2:3')
  })

  it('разрешает поворот с полосы, с которой его обычно нет', () => {
    const { doc, projector } = setup()
    const before = nodeConnectors(doc, projector, 2).connectors
    // С западного подхода налево на север обычно поворачивают только с левой полосы
    const leftBefore = before.filter((c) => c.from.neighbor === 1 && c.to.neighbor === 5)
    expect(leftBefore.map((c) => c.fromLane)).toEqual([0])

    doc.transact('соединение', () => setLaneConnection(doc, projector, 2, 1, 1, 5, 0, true))
    const after = nodeConnectors(doc, projector, 2).connectors
    const leftAfter = after.filter((c) => c.from.neighbor === 1 && c.to.neighbor === 5)
    expect(leftAfter.map((c) => c.fromLane).sort()).toEqual([0, 1])
    expect(connectivityAt(doc, 2)).toHaveLength(1)

    // Манёвр записан и в turn:lanes: этот тег читают симуляторы
    const way = doc.way(10)
    expect(way.tags?.['turn:lanes:forward']?.split('|')[1]).toContain('left')
  })

  it('отключение последнего соединения превращается в запрет поворота', () => {
    const { doc, projector } = setup()
    doc.transact('соединение', () => setLaneConnection(doc, projector, 2, 1, 0, 5, 0, false))
    const after = nodeConnectors(doc, projector, 2).connectors
    expect(after.some((c) => c.from.neighbor === 1 && c.to.neighbor === 5)).toBe(false)
    expect([...doc.relations.values()].some((r) => r.tags?.type === 'restriction')).toBe(true)
  })

  it('сбрасывает ручные соединения и отменяется одним шагом', () => {
    const { doc, projector } = setup()
    doc.transact('соединение', () => setLaneConnection(doc, projector, 2, 1, 1, 5, 0, true))
    doc.transact('сброс', () => resetLaneConnections(doc, 2))
    expect(connectivityAt(doc, 2)).toHaveLength(0)
    doc.undo()
    expect(connectivityAt(doc, 2)).toHaveLength(1)
    doc.undo()
    expect(doc.changeCount).toBe(0)
  })

  it('машины в симуляции получают разрешённый вручную манёвр', () => {
    const { doc, projector } = setup()
    doc.transact('соединение', () => setLaneConnection(doc, projector, 2, 1, 1, 5, 0, true))
    const net = buildSimNet(doc, projector, false)
    const lane = net.edges.find((edge) => edge.wayId === 10 && edge.forward)!.lanes[1]!
    expect(lane.connectors.some((c) => c.toLane.edge.wayId === 21)).toBe(true)
  })
})

describe('фазы светофора', () => {
  const plan: SignalPlan = {
    offset: 0,
    yellow: 3,
    allRed: 2,
    phases: [
      { green: 30, movements: ['a', 'b'] },
      { green: 10, movements: ['b'] },
      { green: 20, movements: ['c'] },
    ],
  }

  it('считает цикл и окна фаз', () => {
    expect(cycleLength(plan)).toBe(75)
    expect(phaseWindows(plan).map((w) => w.start)).toEqual([0, 35, 50])
  })

  it('даёт жёлтый и красный между фазами', () => {
    const windows = phaseWindows(plan)
    expect(colorAt(plan, windows, [0], 10)).toBe('green')
    expect(colorAt(plan, windows, [0], 31)).toBe('yellow')
    expect(colorAt(plan, windows, [0], 34)).toBe('red')
    expect(colorAt(plan, windows, [0], 40)).toBe('red')
  })

  it('не прерывает зелёный манёвра, который идёт и в следующей фазе', () => {
    const windows = phaseWindows(plan)
    expect(colorAt(plan, windows, [0, 1], 32)).toBe('green')
    expect(colorAt(plan, windows, [0, 1], 34)).toBe('green')
    expect(colorAt(plan, windows, [0, 1], 46)).toBe('yellow')
  })

  it('считает долю зелёного', () => {
    expect(greenShare(plan, [2])).toBeCloseTo(21.5 / 75)
    expect(greenShare(plan, [0, 1])).toBeGreaterThan(greenShare(plan, [0]))
  })

  it('считает секунды каждого сигнала по направлению', () => {
    expect(signalTimes(plan, [0])).toEqual({ green: 30, yellow: 3, red: 42 })
    expect(signalTimes(plan, [2])).toEqual({ green: 20, yellow: 3, red: 52 })
    // Идущий через две фазы манёвр зелёный и между ними
    expect(signalTimes(plan, [0, 1])).toEqual({ green: 45, yellow: 3, red: 27 })
    // Зелёный во всех фазах горит постоянно
    expect(signalTimes(plan, [0, 1, 2])).toEqual({ green: 75, yellow: 0, red: 0 })
  })

  it('отрезки графика совпадают с сигналом модели в каждый момент цикла', () => {
    const fractional: SignalPlan = { ...plan, yellow: 3.5, allRed: 1.5 }
    const windows = phaseWindows(fractional)
    for (const phases of [[0], [1], [2], [0, 1], [1, 2], [0, 2], [0, 1, 2]]) {
      const segments = signalSegments(fractional, phases)
      expect(segments.reduce((sum, segment) => sum + segment.length, 0)).toBe(cycleLength(fractional))
      for (let t = 0; t < cycleLength(fractional); t += 0.25) {
        const segment = segments.find((item) => t >= item.start && t < item.start + item.length)!
        expect(segment.color, `фазы ${phases}, момент ${t}`).toBe(colorAt(fractional, windows, phases, t))
      }
    }
  })

  it('считает, сколько сигнал ещё будет гореть', () => {
    expect(signalRemaining(plan, [0], 10)).toEqual({ color: 'green', left: 20 })
    expect(signalRemaining(plan, [0], 31)).toEqual({ color: 'yellow', left: 2 })
    // Красный в конце цикла переходит через ноль: здесь у манёвра зелёный начинается в начале цикла
    expect(signalRemaining(plan, [0], 70)).toEqual({ color: 'red', left: 5 })
    // А здесь красный занимает и конец, и начало цикла
    expect(signalRemaining(plan, [1], 72)).toEqual({ color: 'red', left: 38 })
    expect(signalRemaining(plan, [0, 1, 2], 10).left).toBe(Number.POSITIVE_INFINITY)
  })

  it('задаёт зелёный направления, меняя длину цикла', () => {
    const next = withGreenTime(plan, [2], 35)
    expect(signalTimes(next, [2]).green).toBe(35)
    expect(next.phases.map((phase) => phase.green)).toEqual([30, 10, 35])
    expect(cycleLength(next)).toBe(90)
    // Исходный план не меняется: его держит история отмены
    expect(plan.phases[2]!.green).toBe(20)
  })

  it('задаёт зелёный направления из нескольких фаз пропорционально', () => {
    const next = withGreenTime(plan, [0, 1], 65)
    expect(signalTimes(next, [0, 1]).green).toBe(65)
    expect(next.phases[0]!.green).toBeGreaterThan(next.phases[1]!.green)
    expect(next.phases[2]!.green).toBe(20)
  })

  it('задаёт красный направления через остальные фазы', () => {
    const next = withRedTime(plan, [2], 30)
    const times = signalTimes(next, [2])
    expect(times.red).toBe(30)
    expect(times.green).toBe(20)
    expect(next.phases[2]!.green).toBe(20)
    expect(next.phases[0]!.green).toBeGreaterThan(next.phases[1]!.green)
  })

  it('не выводит фазы за пределы и не зависает на них', () => {
    const shortest = withRedTime(plan, [2], 0)
    expect(shortest.phases[0]!.green).toBe(MIN_GREEN_S)
    expect(shortest.phases[1]!.green).toBe(MIN_GREEN_S)
    const longest = withGreenTime(plan, [2], 100000)
    expect(longest.phases[2]!.green).toBe(MAX_GREEN_S)
    expect(withGreenTime(plan, [2], -5).phases[2]!.green).toBe(MIN_GREEN_S)
    // У направления со всеми фазами отбирать зелёный не у кого
    expect(withRedTime(plan, [0, 1, 2], 30).phases).toEqual(plan.phases)
  })

  it('растягивает цикл, сохраняя соотношение фаз', () => {
    const next = withCycleLength(plan, 135)
    expect(cycleLength(next)).toBe(135)
    expect(next.phases.map((phase) => phase.green)).toEqual([60, 20, 40])
  })

  it('передаёт зелёный между фазами, не меняя цикл', () => {
    const next = withGreenMoved(plan, 1, 0, 4)
    expect(next.phases.map((phase) => phase.green)).toEqual([34, 6, 20])
    expect(cycleLength(next)).toBe(75)
    const limited = withGreenMoved(plan, 1, 0, 100)
    expect(limited.phases[1]!.green).toBe(MIN_GREEN_S)
    expect(cycleLength(limited)).toBe(75)
    const back = withGreenMoved(plan, 1, 0, -100)
    expect(back.phases[0]!.green).toBe(MIN_GREEN_S)
    expect(cycleLength(back)).toBe(75)
  })

  it('новый план применяется к готовой сети, не пересобирая её', () => {
    const raw = crossroads()
    raw.nodes[1]!.tags = { highway: 'traffic_signals' }
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, false)
    const group = signalGroupAt(net, 2)!
    const main = group.connectors.find((c) => c.fromLane.edge.wayId === 10)!
    const autoCycle = group.cycle
    const autoOffset = group.plan.offset

    const next = withCycleLength(group.plan, autoCycle + 40)
    doc.transact('план', () => setSignalPlan(doc, 2, next))
    refreshSignalPlans(doc, net)
    expect(signalGroupAt(net, 2)).toBe(group)
    expect(group.custom).toBe(true)
    expect(group.cycle).toBe(autoCycle + 40)
    expect(group.windows).toEqual(phaseWindows(next))
    expect(signalState(main, 0)).toBe(colorAt(next, group.windows, main.phases, next.offset % group.cycle))

    doc.transact('автоплан', () => setSignalPlan(doc, 2, null))
    refreshSignalPlans(doc, net)
    expect(group.custom).toBe(false)
    expect(group.cycle).toBe(autoCycle)
    expect(group.plan.offset).toBe(autoOffset)
  })

  it('показывает светофор по направлениям с секундами сигналов', () => {
    const raw = crossroads()
    raw.nodes[1]!.tags = { highway: 'traffic_signals' }
    const { doc, projector } = setup(raw)
    const group = signalGroupAt(buildSimNet(doc, projector, false), 2)!
    const directions = signalDirections(group)
    expect(directions.length).toBeGreaterThan(1)
    expect(new Set(directions.map((item) => item.key)).size).toBe(directions.length)
    for (const direction of directions) {
      const { green, yellow, red } = direction.times
      expect(green + yellow + red).toBe(group.cycle)
      expect(green).toBeGreaterThan(0)
      expect(direction.kinds).not.toBe('')
      // Одинаковый подход с одинаковым сигналом не должен повторяться отдельной строкой
      const twins = directions.filter((item) => item.title === direction.title && item.phases.join() === direction.phases.join())
      expect(twins).toHaveLength(1)
    }
    // Во время перетаскивания секунды считаются по черновому плану, сеть ещё старая
    const draft = withGreenMoved(group.plan, 1, 0, 5)
    const first = signalDirections(group).find((item) => item.phases.includes(0))!
    const moved = signalDirections(group, draft).find((item) => item.key === first.key)!
    expect(moved.times.green).toBe(first.times.green + 5)
  })

  it('не падает на испорченном теге', () => {
    expect(parseSignalPlan({ 'signal:plan': 'мусор' })).toBeNull()
    expect(parseSignalPlan({ 'signal:plan': '{"phases":[]}' })).toBeNull()
  })

  it('заданный план управляет симуляцией и пропускной способностью', () => {
    const raw = crossroads()
    raw.nodes[1]!.tags = { highway: 'traffic_signals' }
    const { doc, projector } = setup(raw)
    const auto = signalGroupAt(buildSimNet(doc, projector, false), 2)!
    expect(auto.custom).toBe(false)

    const mainMoves = auto.connectors.filter((c) => c.fromLane.edge.wayId === 10 || c.fromLane.edge.wayId === 11).map((c) => c.movement)
    const crossMoves = auto.connectors.filter((c) => c.fromLane.edge.wayId === 20 || c.fromLane.edge.wayId === 21).map((c) => c.movement)
    const custom: SignalPlan = {
      offset: 0,
      yellow: 3,
      allRed: 2,
      phases: [
        { green: 80, movements: [...new Set(mainMoves)] },
        { green: 10, movements: [...new Set(crossMoves)] },
      ],
    }
    doc.transact('план', () => setSignalPlan(doc, 2, custom))
    const net = buildSimNet(doc, projector, false)
    const group = signalGroupAt(net, 2)!
    expect(group.custom).toBe(true)
    expect(group.cycle).toBe(100)
    const main = group.connectors.find((c) => c.fromLane.edge.wayId === 10)!
    expect(signalState(main, 40)).toBe('green')
    expect(signalState(main, 90)).toBe('red')

    const macro = runMacro(doc, net, { period: 'morning', demand: 1 })
    const load = macro.loads.get(main.fromLane.edge)!
    expect(load.factors.some((factor) => factor.label.includes('Светофор'))).toBe(true)
    expect(load.capacity).toBeCloseTo(3000 * (81.5 / 100))
  })

  it('не оставляет без зелёного манёвр, которого нет в плане', () => {
    const raw = crossroads()
    raw.nodes[1]!.tags = {
      highway: 'traffic_signals',
      'signal:plan': JSON.stringify({ offset: 0, yellow: 3, allRed: 2, phases: [{ green: 30, movements: [movementKey(2, 1, 3)] }] }),
    }
    const { doc, projector } = setup(raw)
    const group = signalGroupAt(buildSimNet(doc, projector, false), 2)!
    expect(group.unassigned).toBeGreaterThan(0)
    for (const connector of group.connectors) expect(connector.phases.length).toBeGreaterThan(0)
  })
})

describe('маршруты ОТ', () => {
  it('разбирает интервал в разных записях', () => {
    expect(parseInterval({ interval: '15' })).toBe(15)
    expect(parseInterval({ interval: '00:20' })).toBe(20)
    expect(parseInterval({ interval: 'часто' })).toBeNull()
    expect(parseInterval({})).toBeNull()
  })

  it('читает маршруты настоящего файла', () => {
    const { doc, projector } = setup(parseSample())
    const lines = listLines(doc, projector)
    expect(lines.length).toBeGreaterThan(50)
    const line = lines.find((item) => item.ref === '334')!
    expect(line.mode).toBe('bus')
    expect(line.wayIds.length).toBeGreaterThan(10)
    expect(line.outsideWays).toBeGreaterThan(50)
    expect(line.lengthM).toBeGreaterThan(300)
  })

  it('выстраивает дороги маршрута в цепочку с правильным направлением', () => {
    const raw = crossroads()
    raw.ways[0] = { id: 10, nds: [2, 1], tags: { highway: 'primary' } }
    const { doc } = setup(raw)
    expect(lineSegments(doc, [10, 11])).toEqual([[1, 2, 3]])
  })

  it('начинает новый кусок там, где маршрут обрывается', () => {
    const { doc } = setup()
    expect(lineSegments(doc, [10, 21, 20])).toEqual([[1, 2, 5], [4, 2]])
  })

  it('создаёт маршрут, добавляет дороги и остановки, удаляет', () => {
    const { doc, projector } = setup()
    const id = doc.transact('маршрут', () => createLine(doc, { ref: '7', mode: 'bus', interval: 10 }))
    doc.transact('дорога', () => addLineWay(doc, id, 10))
    const result = doc.transact('дорога', () => addLineWay(doc, id, 11))
    expect(result.connected).toBe(true)
    expect(doc.transact('дорога', () => addLineWay(doc, id, 20)).connected).toBe(true)
    doc.transact('остановка', () => addLineStop(doc, projector, id, 3))
    doc.transact('остановка', () => addLineStop(doc, projector, id, 1))

    const line = readLine(doc, doc.relations.get(id)!, projector)
    expect(line.interval).toBe(10)
    expect(line.wayIds).toEqual([10, 11, 20])
    // Остановки встают в порядке следования, а не в порядке добавления
    expect(line.stops.map((stop) => stop.node)).toEqual([1, 3])

    doc.transact('дорога', () => removeLineWay(doc, id, 20))
    expect(readLine(doc, doc.relations.get(id)!, projector).wayIds).toEqual([10, 11])
    doc.transact('удаление', () => deleteLine(doc, id))
    expect(doc.relations.has(id)).toBe(false)
  })

  it('автобусы занимают дорогу в макромодели', () => {
    const raw = crossroads()
    raw.relations.push({
      id: 70,
      members: [['way', 10, ''], ['way', 11, '']],
      tags: { type: 'route', route: 'bus', ref: '1', interval: '5' },
    })
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, false)
    const services = buildServices(doc, net, listLines(doc, projector))
    expect(services).toHaveLength(1)
    expect(services[0]!.frequency).toBe(12)
    const macro = runMacro(doc, net, { period: 'morning', demand: 1 }, services)
    const load = macro.loads.get(services[0]!.edges[0]!)!
    expect(load.busesPerHour).toBe(12)
    expect(load.transitPcu).toBe(30)
    expect(macro.lines[0]!.speedKmh).toBeGreaterThan(0)
  })
})

function runSim(sim: MicroSim, seconds: number, each?: () => void): void {
  const steps = Math.round(seconds / SIM_STEP_S)
  for (let i = 0; i < steps; i++) {
    sim.step(SIM_STEP_S)
    sim.updatePoses()
    each?.()
  }
}

// Полный прогон модели на настоящем файле: в одиночку 2–3 с, но при параллельном запуске всех тестов
// не укладывается в стандартные 5 с
describe('движение на настоящем файле', { timeout: 30_000 }, () => {
  const raw = parseSample()

  it('машины движутся плавно: без прыжков и резких поворотов кузова', () => {
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, true)
    const macro = runMacro(doc, net, { period: 'morning', demand: 1 })
    const sim = new MicroSim(net, macro.flows, { scale: 1, mix: { aggressive: 0.3, calm: 0.1 } })
    let worstJump = 0
    let worstTurn = 0
    let samples = 0
    runSim(sim, 400, () => {
      for (const car of sim.cars) {
        if (!car.placed || car.prevX === car.x) continue
        samples++
        const jump = Math.hypot(car.x - car.prevX, car.y - car.prevY)
        // За шаг машина проходит v·dt, а запас покрывает разворот кузова и гашение стыка
        worstJump = Math.max(worstJump, jump - car.v * SIM_STEP_S)
        let turn = Math.abs(car.heading - car.prevHeading)
        if (turn > Math.PI) turn = 2 * Math.PI - turn
        worstTurn = Math.max(worstTurn, turn)
      }
    })
    expect(samples).toBeGreaterThan(10000)
    expect(worstJump).toBeLessThan(1.5)
    // Меньше 25° за десятую долю секунды: на глаз это уже не рывок
    expect(worstTurn).toBeLessThan((25 * Math.PI) / 180)
  })

  it('лихачи нарушают, а спокойные водители нет', () => {
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, true)
    const macro = runMacro(doc, net, { period: 'morning', demand: 1 })
    const reckless = new MicroSim(net, macro.flows, { scale: 1, mix: { aggressive: 1, calm: 0 } })
    runSim(reckless, 300)
    const bad = Object.values(reckless.stats().violations).reduce((sum, value) => sum + value, 0)
    expect(bad).toBeGreaterThan(0)
    expect(reckless.stats().byStyle.aggressive).toBeGreaterThan(0)
    expect(reckless.stats().speeding).toBeGreaterThan(0)

    const net2 = buildSimNet(doc, projector, true)
    const macro2 = runMacro(doc, net2, { period: 'morning', demand: 1 })
    const careful = new MicroSim(net2, macro2.flows, { scale: 1, mix: { aggressive: 0, calm: 1 } })
    runSim(careful, 300)
    expect(Object.values(careful.stats().violations).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it('лихачи едут быстрее спокойных на свободной дороге', () => {
    const { doc, projector } = setup(raw)
    const average = (mix: { aggressive: number; calm: number }) => {
      const net = buildSimNet(doc, projector, false)
      const macro = runMacro(doc, net, { period: 'midday', demand: 0.2 })
      const sim = new MicroSim(net, macro.flows, { scale: 1, mix })
      let sum = 0
      let count = 0
      runSim(sim, 240, () => {
        for (const car of sim.cars) {
          sum += car.v
          count++
        }
      })
      return sum / count
    }
    expect(average({ aggressive: 1, calm: 0 })).toBeGreaterThan(average({ aggressive: 0, calm: 1 }))
  })

  it('автобусы едут по маршрутам и стоят на остановках', () => {
    const { doc, projector } = setup(raw)
    const net = buildSimNet(doc, projector, true)
    const lines = listLines(doc, projector)
    const services = buildServices(doc, net, lines)
    expect(services.length).toBeGreaterThan(20)
    expect(services.filter((service) => service.stops.length > 0).length).toBeGreaterThan(10)

    const macro = runMacro(doc, net, { period: 'midday', demand: 0.3 }, services)
    const sim = new MicroSim(net, macro.flows, { scale: 1, services })
    let dwelling = 0
    runSim(sim, 900, () => {
      for (const car of sim.cars) if (car.dwell > 0) dwelling++
    })
    const stats = sim.stats()
    expect(stats.buses + stats.busTrips).toBeGreaterThan(5)
    expect(stats.busTrips).toBeGreaterThan(0)
    expect(dwelling).toBeGreaterThan(0)
    expect(stats.teleported / Math.max(1, stats.spawned)).toBeLessThan(0.05)
  })
})
