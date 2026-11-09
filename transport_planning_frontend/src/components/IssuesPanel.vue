<script setup lang="ts">
import { AlertCircle, AlertTriangle, ChevronRight, Info, Wrench } from 'lucide-vue-next'
import { computed, reactive } from 'vue'

import { ISSUE_TITLES, type Issue, type IssueCode } from '@/core/validate'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const open = reactive<Record<string, boolean>>({})

interface Row {
  key: string
  message: string
  /** Одна улица в файле часто разбита на участки: одинаковые сообщения показываем одной строкой. */
  issues: Issue[]
}

const groups = computed(() => {
  const result = new Map<IssueCode, Issue[]>()
  for (const issue of editor.issues) {
    const list = result.get(issue.code)
    if (list) list.push(issue)
    else result.set(issue.code, [issue])
  }
  return [...result.entries()].map(([code, issues]) => {
    const rows = new Map<string, Row>()
    for (const issue of issues) {
      const row = rows.get(issue.message)
      if (row) row.issues.push(issue)
      else rows.set(issue.message, { key: issue.id, message: issue.message, issues: [issue] })
    }
    return { code, severity: issues[0]!.severity, total: issues.length, rows: [...rows.values()] }
  })
})

const counts = computed(() => {
  const result = { error: 0, warning: 0, info: 0 }
  for (const issue of editor.issues) result[issue.severity]++
  return result
})

/** Ошибки видны сразу, а подсказки не занимают место, пока их не раскроют. */
function isOpen(group: { code: string; severity: string }): boolean {
  return open[group.code] ?? group.severity === 'error'
}

function toggle(group: { code: string; severity: string }): void {
  open[group.code] = !isOpen(group)
}

function fixRow(row: Row): void {
  for (const issue of row.issues) if (issue.fix) editor.applyFix(issue)
}
</script>

<template>
  <section class="section">
    <div class="summary">
      <span class="count error"><AlertCircle :size="13" aria-hidden="true" /> Ошибок {{ counts.error }}</span>
      <span class="count warning"><AlertTriangle :size="13" aria-hidden="true" /> Предупреждений {{ counts.warning }}</span>
      <span class="count info"><Info :size="13" aria-hidden="true" /> Заметок {{ counts.info }}</span>
    </div>
    <p v-if="editor.issues.length === 0" class="empty">Ошибок в сети не найдено</p>
    <template v-for="group in groups" :key="group.code">
      <button class="group" :aria-expanded="isOpen(group)" @click="toggle(group)">
        <ChevronRight :size="13" :class="{ turned: isOpen(group) }" aria-hidden="true" />
        <span class="dot" :class="group.severity" aria-hidden="true" />
        <span class="ellipsis">{{ ISSUE_TITLES[group.code] }}</span>
        <span class="faint">{{ group.total }}</span>
      </button>
      <template v-if="isOpen(group)">
        <div
          v-for="row in group.rows.slice(0, 80)"
          :key="row.key"
          class="issue"
          :class="{ focused: row.issues.some((issue) => editor.focusedIssue === issue.id) }"
        >
          <button class="text" title="Показать на карте" @click="editor.focusIssue(row.issues[0]!)">
            {{ row.message }}<span v-if="row.issues.length > 1" class="times"> · участков: {{ row.issues.length }}</span>
          </button>
          <button v-if="row.issues[0]!.fix" class="btn small" @click="fixRow(row)">
            <Wrench :size="11" aria-hidden="true" />
            {{ row.issues[0]!.fixLabel }}<template v-if="row.issues.length > 1"> на всех</template>
          </button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.section {
  gap: 1px;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding-bottom: 6px;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.count.error {
  color: var(--err-text);
}
.count.warning {
  color: var(--warn-text);
}
.count.info {
  color: var(--info);
}
.empty {
  margin: 4px;
  color: var(--faint);
}
.group {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 3px 2px;
  background: transparent;
  border: 0;
  font-weight: 600;
  text-align: left;
}
.group:hover {
  background: var(--row-hover);
}
.group svg {
  flex: none;
  transition: transform 0.1s;
}
.group svg.turned {
  transform: rotate(90deg);
}
.group > .faint {
  margin-left: auto;
  font-weight: 400;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.error {
  background: var(--err);
}
.dot.warning {
  background: var(--warn);
}
.dot.info {
  background: var(--info);
}
.issue {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin-left: 16px;
  padding: 3px 5px;
}
.issue:hover,
.issue.focused {
  background: var(--row-hover);
}
.text {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 11px;
  text-align: left;
}
.text:hover {
  color: var(--text);
}
.times {
  color: var(--faint);
}
</style>
