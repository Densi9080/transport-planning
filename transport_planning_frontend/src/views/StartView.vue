<script setup lang="ts">
import { FileUp, History, Map as MapIcon, Route } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { createSampleProject, listProjects, type ProjectSummary, uploadProject } from '@/api'

const router = useRouter()
const recent = ref<ProjectSummary[]>([])
const error = ref<string | null>(null)
const busy = ref(false)
const dragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  try {
    recent.value = await listProjects()
  } catch {
    error.value = 'Сервер недоступен. Запустите бэкенд: python manage.py runserver'
  }
})

async function run(action: () => Promise<ProjectSummary>): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const project = await action()
    await router.push({ name: 'editor', params: { id: project.id } })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

function openFile(file: File | undefined): void {
  if (file) void run(() => uploadProject(file))
}

function onDrop(event: DragEvent): void {
  dragOver.value = false
  openFile(event.dataTransfer?.files[0])
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <main class="start">
    <div class="start-card">
      <header>
        <Route :size="26" class="logo" aria-hidden="true" />
        <div>
          <h1>Редактор УДС</h1>
          <p class="muted">Откройте .osm, поправьте сеть и сохраните файл для MatSim, SUMO и Webots</p>
        </div>
      </header>

      <button
        class="drop"
        :class="{ over: dragOver }"
        :disabled="busy"
        @click="input?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <FileUp :size="28" aria-hidden="true" />
        <strong>{{ busy ? 'Открываем файл…' : 'Выберите .osm или перетащите его сюда' }}</strong>
        <span class="faint">Файл не меняется: правки хранятся отдельно до экспорта</span>
      </button>
      <input
        ref="input"
        type="file"
        accept=".osm,.xml"
        hidden
        @change="openFile(($event.target as HTMLInputElement).files?.[0])"
      />

      <button class="btn block" :disabled="busy" @click="run(createSampleProject)">
        <MapIcon :size="15" aria-hidden="true" />
        Открыть пример: Иркутск, Госуниверситет – Жуковского
      </button>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section v-if="recent.length" class="recent">
        <div class="eyebrow row"><History :size="12" aria-hidden="true" /> Недавние проекты</div>
        <RouterLink
          v-for="project in recent.slice(0, 6)"
          :key="project.id"
          :to="{ name: 'editor', params: { id: project.id } }"
          class="recent-item"
        >
          <span>{{ project.name }}</span>
          <span class="faint">{{ formatDate(project.updatedAt) }}</span>
        </RouterLink>
      </section>
    </div>
  </main>
</template>

<style scoped>
.start {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: var(--bg);
}
.start-card {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
}
header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.logo {
  color: var(--accent);
  flex: none;
  margin-top: 2px;
}
h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
header p {
  margin: 2px 0 0;
}
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  background: var(--raised);
  border: 1.5px dashed var(--line-strong);
  color: var(--muted);
}
.drop strong {
  color: var(--text);
  font-weight: 500;
}
.drop:hover:not(:disabled),
.drop.over {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.error {
  margin: 0;
  padding: 8px 10px;
  background: var(--err-bg);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: var(--radius-sm);
  color: var(--err-text);
}
.recent {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
}
.recent .eyebrow {
  gap: 5px;
  margin-bottom: 2px;
}
.recent-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
}
.recent-item:hover {
  background: var(--raised);
}
</style>
