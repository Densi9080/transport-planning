import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { laneOffsets, parseProfile, toggleTurn, withLanes, withTurns } from '../lanes'
import { isSignalNode } from '../nodeKinds'
import {
  deleteNode,
  deleteWay,
  insertNodeOnWay,
  joinWays,
  mergeNodes,
  moveNode,
  reverseWay,
  setMovementAllowed,
  splitWay,
  toggleStructure,
  unglueNode,
} from '../ops'
import { buildScene, buildStaticScene } from '../scene'
import { buildNetwork, junctionMovements, turnKind } from '../topology'
import type { RawDocument } from '../types'
import { validate } from '../validate'
import { parseSample } from './sample'

const STEP = 0.001

/**
 * Перекрёсток: дорога 10 идёт с запада на восток через узел 2,
 * дорога 20 приходит с юга и заканчивается в нём.
 */
function crossroads(): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: 52, lon: 104 - STEP },
      { id: 2, lat: 52, lon: 104 },
      { id: 3, lat: 52, lon: 104 + STEP },
      { id: 4, lat: 52 - STEP, lon: 104 },
    ],
    ways: [
      { id: 10, nds: [1, 2, 3], tags: { highway: 'secondary', name: 'Главная' } },
      { id: 20, nds: [4, 2], tags: { highway: 'residential', name: 'Боковая' } },
    ],
    relations: [
      { id: 50, members: [['way', 10, ''], ['way', 999, '']], tags: { type: 'route', route: 'bus' } },
    ],
  }
}

function setup(raw = crossroads()) {
  const doc = new OsmDoc(raw)
  return { doc, projector: new Projector(raw.bounds) }
}

describe('OsmDoc', () => {
  it('не показывает правки, пока их нет', () => {
    const { doc } = setup()
    expect(doc.changeCount).toBe(0)
  })

  it('отменяет и повторяет составную правку одним шагом', () => {
    const { doc } = setup()
    doc.transact('правка', () => {
      moveNode(doc, 1, { lat: 1, lon: 1 })
      moveNode(doc, 3, { lat: 2, lon: 2 })
    })
    expect(doc.changes().nodes?.upsert).toHaveLength(2)

    doc.undo()
    expect(doc.node(1).lon).toBe(104 - STEP)
    expect(doc.changeCount).toBe(0)

    doc.redo()
    expect(doc.node(3).lat).toBe(2)
  })

  it('откатывает всё, если операция упала', () => {
    const { doc } = setup()
    expect(() =>
      doc.transact('сбой', () => {
        moveNode(doc, 1, { lat: 1, lon: 1 })
        throw new Error('сбой')
      }),
    ).toThrow()
    expect(doc.node(1).lat).toBe(52)
    expect(doc.canUndo).toBe(false)
  })

  it('не считает правкой возврат к исходному значению', () => {
    const { doc } = setup()
    const { lat, lon } = doc.node(1)
    doc.transact('туда', () => moveNode(doc, 1, { lat: 0, lon: 0 }))
    doc.transact('обратно', () => moveNode(doc, 1, { lat, lon }))
    expect(doc.changeCount).toBe(0)
  })

  it('поддерживает индекс узлов при отмене удаления дороги', () => {
    const { doc } = setup()
    doc.transact('удаление', () => doc.removeWay(20))
    expect(doc.waysOfNode(2)).toEqual([10])
    doc.undo()
    expect(doc.waysOfNode(2).sort()).toEqual([10, 20])
  })

  it('восстанавливает сохранённые правки и выдаёт id выше них', () => {
    const { doc } = setup()
    doc.applySaved({ nodes: { upsert: [{ id: 5000, lat: 1, lon: 1 }], delete: [] } })
    expect(doc.nodes.has(5000)).toBe(true)
    expect(doc.newId()).toBeGreaterThan(5000)
    expect(doc.canUndo).toBe(false)
  })
})

