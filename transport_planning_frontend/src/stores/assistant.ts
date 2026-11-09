import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import {
  assistantChat,
  type AssistantSettings,
  getAssistantSettings,
  saveAssistantSettings,
  testAssistant,
} from '@/api'
import { type ChatMessage, runAgent, type Transport } from '@/assistant/agent'
import { applyEdit, describeEdit, type Edit, editTargets, validateEdit } from '@/assistant/edits'
import { createToolRunner, systemPrompt, TOOL_DEFINITIONS, TOOL_TITLES, type ToolContext } from '@/assistant/tools'

import { useEditor } from './editor'
import { useSimulation } from './simulation'

export type ProposalStatus = 'pending' | 'applied' | 'undone' | 'rejected' | 'failed'

export interface Proposal {
  id: string
  title: string
  reason: string
  edits: Edit[]
  lines: string[]
  status: ProposalStatus
  error?: string
}

export type TimelineItem =
  | { id: number; kind: 'user' | 'assistant' | 'error' | 'note'; text: string }
  | { id: number; kind: 'step'; tool: string; title: string; done: boolean; failed: boolean; detail?: string }
  | { id: number; kind: 'proposal'; proposalId: string }

const VIEW_NAMES: Record<string, string> = {
  engineering: 'инженерный',
  graph: 'граф сети',
  '3d': '3D',
  sim: 'симуляция',
}

