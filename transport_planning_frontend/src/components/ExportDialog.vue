<script setup lang="ts">
import { AlertCircle, CheckCircle2, Download, FlaskConical, TrafficCone, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { exportOsm, exportSumoSignals, type PreflightResult, runPreflight, type SumoSignalsResult } from '@/api'
import { changesWithRuleTurns } from '@/core/laneOps'
import { connectivityReport } from '@/core/validate'
import { sumoSignalGroups } from '@/sim/sumoSignals'
import { useEditor } from '@/stores/editor'

const TEAM_KEY = 'osm-editor-team-file'
const RULE_TURNS_KEY = 'osm-editor-rule-turns'

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

function readRuleTurns(): boolean {
  try {
    return localStorage.getItem(RULE_TURNS_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Дописывать turn:lanes по правилам ПДД: SUMO не знает правил редактора и раскладывает полосы по-своему. */
const ruleTurns = ref(readRuleTurns())

const ruleReport = computed(() => {
  void editor.rev
  if (!ruleTurns.value || !editor.doc || !editor.projector) return null
  return changesWithRuleTurns(editor.doc, editor.projector).report
})

function exportChanges() {
  try {
    localStorage.setItem(RULE_TURNS_KEY, ruleTurns.value ? 'on' : 'off')
  } catch {
    // Без браузерного хранилища выбор просто не запомнится
  }
  if (!ruleTurns.value || !editor.projector) return editor.doc!.changes()
  return changesWithRuleTurns(editor.doc!, editor.projector).changes
}

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
    const blob = await exportOsm(editor.projectId, exportChanges())
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

const signalsBusy = ref(false)
const signals = ref<SumoSignalsResult | null>(null)
const signalsName = computed(() => cleanName.value.replace(/\.osm$/i, '.add.xml'))
const signalsMapped = computed(() => {
  const written = signals.value?.written ?? []
  return {
    links: written.reduce((sum, item) => sum + item.links, 0),
    mapped: written.reduce((sum, item) => sum + item.mapped, 0),
    conflicts: written.reduce((sum, item) => sum + item.conflicts, 0),
  }
})

function saveText(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Фазы отдельным файлом для SUMO: сервер собирает сеть из того же .osm и привязывает к ней план редактора. */
async function downloadSignals(): Promise<void> {
  if (!editor.doc || !editor.projector || !editor.projectId) return
  signalsBusy.value = true
  error.value = null
  signals.value = null
  try {
    const result = await exportSumoSignals(editor.projectId, exportChanges(), sumoSignalGroups(editor.doc, editor.projector))
    signals.value = result
    if (result.available && result.ok && result.xml) {
      saveText(result.xml, signalsName.value, 'application/xml')
      editor.toast(`Файл ${signalsName.value} сохранён`, 'success')
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    signalsBusy.value = false
  }
}

async function check(): Promise<void> {
  if (!editor.doc || !editor.projectId) return
  checking.value = true
  error.value = null
  preflight.value = null
  try {
    preflight.value = await runPreflight(editor.projectId, exportChanges())
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

    <label class="ack rule">
      <input v-model="ruleTurns" type="checkbox" />
      <span>
        Дописать turn:lanes по правилам полос ПДД там, где разметки нет
        <span v-if="ruleReport" class="faint">
          — подходов: {{ ruleReport.written }}<template v-if="ruleReport.throughWay">, пропущено {{ ruleReport.throughWay }}: дорога проходит перекрёсток насквозь, тег относился бы ко всем её узлам</template>
        </span>
        <span class="faint block">Нужно для SUMO: без тега он раскладывает полосы по своим правилам. Проект в редакторе не меняется, теги попадают только в файл.</span>
      </span>
    </label>

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

    <div class="preflight">
      <button class="btn block" :disabled="signalsBusy" @click="downloadSignals">
        <TrafficCone :size="14" aria-hidden="true" />
        {{ signalsBusy ? 'Привязываем фазы к сети SUMO…' : `Фазы светофоров для SUMO (${signalsName})` }}
      </button>
      <template v-if="signals">
        <p v-if="!signals.available" class="muted small">{{ signals.message }}</p>
        <template v-else>
          <p class="result small" :class="signals.ok ? 'ok' : 'fail'">
            <template v-if="signals.ok">
              Светофоров в файле: {{ signals.written?.length ?? 0 }}. Соединений SUMO по плану редактора:
              {{ signalsMapped.mapped }} из {{ signalsMapped.links }}, остальные идут вместе со своим подходом.
            </template>
            <template v-else>Ни один светофор не удалось привязать к сети SUMO, файл не сохранён.</template>
          </p>
          <p v-if="signalsMapped.conflicts" class="result small fail">
            Пересекающиеся потоки с зелёным одновременно: {{ signalsMapped.conflicts }}. Проверьте состав фаз.
          </p>
          <details v-if="signals.skipped?.length" class="small">
            <summary>Без плана из редактора: {{ signals.skipped.length }}</summary>
            <ul class="log">
              <li v-for="item in signals.skipped" :key="item.id">{{ item.id }}: {{ item.reason }}</li>
            </ul>
          </details>
        </template>
      </template>
      <p class="faint small">
        Файл привязан к сети, которую {{ signals?.netconvert ?? 'netconvert' }} собирает из этого .osm с настройками по умолчанию.
        Запуск: <code>sumo -n сеть.net.xml -a {{ signalsName }}</code>. Сервер организаторов принимает только .osm, на его прогон файл не влияет.
      </p>
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
.rule {
  padding: 8px 10px;
  background: var(--raised);
  border-radius: var(--radius-sm);
}
.block {
  display: block;
  margin-top: 2px;
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
  background: var(--warn-bg);
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.status.good {
  background: var(--ok-bg);
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
  color: var(--ok-text);
}
.result.fail,
li.fail {
  color: var(--err-text);
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
  color: var(--err-text);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