describe('полосы', () => {
  it('читает разные способы задать число полос', () => {
    expect(parseProfile({ highway: 'primary', lanes: '4' })).toMatchObject({ forward: 2, backward: 2, inferred: false })
    expect(parseProfile({ highway: 'primary', lanes: '3', oneway: 'yes' })).toMatchObject({ forward: 3, backward: 0 })
    expect(parseProfile({ highway: 'primary', lanes: '3', oneway: '-1' })).toMatchObject({ forward: 0, backward: 3 })
    expect(
      parseProfile({ highway: 'primary', lanes: '5', 'lanes:forward': '3', 'lanes:backward': '2' }),
    ).toMatchObject({ forward: 3, backward: 2 })
    expect(parseProfile({ highway: 'residential' })).toMatchObject({ forward: 1, backward: 1, inferred: true })
  })

  it('кольцо считается односторонним без тега oneway', () => {
    expect(parseProfile({ highway: 'primary', junction: 'roundabout', lanes: '2' }).oneway).toBe(true)
  })

  it('размещает потоки по правилу правостороннего движения', () => {
    const offsets = laneOffsets(parseProfile({ highway: 'primary', lanes: '4' }))
    expect(offsets.forward.every((value) => value < 0)).toBe(true)
    expect(offsets.backward.every((value) => value > 0)).toBe(true)
    // Левая полоса по ходу движения ближе к разделительной линии, чем правая
    expect(offsets.forward[0]!).toBeGreaterThan(offsets.forward[1]!)
    expect(offsets.backward[0]!).toBeLessThan(offsets.backward[1]!)
  })

  it('пишет теги полос и подгоняет манёвры', () => {
    const twoWay = withLanes({ highway: 'primary', 'turn:lanes:forward': 'left|through|right' }, 2, 1)
    expect(twoWay).toMatchObject({ lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', 'turn:lanes:forward': 'left|through' })

    const oneway = withLanes({ highway: 'primary', oneway: 'yes', 'turn:lanes': 'left|through', 'lanes:forward': '2' }, 3, 0)
    expect(oneway).toMatchObject({ lanes: '3', 'turn:lanes': 'left|through|' })
    expect(oneway['lanes:forward']).toBeUndefined()
  })

  it('собирает значение манёвра в порядке OSM', () => {
    expect(toggleTurn('through', 'left')).toBe('left;through')
    expect(toggleTurn('left;through', 'left')).toBe('through')
    expect(toggleTurn('none', 'right')).toBe('right')
  })

  it('убирает тег, когда манёвров не осталось', () => {
    const tags = withTurns({ highway: 'primary', oneway: 'yes', 'turn:lanes': 'left' }, 'forward', [''])
    expect(tags['turn:lanes']).toBeUndefined()
  })
})

describe('операции над графом', () => {
  it('вставляет узел в нужный отрезок', () => {
    const { doc, projector } = setup()
    const id = doc.transact('узел', () => insertNodeOnWay(doc, projector, 10, { lat: 52.00001, lon: 104 + STEP / 2 }))
    expect(doc.way(10).nds).toEqual([1, 2, id, 3])
    expect(doc.node(id).lat).toBeCloseTo(52, 6)
  })

  it('разрезает дорогу и сохраняет порядок в маршруте', () => {
    const { doc } = setup()
    const newId = doc.transact('разрез', () => splitWay(doc, 10, 2))!
    expect(doc.way(10).nds).toEqual([1, 2])
    expect(doc.way(newId).nds).toEqual([2, 3])
    expect(doc.way(newId).tags?.name).toBe('Главная')
    expect(doc.relations.get(50)?.members.map(([, ref]) => ref)).toEqual([10, newId, 999])
  })

  it('не режет дорогу в её конце', () => {
    const { doc } = setup()
    expect(doc.transact('разрез', () => splitWay(doc, 10, 1))).toBeNull()
    expect(doc.transact('разрез', () => splitWay(doc, 10, 3))).toBeNull()
  })

  it('разрезает кольцо на две части', () => {
    const raw = crossroads()
    raw.ways = [{ id: 10, nds: [1, 2, 3, 4, 1], tags: { highway: 'service' } }]
    raw.relations = []
    const { doc } = setup(raw)
    const newId = doc.transact('разрез', () => splitWay(doc, 10, 2))!
    const a = doc.way(10).nds
    const b = doc.way(newId).nds
    expect(a.at(0)).toBe(b.at(-1))
    expect(a.at(-1)).toBe(b.at(0))
    expect(a.length + b.length).toBe(6)
  })

  it('оставляет участником запрета ту часть, что касается via', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 5, lat: 52, lon: 104 + 2 * STEP })
    raw.ways[0]!.nds = [1, 2, 3, 5]
    raw.relations = [
      {
        id: 60,
        members: [['way', 10, 'from'], ['node', 2, 'via'], ['way', 20, 'to']],
        tags: { type: 'restriction', restriction: 'no_right_turn' },
      },
    ]
    const { doc } = setup(raw)
    // Длинная часть 2-3-5 остаётся с id 10, узел via есть в обеих
    const newId = doc.transact('разрез', () => splitWay(doc, 10, 3))!
    const fromRef = doc.relations.get(60)!.members[0]![1]
    expect(doc.way(fromRef).nds).toContain(2)
    expect(newId).not.toBe(10)
  })

  it('склеивает узлы и переносит теги', () => {
    const raw = crossroads()
    raw.nodes[3]!.tags = { highway: 'traffic_signals' }
    const { doc } = setup(raw)
    doc.transact('склейка', () => mergeNodes(doc, 2, 4))
    expect(doc.nodes.has(4)).toBe(false)
    expect(doc.node(2).tags?.highway).toBe('traffic_signals')
    // Дорога 20 схлопнулась в точку и должна исчезнуть
    expect(doc.ways.has(20)).toBe(false)
  })

  it('удаляет дорогу вместе с осиротевшими узлами, но не трогает общие', () => {
    const { doc } = setup()
    doc.transact('удаление', () => deleteWay(doc, 20))
    expect(doc.ways.has(20)).toBe(false)
    expect(doc.nodes.has(4)).toBe(false)
    expect(doc.nodes.has(2)).toBe(true)
  })

  it('удаляет запрет вместе с его участником', () => {
    const raw = crossroads()
    raw.relations.push({
      id: 60,
      members: [['way', 10, 'from'], ['node', 2, 'via'], ['way', 20, 'to']],
      tags: { type: 'restriction', restriction: 'no_right_turn' },
    })
    const { doc } = setup(raw)
    doc.transact('удаление', () => deleteWay(doc, 20))
    expect(doc.relations.has(60)).toBe(false)
    // Маршрут остаётся: из него просто уходит удалённая дорога
    expect(doc.relations.has(50)).toBe(true)
  })

  it('при удалении узла соединяет соседей или убирает дорогу', () => {
    const { doc } = setup()
    doc.transact('удаление', () => deleteNode(doc, 2))
    expect(doc.way(10).nds).toEqual([1, 3])
    expect(doc.ways.has(20)).toBe(false)
  })

  it('расклеивает перекрёсток и отдаёт дорогам разные узлы', () => {
    const { doc, projector } = setup()
    const created = doc.transact('расклейка', () => unglueNode(doc, projector, 2))
    expect(created).toHaveLength(1)
    const firstUses = doc.way(10).nds.includes(2)
    const secondUses = doc.way(20).nds.includes(2)
    expect(firstUses !== secondUses).toBe(true)
  })

  it('разворачивает одностороннюю дорогу вместе с движением', () => {
    const raw = crossroads()
    raw.ways[0]!.tags = { highway: 'primary', oneway: 'yes', 'turn:lanes:forward': 'left|through' }
    const { doc } = setup(raw)
    doc.transact('разворот', () => reverseWay(doc, 10))
    expect(doc.way(10).nds).toEqual([3, 2, 1])
    expect(doc.way(10).tags?.['turn:lanes:forward']).toBe('left|through')
  })

  it('разворачивает порядок двусторонней дороги, не меняя движение', () => {
    const raw = crossroads()
    raw.ways[0]!.tags = {
      highway: 'primary',
      lanes: '3',
      'lanes:forward': '2',
      'lanes:backward': '1',
      'cycleway:left': 'lane',
    }
    const { doc } = setup(raw)
    doc.transact('разворот', () => reverseWay(doc, 10))
    expect(doc.way(10).tags).toMatchObject({ 'lanes:forward': '1', 'lanes:backward': '2', 'cycleway:right': 'lane' })
  })

  it('объединяет дороги с общим концом и не трогает лишние', () => {
    const raw = crossroads()
    raw.ways = [
      { id: 10, nds: [1, 2], tags: { highway: 'primary' } },
      { id: 20, nds: [2, 3], tags: { highway: 'primary' } },
      { id: 30, nds: [4, 3], tags: { highway: 'primary', oneway: 'yes' } },
    ]
    raw.relations = []
    const { doc } = setup(raw)
    expect(doc.transact('join', () => joinWays(doc, 10, 20))).toBe(true)
    expect(doc.way(10).nds).toEqual([1, 2, 3])
    expect(doc.ways.has(20)).toBe(false)
    // Навстречу односторонней склеивать нельзя
    expect(doc.transact('join', () => joinWays(doc, 10, 30))).toBe(false)
  })

  it('ставит уровень вместе с мостом и снимает его', () => {
    const { doc } = setup()
    doc.transact('мост', () => toggleStructure(doc, 20, 'bridge'))
    expect(doc.way(20).tags).toMatchObject({ bridge: 'yes', layer: '1' })
    doc.transact('мост', () => toggleStructure(doc, 20, 'bridge'))
    expect(doc.way(20).tags?.bridge).toBeUndefined()
    expect(doc.way(20).tags?.layer).toBeUndefined()
  })
})