export const useAssistant = defineStore('assistant', () => {
  const editor = useEditor()
  const sim = useSimulation()

  const settings = shallowRef<AssistantSettings | null>(null)
  const settingsOpen = ref(false)
  const timeline = ref<TimelineItem[]>([])
  const proposals = ref<Proposal[]>([])
  const busy = ref(false)
  const tokens = ref(0)

  let history: ChatMessage[] = []
  /** События редактора, о которых модель узнает со следующим сообщением. */
  let pendingNotes: string[] = []
  let controller: AbortController | null = null
  let nextItem = 1
  let nextProposal = 1
  /** Шаг истории правок для каждого применённого предложения. */
  const appliedSteps = new Map<string, object>()
  /** Меняется при новом разговоре: ответ на прежний разговор в новый уже не попадёт. */
  let conversation = 0

  function pushItem(item: Record<string, unknown>): void {
    timeline.value.push({ id: nextItem++, ...item } as TimelineItem)
  }

  function reset(): void {
    conversation++
    controller?.abort()
    controller = null
    busy.value = false
    history = []
    pendingNotes = []
    appliedSteps.clear()
    timeline.value = []
    proposals.value = []
    tokens.value = 0
    editor.proposalTargets = null
  }

  watch(() => editor.projectId, reset)

  // Правку могли отменить или вернуть через Ctrl+Z: карточка и модель должны это знать
  watch(
    () => editor.rev,
    () => {
      const doc = editor.doc
      if (!doc) return
      for (const proposal of proposals.value) {
        const step = appliedSteps.get(proposal.id)
        if (!step) continue
        const applied = doc.isStepApplied(step)
        if (proposal.status === 'applied' && !applied) {
          proposal.status = 'undone'
          pendingNotes.push(`Пользователь отменил применённое предложение «${proposal.title}». Этих правок в графе больше нет.`)
        } else if (proposal.status === 'undone' && applied) {
          proposal.status = 'applied'
          pendingNotes.push(`Пользователь вернул отменённое предложение «${proposal.title}». Правки снова в графе.`)
        }
      }
    },
  )

  async function loadSettings(): Promise<void> {
    try {
      settings.value = await getAssistantSettings()
    } catch {
      settings.value = null
    }
  }

  async function saveSettings(payload: Parameters<typeof saveAssistantSettings>[0]): Promise<void> {
    settings.value = await saveAssistantSettings(payload)
  }

  function refreshTargets(): void {
    const pending = proposals.value.filter((proposal) => proposal.status === 'pending')
    if (pending.length === 0) {
      editor.proposalTargets = null
      return
    }
    const ways = new Set<number>()
    const nodes = new Set<number>()
    for (const proposal of pending) {
      for (const edit of proposal.edits) {
        const targets = editTargets(edit)
        targets.ways.forEach((id) => ways.add(id))
        targets.nodes.forEach((id) => nodes.add(id))
      }
    }
    editor.proposalTargets = { ways: [...ways], nodes: [...nodes] }
  }

  function propose(title: string, reason: string, edits: Edit[]): string {
    const doc = editor.doc!
    const proposal: Proposal = {
      id: `p${nextProposal++}`,
      title,
      reason,
      edits,
      lines: edits.map((edit) => describeEdit(doc, edit)),
      status: 'pending',
    }
    proposals.value.push(proposal)
    pushItem({ kind: 'proposal', proposalId: proposal.id })
    refreshTargets()
    return proposal.id
  }

  function findProposal(id: string): Proposal | undefined {
    return proposals.value.find((proposal) => proposal.id === id)
  }

  function applyProposal(id: string): void {
    const proposal = findProposal(id)
    const doc = editor.doc
    if (!proposal || !doc || proposal.status !== 'pending') return
    // Граф могли поменять, пока предложение ждало решения
    const edits = proposal.edits as Edit[]
    const stale = edits.map((edit) => validateEdit(doc, edit)).find(Boolean)
    if (stale) {
      proposal.status = 'failed'
      proposal.error = `Граф изменился: ${stale}`
      refreshTargets()
      return
    }
    const done = editor.mutate(`Помощник: ${proposal.title}`, (d, projector) => {
      for (const edit of edits) applyEdit(d, projector, edit)
      return true
    })
    if (done) {
      proposal.status = 'applied'
      appliedSteps.set(proposal.id, doc.lastStep!)
      pendingNotes.push(`Пользователь применил предложение «${proposal.title}». Граф изменён, прежние результаты расчёта устарели.`)
      editor.toast('Правки применены. Вернуть: Ctrl+Z', 'success')
    } else {
      proposal.status = 'failed'
      proposal.error = 'Правки не применились: граф оставлен без изменений'
    }
    refreshTargets()
  }

  /** Отмена из карточки доступна, только пока эта правка последняя: иначе отменилась бы чужая. */
  function canUndoProposal(id: string): boolean {
    void editor.rev
    const step = appliedSteps.get(id)
    return !!step && editor.doc?.lastStep === step
  }

  function undoProposal(id: string): void {
    if (canUndoProposal(id)) editor.undo()
  }

  function rejectProposal(id: string): void {
    const proposal = findProposal(id)
    if (!proposal || proposal.status !== 'pending') return
    proposal.status = 'rejected'
    pendingNotes.push(`Пользователь отклонил предложение «${proposal.title}».`)
    refreshTargets()
  }

  function toolContext(): ToolContext {
    return {
      doc: editor.doc!,
      projector: editor.projector!,
      issues: () => editor.issues,
      lines: () => editor.lines,
      // Результат, посчитанный до последней правки, отвечать за текущий граф не может
      macro: () => (sim.isStale() ? null : sim.macro),
      micro: () => (sim.micro && !sim.isStale() ? sim.micro.stats() : null),
      runMacro: (period, demand) => {
        sim.enter()
        if (period) sim.period = period
        if (demand) sim.demand = demand
        sim.recomputeMacro()
        return sim.macro!
      },
      params: () => ({
        period: sim.period,
        demand: sim.demand,
        guessSignals: sim.guessSignals,
        transitOn: sim.transitOn,
      }),
      focusWay: editor.focusWay,
      focusNode: editor.focusNode,
      focusLine: editor.focusLine,
      setViewMode: (mode) => {
        editor.viewMode = mode
      },
      setLevel: (level) => {
        editor.viewMode = 'sim'
        sim.enter()
        sim.setLevel(level)
      },
      addFilter: (key, op, value) => {
        editor.filterRules.push({ id: Date.now() + editor.filterRules.length, enabled: true, key, op, value })
      },
      clearFilters: () => {
        editor.filterRules = []
      },
      propose,
    }
  }

  function describeState() {
    const selected = editor.selection.slice(0, 5).map((item) => {
      if (item.kind === 'node') return `узел ${item.id}`
      const name = editor.doc?.ways.get(item.id)?.tags?.name
      return name ? `дорога «${name}» (${item.id})` : `дорога ${item.id}`
    })
    const macro = sim.macro && !sim.isStale() ? sim.macro : null
    return {
      project: editor.projectName,
      view: VIEW_NAMES[editor.viewMode] ?? editor.viewMode,
      selection: selected.join(', ') || 'ничего',
      calculation: macro
        ? `есть, период ${macro.params.period}, спрос ${Math.round(macro.params.demand * 100)}%`
        : 'нет актуального, при необходимости запусти run_macro_model',
    }
  }

  async function send(text: string): Promise<void> {
    const message = text.trim()
    if (!message || busy.value || !editor.doc) return
    if (editor.doc.inTransaction) {
      editor.toast('Сначала закончите текущую правку')
      return
    }
    pushItem({ kind: 'user', text: message })
    // Одним сообщением: некоторые локальные модели не принимают две реплики пользователя подряд
    const notes = pendingNotes.map((note) => `[Событие редактора] ${note}\n`).join('')
    const consumedNotes = pendingNotes
    pendingNotes = []
    const turnStart = history.length
    const turn = conversation
    history.push({ role: 'user', content: notes ? `${notes}\n${message}` : message })

    busy.value = true
    const current = new AbortController()
    controller = current
    const run = createToolRunner(toolContext())
    const transport: Transport = async (messages, tools, signal) => {
      const reply = await assistantChat(messages, tools, signal)
      tokens.value += reply.usage?.total_tokens ?? 0
      return reply.message
    }
    const steps = new Map<string, TimelineItem & { kind: 'step' }>()
    try {
      await runAgent({
        history,
        system: () => systemPrompt(describeState()),
        tools: TOOL_DEFINITIONS,
        transport,
        run,
        signal: current.signal,
        events: {
          onAssistantText: (content) => {
            if (content.trim()) pushItem({ kind: 'assistant', text: content })
          },
          onToolStart: (call) => {
            const name = call.function.name
            pushItem({ kind: 'step', tool: name, title: TOOL_TITLES[name] ?? name, done: false, failed: false })
            steps.set(call.id, timeline.value.at(-1) as TimelineItem & { kind: 'step' })
          },
          onToolDone: (call, result, failed) => {
            const step = steps.get(call.id)
            if (!step) {
              // Сюда попадаем, если модель прислала неразборчивые аргументы: шаг не успел начаться
              if (failed) pushItem({ kind: 'step', tool: call.function?.name ?? '', title: TOOL_TITLES[call.function?.name] ?? 'Вызов функции', done: true, failed, detail: 'Модель прислала некорректные аргументы' })
              return
            }
            step.done = true
            step.failed = failed
            if (failed) step.detail = (result as { error?: string }).error
          },
        },
      })
    } catch (error) {
      if (turn !== conversation) return
      pushItem(current.signal.aborted
        ? { kind: 'note', text: 'Остановлено' }
        : { kind: 'error', text: error instanceof Error ? error.message : String(error) })
      // Оборванный ход убираем целиком: вызов функции без ответа сервис отвергнет.
      // Что случилось, модель узнает со следующим сообщением
      history = history.slice(0, turnStart)
      pendingNotes = [...consumedNotes, `Запрос пользователя «${message}» был прерван и не выполнен.`, ...pendingNotes]
    } finally {
      if (turn === conversation) {
        busy.value = false
        controller = null
      }
    }
  }

  function stop(): void {
    controller?.abort()
  }

  return {
    settings,
    settingsOpen,
    timeline,
    proposals,
    busy,
    tokens,
    loadSettings,
    saveSettings,
    testConnection: testAssistant,
    findProposal,
    applyProposal,
    canUndoProposal,
    undoProposal,
    rejectProposal,
    send,
    stop,
    reset,
  }
})
