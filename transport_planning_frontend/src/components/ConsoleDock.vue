<script setup lang="ts">
import { AlertCircle, AlertTriangle, Info, ScrollText, Wrench, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { ISSUE_TITLES, type Issue } from '@/core/validate'
import { useEditor } from '@/stores/editor'

type Tab = 'error' | 'warning' | 'info' | 'log'

const editor = useEditor()
const tab = ref<Tab>('error')
const query = ref('')
const ROW_LIMIT = 400

const counts = computed(() => {
  const result = { error: 0, warning: 0, info: 0 }
  for (const issue of editor.issues) result[issue.severity]++
  return result
})

const tabs = computed(() => [
  { id: 'error' as const, label: 'Ошибки', count: counts.value.error, icon: AlertCircle },
  { id: 'warning' as const, label: 'Предупреждения', count: counts.value.warning, icon: AlertTriangle },
  { id: 'info' as const, label: 'Заметки', count: counts.value.info, icon: Info },
  { id: 'log' as const, label: 'Журнал', count: editor.consoleLog.length, icon: ScrollText },
])

function matches(text: string): boolean {
  const needle = query.value.trim().toLowerCase()
  return !needle || text.toLowerCase().includes(needle)
}

const issueRows = computed(() =>
  editor.issues.filter((issue) => issue.severity === tab.value && matches(`${ISSUE_TITLES[issue.code]} ${issue.message}`)),
)
const logRows = computed(() => editor.consoleLog.filter((entry) => matches(`${entry.source} ${entry.text}`)).slice().reverse())

function objectLabel(issue: Issue): string {
  const parts: string[] = []
  if (issue.wayIds[0] !== undefined) parts.push(`отрезок ${issue.wayIds[0]}`)
  if (issue.nodeIds[0] !== undefined) parts.push(`узел ${issue.nodeIds[0]}`)
  const more = issue.wayIds.length + issue.nodeIds.length - parts.length
  return parts.join(', ') + (more > 0 ? ` и ещё ${more}` : '')
}
</script>

<template>
  <section class="console" aria-label="Консоль">
    <header>
      <div class="tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.id"
          role="tab"
          :class="[item.id, { active: tab === item.id }]"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          <component :is="item.icon" :size="13" aria-hidden="true" />
          {{ item.label }}
          <span class="count">{{ item.count }}</span>
        </button>
      </div>
      <input v-model="query" class="input find" placeholder="Поиск в консоли" aria-label="Поиск в консоли" />
      <button class="close" title="Скрыть консоль (Ё)" aria-label="Скрыть консоль" @click="editor.consoleOpen = false"><X :size="14" /></button>
    </header>

    <div class="body">
      <table v-if="tab !== 'log'">
        <thead>
          <tr><th class="n">№</th><th class="kind">Вид</th><th>Сообщение</th><th class="object">Объект</th><th class="act" /></tr>
        </thead>
        <tbody>
          <tr
            v-for="(issue, index) in issueRows.slice(0, ROW_LIMIT)"
            :key="issue.id"
            :class="{ focused: editor.focusedIssue === issue.id }"
            title="Показать на карте"
            @click="editor.focusIssue(issue)"
          >
            <td class="n">{{ index + 1 }}</td>
            <td class="kind">{{ ISSUE_TITLES[issue.code] }}</td>
            <td>{{ issue.message }}</td>
            <td class="object">{{ objectLabel(issue) }}</td>
            <td class="act">
              <button v-if="issue.fix" class="btn small" @click.stop="editor.applyFix(issue)">
                <Wrench :size="11" aria-hidden="true" /> {{ issue.fixLabel }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else>
        <thead>
          <tr><th class="time">Время</th><th class="kind">Источник</th><th>Сообщение</th></tr>
        </thead>
        <tbody>
          <tr v-for="entry in logRows" :key="entry.id" class="plain" :class="entry.level">
            <td class="time">{{ entry.time }}</td>
            <td class="kind">{{ entry.source }}</td>
            <td class="pre">{{ entry.text }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="tab !== 'log' && issueRows.length === 0" class="empty">Сообщений нет</p>
      <p v-if="tab === 'log' && logRows.length === 0" class="empty">Журнал пуст</p>
      <p v-if="tab !== 'log' && issueRows.length > ROW_LIMIT" class="empty">Показаны первые {{ ROW_LIMIT }} из {{ issueRows.length }}</p>
    </div>
  </section>
</template>

<style scoped>
.console {
  flex: none;
  display: flex;
  flex-direction: column;
  height: 190px;
  min-height: 0;
  background: var(--panel);
  border-top: 1px solid var(--line-strong);
}
header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  border-bottom: 1px solid var(--line-strong);
}
.tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 5px 10px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--text);
}
.tabs button.error svg {
  color: var(--err-text);
}
.tabs button.warning svg {
  color: var(--warn-text);
}
.count {
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.find {
  flex: none;
  width: 180px;
}
.close {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}
.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th {
  position: sticky;
  top: 0;
  padding: 3px 8px;
  background: var(--raised);
  color: var(--muted);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
td {
  padding: 3px 8px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
tbody tr:not(.plain) {
  cursor: pointer;
}
tbody tr:not(.plain):hover {
  background: var(--row-hover);
}
tr.focused {
  background: var(--row-selected);
}
tr.error td:last-child {
  color: var(--err-text);
}
tr.warning td:last-child {
  color: var(--warn-text);
}
.n {
  width: 36px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.time {
  width: 72px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.kind {
  width: 190px;
  color: var(--muted);
}
.object {
  width: 220px;
  color: var(--muted);
}
.act {
  width: 1%;
  white-space: nowrap;
}
.pre {
  white-space: pre-wrap;
}
.empty {
  margin: 10px 12px;
  color: var(--faint);
}
</style>
