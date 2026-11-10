<script setup lang="ts">
import { Download, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { buildJourneys, formatClock, formatClockSeconds, hourGrid, type Journey, timetableCsv } from '@/core/timetable'
import type { ProfilePoint } from '@/core/transitCalc'

const props = defineProps<{ title: string; profile: ProfilePoint[]; departures: number[] }>()
const emit = defineEmits<{ close: [] }>()

const view = ref<'journeys' | 'stop'>('journeys')
const stopIndex = ref(0)
const backdrop = ref<HTMLElement | null>(null)
onMounted(() => backdrop.value?.focus())

const journeys = computed<Journey[]>(() => buildJourneys(props.departures, props.profile))
const grid = computed(() => hourGrid(journeys.value, stopIndex.value))

function download(): void {
  const csv = timetableCsv(props.profile.map((p) => p.name), journeys.value)
  // BOM нужен, чтобы Excel открыл кириллицу без перекодировки
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'расписание'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <Teleport to="body">
    <div ref="backdrop" class="backdrop" role="dialog" aria-modal="true" aria-labelledby="tt-title" tabindex="-1" @keydown.esc="emit('close')" @click.self="emit('close')">
      <div class="box">
        <header>
          <h2 id="tt-title">Расписание: {{ title }}</h2>
          <button class="icon" aria-label="Закрыть" @click="emit('close')"><X :size="15" /></button>
        </header>
        <div class="bar">
          <div class="tabs" role="tablist">
            <button role="tab" :class="{ active: view === 'journeys' }" :aria-selected="view === 'journeys'" @click="view = 'journeys'">Рейсы</button>
            <button role="tab" :class="{ active: view === 'stop' }" :aria-selected="view === 'stop'" @click="view = 'stop'">По остановке</button>
          </div>
          <span class="muted">{{ journeys.length }} рейсов, {{ formatClock(departures[0] ?? 0) }}–{{ formatClock(departures.at(-1) ?? 0) }}</span>
          <span class="spacer" />
          <button class="btn small" :disabled="journeys.length === 0" @click="download"><Download :size="12" aria-hidden="true" /> CSV</button>
        </div>

        <div v-if="journeys.length === 0" class="empty">Нет рейсов: проверьте время работы и интервал.</div>

        <div v-else-if="view === 'journeys'" class="scroll">
          <table class="grid">
            <thead>
              <tr>
                <th class="stick">Пункт</th>
                <th v-for="journey in journeys" :key="journey.number">{{ journey.number }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(point, index) in profile" :key="`${point.node}-${index}`">
                <th class="stick name">{{ point.name }}</th>
                <td v-for="journey in journeys" :key="journey.number">{{ formatClockSeconds(journey.times[index]!.departS) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="stop-view">
          <select v-model.number="stopIndex" class="input" aria-label="Остановка">
            <option v-for="(point, index) in profile" :key="`${point.node}-${index}`" :value="index">{{ index + 1 }}. {{ point.name }}</option>
          </select>
          <div class="scroll">
            <table class="hours">
              <tbody>
                <tr v-for="row in grid" :key="row.hour">
                  <th>{{ String(row.hour).padStart(2, '0') }}</th>
                  <td>{{ row.minutes.map((m) => String(m).padStart(2, '0')).join('  ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="note muted">Время отправления с пункта. Время хода и стоянок берётся из профиля времени маршрута.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
  outline: none;
}
.box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(960px, 100%);
  height: min(640px, calc(100vh - 32px));
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
header,
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
header {
  justify-content: space-between;
}
h2 {
  margin: 0;
  font-size: 15px;
}
.icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}
.spacer {
  flex: 1;
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--line-strong);
}
.tabs button {
  padding: 4px 12px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--text);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--line-strong);
}
.grid,
.hours {
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.grid th,
.grid td,
.hours th,
.hours td {
  padding: 2px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
  text-align: left;
}
.grid thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--raised);
  color: var(--muted);
  font-weight: 500;
}
.grid .stick {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--raised);
}
.grid .name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.stop-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stop-view select {
  max-width: 360px;
}
.hours th {
  width: 32px;
  color: var(--muted);
  font-weight: 600;
}
.hours td {
  white-space: pre;
}
.empty {
  flex: 1;
  color: var(--faint);
}
.note {
  margin: 0;
  font-size: 12px;
}
</style>
