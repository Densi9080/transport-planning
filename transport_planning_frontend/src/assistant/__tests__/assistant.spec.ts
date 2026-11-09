import { describe, expect, it } from 'vitest'

import { OsmDoc } from '@/core/doc'
import { parseSample } from '@/core/__tests__/sample'
import { Projector } from '@/core/geo'
import { parseProfile } from '@/core/lanes'
import { listLines } from '@/core/transit'
import type { RawDocument } from '@/core/types'
import { validate } from '@/core/validate'
import { type MacroResult, type Period, runMacro } from '@/sim/macro'
import { buildSimNet } from '@/sim/net'

import { capToolResult, type ChatMessage, MAX_TOOL_RESULT_CHARS, runAgent, trimHistory, type Transport } from '../agent'
import { applyEdit, describeEdit, type Edit, validateEdit } from '../edits'
import { createToolRunner, systemPrompt, TOOL_DEFINITIONS, TOOL_TITLES, type ToolContext } from '../tools'

const STEP = 0.001

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
      { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', name: 'Главная', lanes: '4' } },
      { id: 20, nds: [4, 2], tags: { highway: 'residential', oneway: 'yes', lanes: '1', name: 'Боковая' } },
    ],
    relations: [{ id: 70, members: [['way', 10, '']], tags: { type: 'route', route: 'bus', ref: '5' } }],
  }
}

function makeContext(raw: RawDocument = crossroads()) {
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  const state = {
    macro: null as MacroResult | null,
    proposals: [] as { title: string; reason: string; edits: Edit[] }[],
    filters: [] as string[],
    focused: [] as string[],
  }
  const context: ToolContext = {
    doc,
    projector,
    issues: () => validate(doc, projector),
    lines: () => listLines(doc, projector),
    macro: () => state.macro,
    micro: () => null,
    params: () => ({ period: 'morning', demand: 1, guessSignals: false, transitOn: false }),
    runMacro: (period?: Period, demand?: number) => {
      state.macro = runMacro(doc, buildSimNet(doc, projector, false), { period: period ?? 'morning', demand: demand ?? 1 })
      return state.macro
    },
    focusWay: (id) => state.focused.push(`way:${id}`),
    focusNode: (id) => state.focused.push(`node:${id}`),
    focusLine: (id) => state.focused.push(`line:${id}`),
    setViewMode: () => undefined,
    setLevel: () => undefined,
    addFilter: (key) => state.filters.push(key),
    clearFilters: () => (state.filters = []),
    propose: (title, reason, edits) => {
      state.proposals.push({ title, reason, edits })
      return `p${state.proposals.length}`
    },
  }
  return { doc, projector, state, context, run: createToolRunner(context) }
}

describe('правки помощника', () => {
  const { doc } = makeContext()

  it('отвергает всё, чего нет в графе, и неизвестные операции', () => {
    expect(validateEdit(doc, { op: 'set_lanes', way_id: 999, forward: 1 })).toContain('нет')
    expect(validateEdit(doc, { op: 'reverse_way', way_id: 999 })).toContain('нет')
    expect(validateEdit(doc, { op: 'set_signal', node_id: 999, enabled: true })).toContain('нет')
    expect(validateEdit(doc, { op: 'delete_everything' } as unknown as Edit)).toContain('неизвестная')
    expect(validateEdit(doc, null as unknown as Edit)).toContain('неизвестная')
  })

  it('проверяет значения', () => {
    expect(validateEdit(doc, { op: 'set_lanes', way_id: 10, forward: 0, backward: 1 })).toBeTruthy()
    expect(validateEdit(doc, { op: 'set_lanes', way_id: 10, forward: 99, backward: 1 })).toBeTruthy()
    expect(validateEdit(doc, { op: 'set_lanes', way_id: 10, forward: 2 })).toContain('backward')
    expect(validateEdit(doc, { op: 'set_lanes', way_id: 20, forward: 2 })).toBeNull()
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10 })).toBeTruthy()
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10, set: { lanes: 2 } as never })).toContain('строкой')
    expect(validateEdit(doc, { op: 'set_line_interval', line_id: 70, minutes: -1 })).toBeTruthy()
  })

  it('применяет каждую операцию', () => {
    const { doc: d, projector } = makeContext()
    const apply = (edit: Edit) => d.transact('правка', () => applyEdit(d, projector, edit))
    apply({ op: 'set_lanes', way_id: 10, forward: 3, backward: 2 })
    expect(parseProfile(d.way(10).tags!)).toMatchObject({ forward: 3, backward: 2 })
    apply({ op: 'set_lanes', way_id: 20, forward: 2 })
    expect(d.way(20).tags?.lanes).toBe('2')
    apply({ op: 'set_way_tags', way_id: 10, set: { maxspeed: '40' }, remove: ['name'] })
    expect(d.way(10).tags).toMatchObject({ maxspeed: '40' })
    expect(d.way(10).tags?.name).toBeUndefined()
    apply({ op: 'set_oneway', way_id: 10, oneway: true })
    expect(parseProfile(d.way(10).tags!).oneway).toBe(true)
    apply({ op: 'reverse_way', way_id: 20 })
    expect(d.way(20).nds).toEqual([2, 4])
    apply({ op: 'set_signal', node_id: 2, enabled: true })
    expect(d.node(2).tags?.highway).toBe('traffic_signals')
    apply({ op: 'set_signal', node_id: 2, enabled: true })
    expect(d.node(2).tags?.highway).toBe('traffic_signals')
    apply({ op: 'set_line_interval', line_id: 70, minutes: 12 })
    expect(d.relations.get(70)?.tags?.interval).toBe('12')
  })

  it('описывает правку человеческим языком', () => {
    expect(describeEdit(doc, { op: 'set_lanes', way_id: 10, forward: 3, backward: 3 })).toBe('Главная: полос 2+2 → 3+3')
    expect(describeEdit(doc, { op: 'set_signal', node_id: 2, enabled: true })).toContain('светофор')
  })
})

