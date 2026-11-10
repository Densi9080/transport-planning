<script setup lang="ts">
import { Check, CircleAlert, Cloud, HardDrive, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { useAssistant } from '@/stores/assistant'

const assistant = useAssistant()
const dialog = ref<HTMLDialogElement | null>(null)

interface Preset {
  id: string
  label: string
  url: string
  local: boolean
}

const PRESETS: Preset[] = [
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', local: false },
  { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434/v1', local: true },
  { id: 'lmstudio', label: 'LM Studio', url: 'http://localhost:1234/v1', local: true },
]

const baseUrl = ref(assistant.settings?.baseUrl ?? '')
const model = ref(assistant.settings?.model ?? '')
const apiKey = ref('')
const models = ref<string[]>([])
const testing = ref(false)
const saving = ref(false)
const result = ref<{ ok: boolean; text: string } | null>(null)

const locked = computed(() => assistant.settings?.locked ?? false)
const hasKey = computed(() => assistant.settings?.hasKey ?? false)

/** Адрес на этом же компьютере: ключ обычно не нужен, а данные никуда не уходят. */
const isLocal = computed(() => {
  try {
    const host = new URL(baseUrl.value).hostname
    return ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(host) || host.endsWith('.local')
  } catch {
    return false
  }
})

function choose(preset: Preset): void {
  baseUrl.value = preset.url
  result.value = null
  models.value = []
}

function close(): void {
  assistant.settingsOpen = false
}

async function test(): Promise<void> {
  testing.value = true
  result.value = null
  try {
    const answer = await assistant.testConnection({ baseUrl: baseUrl.value, apiKey: apiKey.value })
    models.value = answer.models
    result.value = {
      ok: true,
      text: answer.models.length > 0 ? `Подключение работает. Доступно моделей: ${answer.models.length}` : 'Подключение работает, но сервис не вернул список моделей',
    }
    if (!model.value && answer.models.length === 1) model.value = answer.models[0]!
  } catch (error) {
    result.value = { ok: false, text: error instanceof Error ? error.message : String(error) }
  } finally {
    testing.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  result.value = null
  try {
    await assistant.saveSettings({ baseUrl: baseUrl.value, model: model.value, ...(apiKey.value ? { apiKey: apiKey.value } : {}) })
    close()
  } catch (error) {
    result.value = { ok: false, text: error instanceof Error ? error.message : String(error) }
  } finally {
    saving.value = false
  }
}

async function clearKey(): Promise<void> {
  try {
    await assistant.saveSettings({ clearKey: true })
    apiKey.value = ''
    result.value = { ok: true, text: 'Ключ удалён с сервера' }
  } catch (error) {
    result.value = { ok: false, text: error instanceof Error ? error.message : String(error) }
  }
}

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="assistant-settings-title" @close="close">
    <div class="dock-title">
      <span id="assistant-settings-title">Подключение помощника к модели</span>
      <span class="spacer" />
      <button class="btn ghost small" aria-label="Закрыть" @click="close"><X :size="14" /></button>
    </div>

    <form class="content" @submit.prevent="save">
      <p v-if="locked" class="muted">Подключение задано администратором сервера и здесь не меняется.</p>

      <div v-if="!locked" class="field">
        <label>Быстрый выбор</label>
        <div class="presets">
          <button v-for="preset in PRESETS" :key="preset.id" type="button" class="btn" :class="{ on: baseUrl === preset.url }" @click="choose(preset)">
            <HardDrive v-if="preset.local" :size="13" aria-hidden="true" />
            <Cloud v-else :size="13" aria-hidden="true" />
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <label for="llm-url">Адрес сервиса (совместимый с OpenAI API)</label>
        <input id="llm-url" v-model="baseUrl" class="input" :disabled="locked" placeholder="https://…/v1" autocomplete="off" spellcheck="false" />
        <span class="hint" :class="isLocal ? 'local' : ''">
          <template v-if="isLocal">Локальная модель: данные остаются на этом компьютере. Внутри Docker вместо localhost используйте host.docker.internal.</template>
          <template v-else-if="baseUrl">Облачный сервис: вопросы, атрибуты дорог и результаты расчётов отправляются на этот адрес.</template>
        </span>
      </div>

      <div class="field">
        <label for="llm-key">Ключ доступа<template v-if="isLocal"> (локальным серверам обычно не нужен)</template></label>
        <div class="row">
          <input
            id="llm-key"
            v-model="apiKey"
            class="input"
            type="password"
            :disabled="locked"
            :placeholder="hasKey ? 'Ключ сохранён на сервере. Оставьте пустым, чтобы не менять' : 'Не задан'"
            autocomplete="new-password"
          />
          <button v-if="hasKey && !locked" type="button" class="btn" @click="clearKey">Удалить</button>
        </div>
        <span class="hint">Ключ хранится только на сервере редактора и в браузер не возвращается.</span>
      </div>

      <div class="field">
        <label for="llm-model">Модель</label>
        <div class="row">
          <input id="llm-model" v-model="model" class="input" list="llm-models" :disabled="locked" placeholder="Название модели" autocomplete="off" spellcheck="false" />
          <button v-if="!locked" type="button" class="btn" :disabled="testing || !baseUrl.trim()" @click="test">{{ testing ? 'Проверка…' : 'Проверить' }}</button>
        </div>
        <datalist id="llm-models">
          <option v-for="item in models" :key="item" :value="item" />
        </datalist>
        <span class="hint">Модель должна поддерживать вызов функций (function calling), иначе помощник не сможет запускать расчёты.</span>
      </div>

      <div v-if="result" class="result" :class="result.ok ? 'ok' : 'fail'" role="status">
        <Check v-if="result.ok" :size="13" aria-hidden="true" />
        <CircleAlert v-else :size="13" aria-hidden="true" />
        <span>{{ result.text }}</span>
      </div>

      <div class="actions">
        <button type="button" class="btn" @click="close">Отмена</button>
        <button v-if="!locked" type="submit" class="btn primary" :disabled="saving || !baseUrl.trim() || !model.trim()">Сохранить</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(520px, calc(100vw - 24px));
  padding: 0;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  color: var(--text);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}
.dialog::backdrop {
  background: rgba(20, 25, 32, 0.4);
}
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}
p {
  margin: 0;
}
.presets {
  display: flex;
  gap: 4px;
}
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
.row .input {
  flex: 1;
  min-width: 0;
}
.hint {
  color: var(--faint);
  font-size: 11px;
}
.hint.local {
  color: var(--ok-text);
}
.result {
  display: flex;
  gap: 5px;
  padding: 5px 7px;
  overflow-wrap: anywhere;
}
.result svg {
  flex: none;
  margin-top: 2px;
}
.result.ok {
  background: var(--ok-bg);
  color: var(--ok-text);
}
.result.fail {
  background: var(--err-bg);
  color: var(--err-text);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