describe('топология и запреты', () => {
  it('определяет направления манёвров при правостороннем движении', () => {
    const { doc, projector } = setup()
    const network = buildNetwork(doc, projector)
    const arms = network.arms.get(2)!
    expect(arms).toHaveLength(3)
    const west = arms.find((arm) => arm.neighbor === 1)!
    const east = arms.find((arm) => arm.neighbor === 3)!
    const south = arms.find((arm) => arm.neighbor === 4)!
    expect(turnKind(west, east)).toBe('through')
    // Едем на восток, юг справа
    expect(turnKind(west, south)).toBe('right')
    // Едем на север с юга, запад слева
    expect(turnKind(south, west)).toBe('left')
    expect(turnKind(south, east)).toBe('right')
  })

  it('запрет режет дорогу в узле и записывает отношение', () => {
    const { doc, projector } = setup()
    doc.transact('запрет', () => setMovementAllowed(doc, projector, 2, 1, 4, false))
    const restriction = [...doc.relations.values()].find((r) => r.tags?.type === 'restriction')!
    expect(restriction.tags?.restriction).toBe('no_right_turn')
    const [from, via, to] = restriction.members
    expect(via).toEqual(['node', 2, 'via'])
    expect(doc.way(from![1]).nds).toEqual([1, 2])
    expect(to![1]).toBe(20)

    const movements = junctionMovements(doc, buildNetwork(doc, projector), 2)
    const west = movements.find((m) => m.from.neighbor === 1 && m.to.neighbor === 4)!
    expect(west.allowed).toBe(false)
    const through = movements.find((m) => m.from.neighbor === 1 && m.to.neighbor === 3)!
    expect(through.allowed).toBe(true)
  })

  it('снимает запрет обратно', () => {
    const { doc, projector } = setup()
    doc.transact('запрет', () => setMovementAllowed(doc, projector, 2, 1, 4, false))
    doc.transact('снятие', () => setMovementAllowed(doc, projector, 2, 1, 4, true))
    expect([...doc.relations.values()].some((r) => r.tags?.type === 'restriction')).toBe(false)
  })

  it('раскладывает only_* на отдельные запреты, когда меняют манёвр', () => {
    const raw = crossroads()
    raw.ways = [
      { id: 10, nds: [1, 2], tags: { highway: 'secondary' } },
      { id: 11, nds: [2, 3], tags: { highway: 'secondary' } },
      { id: 20, nds: [4, 2], tags: { highway: 'residential' } },
    ]
    raw.relations = [
      {
        id: 60,
        members: [['way', 10, 'from'], ['node', 2, 'via'], ['way', 11, 'to']],
        tags: { type: 'restriction', restriction: 'only_straight_on' },
      },
    ]
    const { doc, projector } = setup(raw)
    let movements = junctionMovements(doc, buildNetwork(doc, projector), 2)
    expect(movements.find((m) => m.from.neighbor === 1 && m.to.neighbor === 4)!.allowed).toBe(false)

    doc.transact('разрешение', () => setMovementAllowed(doc, projector, 2, 1, 4, true))
    movements = junctionMovements(doc, buildNetwork(doc, projector), 2)
    expect(movements.find((m) => m.from.neighbor === 1 && m.to.neighbor === 4)!.allowed).toBe(true)
    expect(movements.find((m) => m.from.neighbor === 1 && m.to.neighbor === 3)!.allowed).toBe(true)
    expect(doc.relations.has(60)).toBe(false)
  })
})