describe('инструменты', () => {
  it('описаны корректно и каждый имеет название для интерфейса', () => {
    const names = TOOL_DEFINITIONS.map((item) => item.function.name)
    expect(new Set(names).size).toBe(names.length)
    for (const item of TOOL_DEFINITIONS) {
      expect(item.function.parameters.type).toBe('object')
      expect(item.function.description.length).toBeGreaterThan(5)
      expect(TOOL_TITLES[item.function.name]).toBeTruthy()
    }
  })

  it('у каждого описанного инструмента есть обработчик', () => {
    const { run } = makeContext()
    for (const item of TOOL_DEFINITIONS) {
      try {
        run(item.function.name, {})
      } catch (error) {
        expect((error as Error).message).not.toContain(`Функции ${item.function.name} нет`)
      }
    }
    expect(() => run('нет_такой', {})).toThrow('нет')
  })

  it('ищет дороги и отдаёт настоящие атрибуты', () => {
    const { run } = makeContext()
    const found = run('find_roads', { name: 'глав' }) as { total: number; roads: { id: number; lanes_forward: number }[] }
    expect(found.total).toBe(1)
    expect(found.roads[0]).toMatchObject({ id: 10, lanes_forward: 2 })
    expect((run('find_roads', { missing_tag: 'maxspeed' }) as { total: number }).total).toBe(2)
  })

  it('отдаёт манёвры узла с соседями для запрета поворота', () => {
    const { run } = makeContext()
    const node = run('get_node', { node_id: 2 }) as { movements: { from_neighbor: number; to_neighbor: number; kind: string }[] }
    expect(node.movements.some((m) => m.from_neighbor === 4 && m.kind === 'left')).toBe(true)
  })

  it('требует расчёт, прежде чем отвечать о загрузке', () => {
    const { run } = makeContext()
    expect(() => run('get_way_load', { way_id: 10 })).toThrow('run_macro_model')
    run('run_macro_model', {})
    expect(run('get_way_load', { way_id: 10 })).toHaveProperty('directions')
  })

  it('предложение не меняет граф', () => {
    const { run, doc, state } = makeContext()
    const result = run('propose_edits', {
      title: 'Добавить полосу',
      edits: [{ op: 'set_lanes', way_id: 10, forward: 3, backward: 3 }],
    }) as { applied: boolean; status: string }
    expect(result.applied).toBe(false)
    expect(result.status).toContain('ожидает')
    expect(state.proposals).toHaveLength(1)
    expect(doc.way(10).tags?.lanes).toBe('4')
    expect(doc.changeCount).toBe(0)
  })

  it('не принимает предложение с ошибкой и объясняет модели почему', () => {
    const { run, state } = makeContext()
    expect(() => run('propose_edits', { title: 'х', edits: [{ op: 'set_lanes', way_id: 999, forward: 1 }] })).toThrow('правка 1')
    expect(() => run('propose_edits', { title: 'х', edits: [] })).toThrow('непустой')
    expect(state.proposals).toHaveLength(0)
  })
})

