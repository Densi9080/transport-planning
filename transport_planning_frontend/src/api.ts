import type { ChatMessage, ToolCall, ToolDefinition } from './assistant/agent'
import type { Changes, RawDocument } from './core/types'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
}

export interface ProjectDetail extends ProjectSummary {
  document: RawDocument
  changes: Changes
}

export interface PreflightResult {
  available: boolean
  message?: string
  ok?: boolean
  errors?: string[]
  warnings?: string[]
  warningCount?: number
  stats?: { edges: number; lanes: number; junctions: number; tls: number } | null
}

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response
  let detail = `Ошибка сервера: ${response.status}`
  try {
    const body = await response.json()
    if (body?.detail) detail = body.detail
  } catch {
    // Тело ответа не JSON: оставляем общее сообщение
  }
  throw new Error(detail)
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function listProjects(): Promise<ProjectSummary[]> {
  return (await ensureOk(await fetch('/api/projects/'))).json()
}

export async function uploadProject(file: File): Promise<ProjectSummary> {
  const form = new FormData()
  form.append('file', file)
  return (await ensureOk(await fetch('/api/projects/', { method: 'POST', body: form }))).json()
}

export async function createSampleProject(): Promise<ProjectSummary> {
  return (
    await ensureOk(await fetch('/api/projects/', jsonRequest('POST', { sample: true })))
  ).json()
}

export async function loadProject(id: string): Promise<ProjectDetail> {
  return (await ensureOk(await fetch(`/api/projects/${id}/`))).json()
}

export async function saveChanges(id: string, changes: Changes): Promise<void> {
  await ensureOk(await fetch(`/api/projects/${id}/changes/`, jsonRequest('PUT', { changes })))
}

export async function exportOsm(id: string, changes: Changes): Promise<Blob> {
  return (
    await ensureOk(await fetch(`/api/projects/${id}/export/`, jsonRequest('POST', { changes })))
  ).blob()
}

export async function runPreflight(id: string, changes: Changes): Promise<PreflightResult> {
  return (
    await ensureOk(await fetch(`/api/projects/${id}/preflight/`, jsonRequest('POST', { changes })))
  ).json()
}

export interface AssistantSettings {
  baseUrl: string
  model: string
  hasKey: boolean
  locked: boolean
  configured: boolean
}

export interface AssistantReply {
  message: { content: string; tool_calls?: ToolCall[] }
  usage?: { total_tokens?: number } | null
}

export async function getAssistantSettings(): Promise<AssistantSettings> {
  return (await ensureOk(await fetch('/api/assistant/settings/'))).json()
}

export async function saveAssistantSettings(payload: {
  baseUrl?: string
  model?: string
  apiKey?: string
  clearKey?: boolean
}): Promise<AssistantSettings> {
  return (await ensureOk(await fetch('/api/assistant/settings/', jsonRequest('PUT', payload)))).json()
}

export async function testAssistant(payload: { baseUrl: string; apiKey: string }): Promise<{ ok: boolean; models: string[] }> {
  return (await ensureOk(await fetch('/api/assistant/test/', jsonRequest('POST', payload)))).json()
}

export async function assistantChat(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal,
): Promise<AssistantReply> {
  const request = { ...jsonRequest('POST', { messages, tools }), signal }
  return (await ensureOk(await fetch('/api/assistant/chat/', request))).json()
}
