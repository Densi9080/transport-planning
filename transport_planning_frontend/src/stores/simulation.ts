import { defineStore } from 'pinia'
import { markRaw, reactive, ref, shallowRef, watch } from 'vue'

import { type EdgeLoad, type MacroResult, type Period, runMacro } from '@/sim/macro'
import { DEFAULT_MIX, MicroSim, type MicroStats, SIM_STEP_S } from '@/sim/micro'
import { buildSimNet, refreshSignalPlans, type SimEdge, type SimNet } from '@/sim/net'
import { buildServices, type TransitService } from '@/sim/transit'

import { useEditor } from './editor'

export type SimLevel = 'macro' | 'micro'
export type CarColorMode = 'fleet' | 'speed' | 'style'
export type MacroView = 'fill' | 'bars'

export interface ProcedureStep {
  id: string
  title: string
  detail: string
  ms: number | null
}

const STATS_PERIOD_S = 0.5
const MAX_STEPS_PER_FRAME = 40
const MAX_FRAME_S = 0.1

export const useSimulation = defineStore('simulation', () => {
  const editor = useEditor()

  const level = ref<SimLevel>('macro')
  const period = ref<Period>('morning')
  const demand = ref(1)
  const running = ref(false)
  const speed = ref(1)
  const guessSignals = ref(true)
  const camera3d = ref(false)
  const colorMode = ref<CarColorMode>('fleet')
  const showLoad = ref(true)
  const macroView = ref<MacroView>('bars')
  const showDesire = ref(false)
  const transitOn = ref(true)
  const mix = reactive({ ...DEFAULT_MIX })

  const net = shallowRef<SimNet | null>(null)
  const services = shallowRef<TransitService[]>([])
  const macro = shallowRef<MacroResult | null>(null)
  const micro = shallowRef<MicroSim | null>(null)
  const stats = shallowRef<MicroStats | null>(null)
  const procedure = shallowRef<ProcedureStep[]>([])
  /** Счётчик обновления загрузки: по нему карта перекрашивает дороги. */
  const loadRev = ref(0)
  const alpha = ref(1)

  let builtFor = -1
  let accumulator = 0
  let statsTimer = 0
  let netMs = 0

  function rebuildNet(): void {
    if (!editor.doc || !editor.projector) return
    const start = performance.now()
    net.value = markRaw(buildSimNet(editor.doc, editor.projector, guessSignals.value))
    netMs = performance.now() - start
    builtFor = editor.rev
    micro.value = null
    stats.value = null
    running.value = false
  }

  function recomputeMacro(): void {
    if (!editor.doc || !net.value) return
    const started = performance.now()
    services.value = transitOn.value ? markRaw(buildServices(editor.doc, net.value, editor.lines)) : []
    const servicesMs = performance.now() - started
    const macroStart = performance.now()
    macro.value = markRaw(
      runMacro(editor.doc, net.value, { period: period.value, demand: demand.value }, services.value),
    )
    const macroMs = performance.now() - macroStart

    const result = macro.value
    const gateways = result.zones.filter((zone) => zone.kind === 'gateway').length
    procedure.value = [
      {
        id: 'net',
        title: 'Сеть модели',
        detail: `${net.value.edges.length} направлений, ${net.value.connectors.length} соединений полос, ${net.value.signals.length} светофорных объектов`,
        ms: netMs,
      },
      {
        id: 'transit',
        title: 'Линии ОТ',
        detail: `${services.value.length} линий на дорогах участка`,
        ms: servicesMs,
      },
      {
        id: 'demand',
        title: 'Спрос',
        detail: `${gateways} въездов, ${result.zones.length - gateways} районов, ${Math.round(result.totals.trips)} поездок в час`,
        ms: null,
      },
      {
        id: 'assignment',
        title: 'Распределение потоков',
        detail: `Средняя скорость ${Math.round(result.totals.avgSpeedKmh)} км/ч, ${result.flows.length} пар корреспонденций`,
        ms: macroMs,
      },
    ]

    // Запущенная модель продолжает ехать, но с новым спросом и новыми маршрутами
    if (micro.value) {
      micro.value.setFlows(result.flows, 1)
      micro.value.setServices(services.value)
    }
    loadRev.value++
  }

  /** Вход в режим симуляции. Граф мог измениться, поэтому сеть пересчитывается при каждой новой правке. */
  function enter(): void {
    if (builtFor !== editor.rev || !net.value) {
      rebuildNet()
      recomputeMacro()
    }
    if (level.value === 'micro') ensureMicro()
  }

  function leave(): void {
    running.value = false
  }

  /** Граф поменяли после расчёта: его результаты уже не про текущую сеть. */
  function isStale(): boolean {
    return builtFor !== editor.rev || !net.value
  }

  /**
   * Правку плана светофора видно сразу: сеть остаётся прежней, и машины продолжают ехать.
   * Вызывается сразу после правки, поэтому сеть отстаёт от графа ровно на один шаг.
   */
  function refreshSignals(): void {
    if (editor.viewMode !== 'sim' || !editor.doc || !net.value || builtFor !== editor.rev - 1) return
    refreshSignalPlans(editor.doc, net.value)
    builtFor = editor.rev
    recomputeMacro()
  }

  function createMicro(): MicroSim | null {
    if (!net.value || !macro.value) return null
    return markRaw(new MicroSim(net.value, macro.value.flows, { scale: 1, mix: { ...mix }, services: services.value }))
  }

  function ensureMicro(): void {
    if (micro.value) return
    micro.value = createMicro()
    accumulator = 0
    stats.value = micro.value?.stats() ?? null
  }

  function setLevel(next: SimLevel): void {
    level.value = next
    if (next === 'micro') {
      ensureMicro()
      running.value = true
      camera3d.value = true
    } else {
      running.value = false
      camera3d.value = false
    }
    loadRev.value++
  }

  function togglePlay(): void {
    if (level.value !== 'micro') return
    ensureMicro()
    running.value = !running.value
  }

  function reset(): void {
    micro.value = createMicro()
    accumulator = 0
    stats.value = micro.value?.stats() ?? null
    loadRev.value++
  }

  /** Один кадр: шаги симуляции накапливаются, а между ними машины плавно интерполируются. */
  function frame(seconds: number): void {
    const sim = micro.value
    if (!sim || !running.value) return
    accumulator += Math.min(seconds, MAX_FRAME_S) * speed.value
    let steps = 0
    while (accumulator >= SIM_STEP_S && steps < MAX_STEPS_PER_FRAME) {
      sim.step(SIM_STEP_S)
      accumulator -= SIM_STEP_S
      steps++
    }
    if (accumulator >= SIM_STEP_S) accumulator = 0
    if (steps > 0) sim.updatePoses()
    alpha.value = Math.min(1, accumulator / SIM_STEP_S)
    statsTimer += seconds
    if (statsTimer >= STATS_PERIOD_S) {
      statsTimer = 0
      stats.value = sim.stats()
      loadRev.value++
    }
  }

  function loadsOfWay(wayId: number): EdgeLoad[] {
    const result = macro.value
    if (!result) return []
    return [...result.loads.values()].filter((load) => load.edge.wayId === wayId)
  }

  function edgesOfWay(wayId: number): SimEdge[] {
    return net.value?.edges.filter((edge) => edge.wayId === wayId) ?? []
  }

  watch([period, demand, transitOn], () => {
    if (editor.viewMode === 'sim') recomputeMacro()
  })

  watch(mix, () => {
    // Новые водители появятся с новой долей, а те, кто уже едет, доедут в своём стиле
    if (micro.value) micro.value.mix = { ...mix }
  })

  // Граф поменяли прямо в симуляции: помощником или отменой правки. Считаем уже новую сеть
  watch(
    () => editor.rev,
    () => {
      if (editor.viewMode !== 'sim' || !isStale()) return
      const wasRunning = running.value
      enter()
      running.value = wasRunning && level.value === 'micro'
    },
  )

  watch(guessSignals, () => {
    if (editor.viewMode !== 'sim') return
    const wasRunning = running.value
    rebuildNet()
    recomputeMacro()
    if (level.value === 'micro') {
      ensureMicro()
      running.value = wasRunning
    }
  })

  return {
    level,
    period,
    demand,
    running,
    speed,
    guessSignals,
    camera3d,
    colorMode,
    showLoad,
    macroView,
    showDesire,
    transitOn,
    mix,
    net,
    services,
    macro,
    micro,
    stats,
    procedure,
    loadRev,
    alpha,
    enter,
    leave,
    isStale,
    refreshSignals,
    setLevel,
    togglePlay,
    reset,
    frame,
    recomputeMacro,
    loadsOfWay,
    edgesOfWay,
  }
})
