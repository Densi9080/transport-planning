<script setup lang="ts">
import { AlertCircle, CheckCircle2, Download, FlaskConical, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { exportOsm, type PreflightResult, runPreflight } from '@/api'
import { connectivityReport } from '@/core/validate'
import { useEditor } from '@/stores/editor'

const TEAM_KEY = 'osm-editor-team-file'

const editor = useEditor()
const dialog = ref<HTMLDialogElement | null>(null)
const busy = ref(false)
const checking = ref(false)
const preflight = ref<PreflightResult | null>(null)
const error = ref<string | null>(null)

function readStoredName(): string | null {
  try {
    return localStorage.getItem(TEAM_KEY)
  } catch {
    return null
  }
}

const fileName = ref(readStoredName() ?? editor.projectName.replace(/\.osm$/i, '') + '_edited')

const connectivity = computed(() => {
  void editor.rev
  return editor.doc ? connectivityReport(editor.doc) : null
})
/** Сохранить файл с ошибками можно, но только осознанно: от этого зависит допуск. */
const acknowledged = ref(false)
const needsAcknowledge = computed(() => counts.value.error > 0 || (connectivity.value ? !connectivity.value.ok : false))

function showConnectivityProblems(): void {
  const report = connectivity.value
  if (!report) return
  const first = report.isolatedWays[0] ?? report.oneDirectionWays[0]
  if (first !== undefined) {
    editor.select([...report.isolatedWays, ...report.oneDirectionWays].slice(0, 12).map((id) => ({ kind: 'way' as const, id })))
    editor.focusOn(editor.doc!.node(editor.doc!.way(first).nds[0]!), 16.5)
    close()
  }
}

const counts = computed(() => {
  const result = { error: 0, warning: 0 }
  for (const issue of editor.issues) {
    if (issue.severity === 'error') result.error++
    else if (issue.severity === 'warning') result.warning++
  }
  return result
})

const cleanName = computed(() => {
  const stem = fileName.value
    .trim()
    .replace(/\.osm$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
  return stem ? `${stem}.osm` : 'graph.osm'
})

function close(): void {
  editor.exportOpen = false
}

async function download(): Promise<void> {
  if (!editor.doc || !editor.projectId) return
  busy.value = true
  error.value = null
  try {
    editor.runValidation()
    const blob = await exportOsm(editor.projectId, editor.doc.changes())
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = cleanName.value
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    try {
      localStorage.setItem(TEAM_KEY, fileName.value)
    } catch {
      // Без браузерного хранилища имя просто не запомнится
    }
    editor.toast(`Файл ${cleanName.value} сохранён`, 'success')
    close()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function check(): Promise<void> {
  if (!editor.doc || !editor.projectId) return
  checking.value = true
  error.value = null
  preflight.value = null
  try {
    preflight.value = await runPreflight(editor.projectId, editor.doc.changes())
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    checking.value = false
  }
}

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="export-title" @close="close">
    <div class="head">
      <h2 id="export-title">Экспорт .osm</h2>
      <button class="btn ghost small" aria-label="Закрыть" @click="close"><X :size="15" /></button>
    </div>

    <div class="field">
      <label for="export-name">Имя файла</label>
      <input id="export-name" v-model="fileName" class="input" />
      <span class="faint small">Для сдачи файл называют по команде, например team1.osm. Сейчас: {{ cleanName }}</span>
    </div>

    <div class="status" :class="counts.error ? 'bad' : 'good'">
      <AlertCircle v-if="counts.error" :size="15" aria-hidden="true" />
      <CheckCircle2 v-else :size="15" aria-hidden="true" />
      <span>
        Правок: {{ editor.changeCount }}. Ошибок сети: {{ counts.error }}, предупреждений: {{ counts.warning }}.
        <template v-if="counts.error">Файл можно сохранить, но симулятор может повести себя неверно.</template>
      </span>
    </div>

    <div v-if="connectivity" class="status" :class="connectivity.ok ? 'good' : 'bad'">
      <CheckCircle2 v-if="connectivity.ok" :size="15" aria-hidden="true" />
      <AlertCircle v-else :size="15" aria-hidden="true" />
      <span>
        <strong>Связность графа.</strong>
        Дорог: {{ connectivity.totalWays }}, связных групп: {{ connectivity.components }}.
        <template v-if="connectivity.ok"> С любой дороги можно доехать до любой другой.</template>
        <template v-else>
          Вне основной сети: {{ connectivity.isolatedWays.length }}.
          Без проезда в обе стороны: {{ connectivity.oneDirectionWays.length }}.
          Дороги, обрезанные рамкой файла, тоже попадают сюда.
          <button class="link" @click="showConnectivityProblems">Показать на карте</button>
        </template>
      </span>
    </div>

    <div class="preflight">
      <button class="btn block" :disabled="checking" @click="check">
        <FlaskConical :size="14" aria-hidden="true" />
        {{ checking ? 'Собираем сеть…' : 'Проверить сборкой в SUMO (netconvert)' }}
      </button>
      <template v-if="preflight">
        <p v-if="!preflight.available" class="muted small">{{ preflight.message }}</p>
        <template v-else>
          <p class="result small" :class="preflight.ok ? 'ok' : 'fail'">
            {{ preflight.ok ? 'Сеть собралась' : 'Сеть не собралась' }}<template v-if="preflight.stats">:
              рёбер {{ preflight.stats.edges }}, полос {{ preflight.stats.lanes }},
              перекрёстков {{ preflight.stats.junctions }}, светофоров {{ preflight.stats.tls }}</template>.
            Предупреждений: {{ preflight.warningCount ?? 0 }}.
          </p>
          <ul v-if="preflight.errors?.length" class="log small">
            <li v-for="(line, index) in preflight.errors.slice(0, 20)" :key="index" class="fail">{{ line }}</li>
          </ul>
          <details v-if="preflight.warnings?.length" class="small">
            <summary>Предупреждения netconvert</summary>
            <ul class="log">
              <li v-for="(line, index) in preflight.warnings.slice(0, 100)" :key="index">{{ line }}</li>
            </ul>
          </details>
          <p class="faint small">Настройки сервера организаторов могут отличаться: окончательно файл проверяет только он.</p>
        </template>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <label v-if="needsAcknowledge" class="ack">
      <input v-model="acknowledged" type="checkbox" />
      Понимаю, что в графе остались ошибки, и всё равно сохраняю
    </label>

    <div class="actions">
      <button class="btn" @click="close">Отмена</button>
      <button class="btn primary" :disabled="busy || (needsAcknowledge && !acknowledged)" @click="download">
        <Download :size="14" aria-hidden="true" />
        {{ busy ? 'Готовим файл…' : 'Сохранить файл' }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(500px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  padding: 16px;
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  color: var(--text);
}
.dialog[open] {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dialog::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.small {
  font-size: 12px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--select);
  text-decoration: underline;
}
.ack {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
}
.ack input {
  margin-top: 2px;
  accent-color: var(--accent);
}
.status {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
}
.status svg {
  flex: none;
  margin-top: 2px;
}
.status.bad {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.status.good {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.35);
}
.preflight {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preflight p {
  margin: 0;
}
.result.ok {
  color: #86efac;
}
.result.fail,
li.fail {
  color: #fca5a5;
}
.log {
  max-height: 160px;
  margin: 4px 0 0;
  padding-left: 16px;
  overflow-y: auto;
  color: var(--muted);
}
.error {
  margin: 0;
  color: #fca5a5;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