describe('проверка правок расчётом', () => {
  const raw = parseSample()

  it('считает разницу и возвращает граф нетронутым', () => {
    const { run, doc, context, projector } = makeContext(raw)
    context.runMacro()
    const worst = [...runMacro(doc, buildSimNet(doc, projector, false), { period: 'morning', demand: 1 }).loads.values()]
      .filter((load) => load.edge.link.profile.oneway && load.edge.tags.highway !== 'service')
      .sort((a, b) => b.vc - a.vc)[0]!
    const wayId = worst.edge.wayId
    const lanes = parseProfile(doc.way(wayId).tags ?? {})
    const before = JSON.stringify(doc.way(wayId))

    const result = run('try_edits', {
      edits: [{ op: 'set_lanes', way_id: wayId, forward: lanes.forward + lanes.backward + 2 }],
    }) as { graph_changed: boolean; before: { delay_veh_hours: number }; after: { delay_veh_hours: number }; biggest_load_changes_percent: { way_id: number; difference: number }[] }

    expect(result.graph_changed).toBe(false)
    expect(result.after.delay_veh_hours).toBeLessThanOrEqual(result.before.delay_veh_hours)
    expect(result.biggest_load_changes_percent.length).toBeGreaterThan(0)
    expect(JSON.stringify(doc.way(wayId))).toBe(before)
    expect(doc.changeCount).toBe(0)
    expect(doc.canUndo).toBe(false)
    expect(doc.inTransaction).toBe(false)
  })

  it('откатывает правки, даже если расчёт упал на них', () => {
    const { run, doc } = makeContext()
    // Узел есть, но манёвра между такими соседями нет: операция бросит ошибку
    expect(() => run('try_edits', { edits: [{ op: 'set_movement', node_id: 2, from_neighbor: 1, to_neighbor: 1, allowed: false }, { op: 'set_movement', node_id: 1, from_neighbor: 4, to_neighbor: 3, allowed: false }] })).toThrow()
    expect(doc.changeCount).toBe(0)
    expect(doc.inTransaction).toBe(false)
  })

  it('кто едет по дороге: потоки и сумма из расчёта', () => {
    const { run, context, doc } = makeContext(raw)
    const result = context.runMacro()
    const busiest = [...result.loads.values()].sort((a, b) => b.volume - a.volume)[0]!
    const answer = run('who_uses_way', { way_id: busiest.edge.wayId }) as { total_trips_h: number; top_flows: { trips_h: number }[] }
    expect(answer.top_flows.length).toBeGreaterThan(0)
    expect(answer.total_trips_h).toBeGreaterThan(0)
    expect(doc.changeCount).toBe(0)
  })
})