describe('проверка сети', () => {
  const codes = (raw: RawDocument) => {
    const { doc, projector } = setup(raw)
    return validate(doc, projector).map((issue) => issue.code)
  }

  it('не находит ошибок в простом перекрёстке', () => {
    expect(codes(crossroads()).filter((code) => code !== 'no_lanes')).toEqual([])
  })

  it('находит расхождение полос и манёвров', () => {
    const raw = crossroads()
    raw.ways[0]!.tags = { highway: 'primary', oneway: 'yes', lanes: '4', 'turn:lanes:forward': 'left|through|through' }
    expect(codes(raw)).toContain('lanes_turn_mismatch')
  })

  it('находит изолированную дорогу', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 7, lat: 52.1, lon: 104.1 }, { id: 8, lat: 52.1, lon: 104.101 })
    raw.ways.push({ id: 30, nds: [7, 8], tags: { highway: 'service' } })
    expect(codes(raw)).toContain('isolated')
  })

  it('находит и чинит пересечение без узла', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 7, lat: 52 + STEP, lon: 104 + STEP / 2 }, { id: 8, lat: 52 - STEP, lon: 104 + STEP / 2 })
    raw.ways.push({ id: 30, nds: [7, 8], tags: { highway: 'residential' } })
    const { doc, projector } = setup(raw)
    const issue = validate(doc, projector).find((item) => item.code === 'crossing_without_node')!
    expect(issue).toBeDefined()
    doc.transact('исправление', () => issue.fix!())
    expect(validate(doc, projector).some((item) => item.code === 'crossing_without_node')).toBe(false)
    const shared = doc.way(30).nds.filter((nd) => doc.way(10).nds.includes(nd))
    expect(shared).toHaveLength(1)
  })

  it('не считает пересечением мост над дорогой', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 7, lat: 52 + STEP, lon: 104 + STEP / 2 }, { id: 8, lat: 52 - STEP, lon: 104 + STEP / 2 })
    raw.ways.push({ id: 30, nds: [7, 8], tags: { highway: 'residential', bridge: 'yes', layer: '1' } })
    expect(codes(raw)).not.toContain('crossing_without_node')
  })

  it('находит и чинит разорванный перекрёсток', () => {
    const raw = crossroads()
    raw.nodes[3] = { id: 4, lat: 52 - STEP, lon: 104 + STEP / 2 }
    raw.nodes.push({ id: 7, lat: 52 - 0.00002, lon: 104 + STEP / 2 })
    raw.ways[1] = { id: 20, nds: [4, 7], tags: { highway: 'residential' } }
    const { doc, projector } = setup(raw)
    const issue = validate(doc, projector).find((item) => item.code === 'broken_junction')!
    expect(issue).toBeDefined()
    doc.transact('исправление', () => issue.fix!())
    const after = validate(doc, projector).map((item) => item.code)
    expect(after).not.toContain('broken_junction')
    expect(after).not.toContain('isolated')
  })

  it('находит встречные односторонние дороги', () => {
    const raw = crossroads()
    raw.ways = [
      { id: 10, nds: [1, 2], tags: { highway: 'primary', oneway: 'yes' } },
      { id: 20, nds: [3, 2], tags: { highway: 'primary', oneway: 'yes' } },
    ]
    raw.relations = []
    expect(codes(raw)).toContain('head_on')
  })

  it('находит мост, склеенный с дорогой под ним', () => {
    const raw = crossroads()
    raw.nodes.push({ id: 7, lat: 52 + STEP, lon: 104 })
    raw.ways[1] = { id: 20, nds: [4, 2, 7], tags: { highway: 'primary', bridge: 'yes', layer: '1' } }
    expect(codes(raw)).toContain('glued_levels')
  })
})

