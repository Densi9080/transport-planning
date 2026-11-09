import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef, watch } from 'vue'

import { type EdgeLoad, type MacroResult, type Period, runMacro } from '@/sim/macro'
import { type MicroSim, MicroSim as Micro, type MicroStats, SIM_STEP_S } from '@/sim/micro'
import { buildSimNet, type SimEdge, type SimNet } from '@/sim/net'

import { useEditor } from './editor'

export type SimLevel = 'macro' | 'micro'

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
  const colorBySpeed = ref(false)
  const showLoad = ref(true)
  const computing = ref(false)

  const net = shallowRef<SimNet | null>(null)
  const macro = shallowRef<MacroResult | null>(null)
  const micro = shallowRef<MicroSim | null>(null)
  const stats = shallowRef<MicroStats | null>(null)
  /** Счётчик обновления загрузки: по нему карта перекрашивает дороги. */
  const loadRev = ref(0)
  const alpha = ref(1)

  let builtFor = -1
  let accumulator = 0
  let statsTimer = 0

  function rebuildNet(): void {
    if (!editor.doc || !editor.projector) return
    net.value = markRaw(buildSimNet(editor.doc, editor.projector, guessSignals.value))
    builtFor = editor.rev
    micro.value = null
    stats.value = null
    running.value = false
  }

  function recomputeMacro(): void {
    if (!editor.doc || !net.value) return
    macro.value = markRaw(runMacro(editor.doc, net.value, { period: period.value, demand: demand.value }))
    // Запущенная модель продолжает ехать, но с новым спросом и новыми маршрутами
    micro.value?.setFlows(macro.value.flows, 1)
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

  function ensureMicro(): void {
    if (!net.value || !macro.value) return
    if (!micro.value) {
      micro.value = markRaw(new Micro(net.value, macro.value.flows, 1))
      accumulator = 0
      stats.value = micro.value.stats()
    }
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
    if (!net.value || !macro.value) return
    micro.value = markRaw(new Micro(net.value, macro.value.flows, 1))
    accumulator = 0
    stats.value = micro.value.stats()
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
    if (steps > 0) sim.updatePoses(SIM_STEP_S * steps)
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

  watch([period, demand], () => {
    if (editor.viewMode === 'sim') recomputeMacro()
  })

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
    colorBySpeed,
    showLoad,
    computing,
    net,
    macro,
    micro,
    stats,
    loadRev,
    alpha,
    enter,
    leave,
    setLevel,
    togglePlay,
    reset,
    frame,
    loadsOfWay,
    edgesOfWay,
  }
})