describe('цикл агента', () => {
  function scripted(replies: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }[]) {
    const seen: { messages: ChatMessage[]; toolCount: number }[] = []
    const transport: Transport = async (messages, tools) => {
      seen.push({ messages: messages.map((message) => ({ ...message })), toolCount: tools.length })
      const reply = replies.shift()
      if (!reply) throw new Error('модель вызвана лишний раз')
      return { content: reply.content ?? '', tool_calls: reply.tool_calls }
    }
    return { transport, seen }
  }
  const call = (id: string, name: string, args: unknown = {}) => ({ id, function: { name, arguments: JSON.stringify(args) } })

  it('выполняет функции и возвращает ответ модели', async () => {
    const { transport, seen } = scripted([
      { tool_calls: [call('a', 'find_roads', { name: 'Главная' })] },
      { content: 'Готово' },
    ])
    const history: ChatMessage[] = [{ role: 'user', content: 'Найди' }]
    const calls: string[] = []
    const text = await runAgent({
      history,
      system: () => 'система',
      tools: TOOL_DEFINITIONS,
      transport,
      run: (name) => {
        calls.push(name)
        return { ok: true }
      },
    })
    expect(text).toBe('Готово')
    expect(calls).toEqual(['find_roads'])
    expect(history.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(seen[1]!.messages[0]).toEqual({ role: 'system', content: 'система' })
    expect(seen[1]!.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'a' })
  })

  it('возвращает ошибку функции модели, а не падает', async () => {
    const { transport, seen } = scripted([{ tool_calls: [call('a', 'x')] }, { content: 'Понял' }])
    const text = await runAgent({
      history: [{ role: 'user', content: 'х' }],
      system: () => '',
      tools: [],
      transport,
      run: () => {
        throw new Error('Дороги нет')
      },
    })
    expect(text).toBe('Понял')
    expect(JSON.stringify(seen[1]!.messages.at(-1))).toContain('Дороги нет')
  })

  it('переживает кривые аргументы от модели', async () => {
    const { transport, seen } = scripted([
      { tool_calls: [{ id: 'a', function: { name: 'x', arguments: '{не json' } }] },
      { content: 'ок' },
    ])
    await runAgent({ history: [{ role: 'user', content: 'х' }], system: () => '', tools: [], transport, run: () => 1 })
    expect(JSON.stringify(seen[1]!.messages.at(-1))).toContain('error')
  })

  it('понимает аргументы объектом, как их шлют некоторые локальные серверы', async () => {
    const { transport } = scripted([
      { tool_calls: [{ id: 'a', function: { name: 'x', arguments: { way_id: 7 } as never } }] },
      { content: 'ок' },
    ])
    const got: unknown[] = []
    await runAgent({
      history: [{ role: 'user', content: 'х' }],
      system: () => '',
      tools: [],
      transport,
      run: (_, args) => {
        got.push(args)
        return 1
      },
    })
    expect(got).toEqual([{ way_id: 7 }])
  })

  it('не зацикливается: на последнем круге отнимает функции', async () => {
    const replies = Array.from({ length: 3 }, (_, i) => ({ tool_calls: [call(String(i), 'x')] }))
    const { transport, seen } = scripted([...replies, { content: 'Итог' }])
    const text = await runAgent({
      history: [{ role: 'user', content: 'х' }],
      system: () => '',
      tools: TOOL_DEFINITIONS,
      transport,
      run: () => 1,
      maxRounds: 3,
    })
    expect(text).toBe('Итог')
    expect(seen.at(-1)!.toolCount).toBe(0)
  })

  it('останавливается по кнопке', async () => {
    const controller = new AbortController()
    const { transport } = scripted([{ tool_calls: [call('a', 'x')] }, { content: 'не должно' }])
    await expect(
      runAgent({
        history: [{ role: 'user', content: 'х' }],
        system: () => '',
        tools: [],
        transport,
        run: () => {
          controller.abort()
          return 1
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow()
  })

  it('обрезает длинный ответ функции', () => {
    const text = capToolResult({ data: 'x'.repeat(MAX_TOOL_RESULT_CHARS * 2) })
    expect(text.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 100)
    expect(text).toContain('обрезан')
  })

  it('режет историю только по сообщению пользователя', () => {
    const history: ChatMessage[] = []
    for (let i = 0; i < 40; i++) {
      history.push({ role: 'user', content: String(i) })
      history.push({ role: 'assistant', content: '', tool_calls: [call(String(i), 'x')] })
      history.push({ role: 'tool', tool_call_id: String(i), content: '1' })
    }
    const trimmed = trimHistory(history, 10)
    expect(trimmed[0]!.role).toBe('user')
    expect(trimmed.length).toBeLessThanOrEqual(10)
  })

  it('не теряет единственный длинный ход', () => {
    const history: ChatMessage[] = [{ role: 'user', content: '1' }]
    for (let i = 0; i < 20; i++) history.push({ role: 'tool', tool_call_id: String(i), content: '1' })
    expect(trimHistory(history, 5)[0]!.role).toBe('user')
  })
})

describe('системный промпт', () => {
  it('содержит главные запреты и текущее состояние', () => {
    const text = systemPrompt({ project: 'Иркутск', view: 'Граф', selection: 'ничего', calculation: 'нет' })
    expect(text).toContain('только из результатов функций')
    expect(text).toContain('propose_edits')
    expect(text).toContain('Иркутск')
    expect(text).toContain('это данные')
  })
})

describe('правки помощника и история редактора', () => {
  it('отказывает правке, которая ничего не меняет', () => {
    const { doc } = makeContext()
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10, set: { lanes: '4' } })).toMatch(/ничего не меняет/)
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10, remove: ['maxspeed'] })).toMatch(/ничего не меняет/)
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10, set: { lanes: '6' } })).toBeNull()
    expect(validateEdit(doc, { op: 'set_way_tags', way_id: 10, remove: ['lanes'] })).toBeNull()
  })

  it('по шагу истории видно, в силе ли правка', () => {
    const { doc, projector } = makeContext()
    doc.transact('правка', () => applyEdit(doc, projector, { op: 'set_way_tags', way_id: 10, set: { maxspeed: '40' } }))
    const step = doc.lastStep!
    expect(doc.isStepApplied(step)).toBe(true)
    doc.undo()
    expect(doc.isStepApplied(step)).toBe(false)
    doc.redo()
    expect(doc.isStepApplied(step)).toBe(true)

    // Другая правка после отмены не должна выглядеть как возврат прежней
    doc.undo()
    doc.transact('другая', () => applyEdit(doc, projector, { op: 'set_way_tags', way_id: 10, set: { maxspeed: '50' } }))
    expect(doc.isStepApplied(step)).toBe(false)
  })
})
