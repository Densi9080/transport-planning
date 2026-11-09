/**
 * Цикл агента: модель просит вызвать функцию, редактор её выполняет и возвращает результат,
 * пока модель не даст обычный ответ. Цикл живёт в браузере, потому что граф и расчёты тоже там.
 */

export interface ToolCall {
  id: string
  type?: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type Transport = (
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal,
) => Promise<{ content: string; tool_calls?: ToolCall[] }>

export type ToolRunner = (name: string, args: Record<string, unknown>) => unknown | Promise<unknown>

export interface AgentEvents {
  onAssistantText?: (text: string) => void
  onToolStart?: (call: ToolCall, args: Record<string, unknown>) => void
  onToolDone?: (call: ToolCall, result: unknown, failed: boolean) => void
}

export const MAX_TOOL_ROUNDS = 8
/** Длинный ответ функции занимает окно модели и вытесняет важное. */
export const MAX_TOOL_RESULT_CHARS = 9000
const MAX_HISTORY_MESSAGES = 60

export function capToolResult(result: unknown): string {
  const text = JSON.stringify(result ?? null) ?? 'null'
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [ответ обрезан: запросите меньше данных]`
}

function parseArguments(raw: unknown): Record<string, unknown> {
  // Некоторые локальные серверы присылают аргументы сразу объектом, а не строкой
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return {}
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('аргументы должны быть объектом')
  return parsed as Record<string, unknown>
}

/**
 * История обрезается только по границе сообщения пользователя:
 * ответ функции без породившего его вызова сервис отвергнет как ошибку.
 */
export function trimHistory(messages: ChatMessage[], limit = MAX_HISTORY_MESSAGES): ChatMessage[] {
  if (messages.length <= limit) return messages
  for (let start = messages.length - limit; start < messages.length; start++) {
    if (messages[start]!.role === 'user') return messages.slice(start)
  }
  // Один очень длинный ход: оставляем его целиком, а не рвём посередине
  for (let start = messages.length - limit; start >= 0; start--) {
    if (messages[start]!.role === 'user') return messages.slice(start)
  }
  return messages
}

/** Дополняет историю сообщениями этого хода и возвращает финальный текст модели. */
export async function runAgent(options: {
  history: ChatMessage[]
  system: () => string
  tools: ToolDefinition[]
  transport: Transport
  run: ToolRunner
  events?: AgentEvents
  signal?: AbortSignal
  maxRounds?: number
}): Promise<string> {
  const { history, system, tools, transport, run, events, signal } = options
  const maxRounds = options.maxRounds ?? MAX_TOOL_ROUNDS

  for (let round = 0; round <= maxRounds; round++) {
    signal?.throwIfAborted()
    // На последнем круге функций уже нет: модель обязана ответить тем, что успела узнать
    const available = round === maxRounds ? [] : tools
    const messages: ChatMessage[] = [{ role: 'system', content: system() }, ...trimHistory(history)]
    const reply = await transport(messages, available, signal)
    const calls = reply.tool_calls ?? []
    const content = reply.content ?? ''
    history.push(calls.length > 0 ? { role: 'assistant', content, tool_calls: calls } : { role: 'assistant', content })

    if (calls.length === 0) {
      events?.onAssistantText?.(content)
      return content
    }
    if (content.trim()) events?.onAssistantText?.(content)

    for (const call of calls) {
      signal?.throwIfAborted()
      let result: unknown
      let failed = false
      try {
        const args = parseArguments(call.function?.arguments)
        events?.onToolStart?.(call, args)
        result = await run(call.function?.name, args)
      } catch (error) {
        failed = true
        // Ошибка возвращается модели: часто она сама поправит запрос
        result = { error: error instanceof Error ? error.message : String(error) }
      }
      events?.onToolDone?.(call, result, failed)
      history.push({ role: 'tool', tool_call_id: call.id, content: capToolResult(result) })
    }
  }
  return ''
}
