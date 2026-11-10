<script setup lang="ts">
import { Check, CircleAlert, LoaderCircle, RotateCcw, Send, Settings, Sparkles, Square, X } from 'lucide-vue-next'
import { nextTick, onMounted, ref, watch } from 'vue'

import { type TimelineItem, useAssistant } from '@/stores/assistant'

import AssistantText from './AssistantText.vue'

const assistant = useAssistant()
const input = ref('')
const scroller = ref<HTMLElement | null>(null)

const EXAMPLES = [
  'Где самые загруженные участки утром и почему?',
  'Какие ошибки сети исправить в первую очередь?',
  'Что будет, если добавить полосу на самом загруженном участке?',
  'У каких дорог нет числа полос и скорости?',
]

function submit(): void {
  const text = input.value
  if (!text.trim() || assistant.busy) return
  input.value = ''
  void assistant.send(text)
}

function ask(text: string): void {
  void assistant.send(text)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

function proposalOf(item: TimelineItem) {
  return item.kind === 'proposal' ? assistant.findProposal(item.proposalId) : undefined
}

const STATUS_LABELS = { applied: 'Применено', undone: 'Отменено', rejected: 'Отклонено', failed: 'Не применено', pending: '' }

onMounted(() => void assistant.loadSettings())

watch(
  () => [assistant.timeline.length, assistant.busy],
  async () => {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
)
</script>

<template>
  <div class="assistant">
    <div class="bar">
      <span class="connection ellipsis" :class="{ ok: assistant.settings?.configured }" :title="assistant.settings?.baseUrl">
        {{ assistant.settings?.configured ? assistant.settings.model : 'Не подключён' }}
      </span>
      <span class="spacer" />
      <span v-if="assistant.tokens" class="faint nums" title="Токенов потрачено в этом разговоре">{{ assistant.tokens.toLocaleString('ru-RU') }}</span>
      <button class="btn ghost small" title="Новый разговор" aria-label="Новый разговор" :disabled="assistant.timeline.length === 0" @click="assistant.reset"><RotateCcw :size="13" /></button>
      <button class="btn ghost small" title="Подключение к модели" aria-label="Подключение к модели" @click="assistant.settingsOpen = true"><Settings :size="13" /></button>
    </div>

    <div ref="scroller" class="messages" aria-live="polite">
      <div v-if="assistant.settings && !assistant.settings.configured" class="setup">
        <Sparkles :size="20" class="faint" aria-hidden="true" />
        <p>Подключите модель: облачный сервис с ключом или локальный сервер вроде Ollama и LM Studio.</p>
        <button class="btn primary" @click="assistant.settingsOpen = true">Настроить подключение</button>
      </div>
      <div v-else-if="assistant.timeline.length === 0" class="start">
        <p class="muted">Помощник сам вызывает расчёты редактора и отвечает по их результатам. Правки он только предлагает: применяете их вы.</p>
        <button v-for="example in EXAMPLES" :key="example" class="example" :disabled="assistant.busy" @click="ask(example)">{{ example }}</button>
      </div>

      <template v-for="item in assistant.timeline" :key="item.id">
        <div v-if="item.kind === 'user'" class="bubble user">{{ item.text }}</div>
        <div v-else-if="item.kind === 'assistant'" class="bubble"><AssistantText :text="item.text" /></div>
        <div v-else-if="item.kind === 'error'" class="error" role="alert">
          <CircleAlert :size="13" aria-hidden="true" />
          <span>{{ item.text }}</span>
        </div>
        <div v-else-if="item.kind === 'note'" class="note faint">{{ item.text }}</div>
        <div v-else-if="item.kind === 'step'" class="step" :class="{ failed: item.failed }">
          <X v-if="item.failed" :size="12" aria-hidden="true" />
          <Check v-else-if="item.done" :size="12" aria-hidden="true" />
          <LoaderCircle v-else :size="12" class="spin" aria-hidden="true" />
          <span class="ellipsis" :title="item.detail">{{ item.title }}{{ item.failed && item.detail ? `: ${item.detail}` : '' }}</span>
        </div>
        <div v-else-if="proposalOf(item)" class="proposal" :class="proposalOf(item)!.status">
          <strong>{{ proposalOf(item)!.title }}</strong>
          <AssistantText v-if="proposalOf(item)!.reason" class="reason" :text="proposalOf(item)!.reason" />
          <ul>
            <li v-for="(line, index) in proposalOf(item)!.lines" :key="index">{{ line }}</li>
          </ul>
          <div v-if="proposalOf(item)!.status === 'pending'" class="row">
            <button class="btn primary small grow" @click="assistant.applyProposal(proposalOf(item)!.id)"><Check :size="12" aria-hidden="true" /> Применить</button>
            <button class="btn small" @click="assistant.rejectProposal(proposalOf(item)!.id)">Отклонить</button>
          </div>
          <div v-else class="status">
            {{ STATUS_LABELS[proposalOf(item)!.status] }}<template v-if="proposalOf(item)!.error">: {{ proposalOf(item)!.error }}</template>
            <button v-if="proposalOf(item)!.status === 'applied' && assistant.canUndoProposal(proposalOf(item)!.id)" class="link" @click="assistant.undoProposal(proposalOf(item)!.id)">Отменить</button>
          </div>
        </div>
      </template>
      <div v-if="assistant.busy" class="thinking faint"><LoaderCircle :size="12" class="spin" aria-hidden="true" /> Думаю…</div>
    </div>

    <form class="composer" @submit.prevent="submit">
      <textarea
        v-model="input"
        class="input"
        rows="2"
        placeholder="Спросите о сети или попросите проверить вариант"
        aria-label="Сообщение помощнику"
        :disabled="assistant.settings?.configured === false"
        @keydown="onKey"
      />
      <button v-if="assistant.busy" class="btn" type="button" aria-label="Остановить" title="Остановить" @click="assistant.stop"><Square :size="14" /></button>
      <button v-else class="btn primary" type="submit" aria-label="Отправить" title="Отправить (Enter)" :disabled="!input.trim()"><Send :size="14" /></button>
    </form>
  </div>
</template>

<style scoped>
.assistant {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border-bottom: 1px solid var(--line);
}
.connection {
  max-width: 160px;
  color: var(--faint);
  font-size: 11px;
}
.connection.ok {
  color: var(--ok-text);
}
.nums {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.setup,
.start {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.setup {
  align-items: center;
  padding: 18px 8px;
  text-align: center;
}
p {
  margin: 0;
}
.example {
  padding: 4px 7px;
  background: var(--raised);
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  text-align: left;
}
.example:hover:not(:disabled) {
  background: var(--row-hover);
  border-color: var(--accent);
}
.bubble {
  padding: 5px 7px;
  background: var(--raised);
  border: 1px solid var(--line);
}
.bubble.user {
  align-self: flex-end;
  max-width: 88%;
  background: var(--row-selected);
  border-color: transparent;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.step {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
}
.step svg {
  flex: none;
}
.step.failed {
  color: var(--warn-text);
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.thinking {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.note {
  font-size: 11px;
  text-align: center;
}
.error {
  display: flex;
  gap: 5px;
  padding: 5px 7px;
  background: var(--err-bg);
  color: var(--err-text);
  overflow-wrap: anywhere;
}
.error svg {
  flex: none;
  margin-top: 2px;
}
.proposal {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px;
  background: var(--warn-bg);
  border: 1px solid var(--warn);
}
.proposal.applied {
  background: var(--ok-bg);
  border-color: var(--ok);
}
.proposal.rejected,
.proposal.undone {
  background: var(--inset);
  border-color: var(--line-strong);
}
.proposal.failed {
  background: var(--err-bg);
  border-color: var(--err);
}
.reason {
  color: var(--muted);
}
.proposal ul {
  margin: 0;
  padding-left: 15px;
}
.grow {
  flex: 1;
}
.status {
  color: var(--muted);
  font-size: 11px;
}
.link {
  margin-left: 6px;
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--select);
  text-decoration: underline;
}
.composer {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 6px;
  border-top: 1px solid var(--line-strong);
}
.composer textarea {
  flex: 1;
  min-width: 0;
  resize: none;
}
.composer .btn {
  width: 32px;
  padding: 0;
}
</style>