describe('настоящий файл example.osm', () => {
  const raw = parseSample()

  it('строит сцену без ошибок и нечисловых координат', () => {
    const { doc, projector } = setup(raw)
    const { scene, network } = buildScene(doc, projector)
    expect(network.links.length).toBeGreaterThan(300)
    expect(scene.surface.features.length).toBeGreaterThan(300)
    expect(scene.turnPaths.features.length).toBeGreaterThan(100)
    // 2 светофора highway=traffic_signals и 3 регулируемых перехода crossing=traffic_signals
    expect(scene.signals.features.length).toBe([...doc.nodes.values()].filter((node) => isSignalNode(node.tags)).length)
    expect(scene.signals.features.length).toBe(5)
    for (const layer of Object.values(scene)) {
      const text = JSON.stringify(layer)
      expect(text).not.toContain('null,null')
      expect(text).not.toContain('NaN')
    }
    expect(buildStaticScene(doc).buildings.features.length).toBeGreaterThan(300)
  })

  it('находит настоящую ошибку с полосами на объездной дороге', () => {
    const { doc, projector } = setup(raw)
    const issues = validate(doc, projector)
    expect(issues.some((issue) => issue.id.startsWith('turn-1199781522'))).toBe(true)
  })

  it('работает достаточно быстро для правки в реальном времени', () => {
    const { doc, projector } = setup(raw)
    const start = performance.now()
    buildScene(doc, projector)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
