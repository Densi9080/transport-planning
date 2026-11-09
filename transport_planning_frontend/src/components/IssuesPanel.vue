<script setup lang="ts">
import { AlertCircle, AlertTriangle, ChevronRight, Info, Wrench } from 'lucide-vue-next'
import { computed, reactive } from 'vue'

import { ISSUE_TITLES, type Issue, type IssueCode } from '@/core/validate'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const open = reactive<Record<string, boolean>>({})

const groups = computed(() => {
  const result = new Map<IssueCode, Issue[]>()
  for (const issue of editor.issues) {
    const list = result.get(issue.code)
    if (list) list.push(issue)
    else result.set(issue.code, [issue])
  }
  return [...result.entries()].map(([code, issues]) => ({ code, issues }))
})

const counts = computed(() => {
  const result = { error: 0, warning: 0, info: 0 }
  for (const issue of editor.issues) result[issue.severity]++
  return result
})
</script>

<template>
  <section class="section">
    <div class="summary">
      <span class="count error"><AlertCircle :size="13" aria-hidden="true" /> Ошибок: {{ counts.error }}</span>
      <span class="count warning"><AlertTriangle :size="13" aria-hidden="true" /> {{ counts.warning }}</span>
      <span class="count info"><Info :size="13" aria-hidden="true" /> {{ counts.info }}</span>
    </div>
    <p v-if="editor.issues.length === 0" class="empty">Ошибок в сети не найдено</p>
    <template v-for="group in groups" :key="group.code">
      <button class="group" :aria-expanded="open[group.code] ?? false" @click="open[group.code] = !open[group.code]">
        <ChevronRight :size="13" :class="{ turned: open[group.code] }" aria-hidden="true" />
        <span class="dot" :class="group.issues[0]!.severity" aria-hidden="true" />
        <span class="ellipsis">{{ ISSUE_TITLES[group.code] }}</span>
        <span class="faint">{{ group.issues.length }}</span>
      </button>
      <template v-if="open[group.code]">
        <div
          v-for="issue in group.issues.slice(0, 80)"
          :key="issue.id"
          class="issue"
          :class="{ focused: editor.focusedIssue === issue.id }"
        >
          <button class="text" @click="editor.focusIssue(issue)">{{ issue.message }}</button>
          <button v-if="issue.fix" class="btn small" @click="editor.applyFix(issue)">
            <Wrench :size="11" aria-hidden="true" />
            {{ issue.fixLabel }}
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
  gap: 10px;
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
</style>
