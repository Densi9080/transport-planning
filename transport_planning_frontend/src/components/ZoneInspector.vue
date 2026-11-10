<script setup lang="ts">
import { Calculator, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import type { OWay } from '@/core/types'
import { JOBS_TAG, M2_PER_JOB, M2_PER_RESIDENT, polygonArea, RESIDENTS_TAG, zonePolygon } from '@/core/zones'
import { estimateZonePopulation } from '@/sim/macro'
import { useEditor } from '@/stores/editor'

/**
 * Транспортный район: жители и рабочие места. От них макромодель считает, сколько поездок
 * район даёт и принимает в час пик, а микромодель выпускает машины по этим корреспонденциям.
 */
const props = defineProps<{ way: OWay }>()
const editor = useEditor()

const tags = computed(() => props.way.tags ?? {})
const polygon = computed(() => {
  void editor.rev
  return editor.doc && editor.projector ? zonePolygon(editor.doc, editor.projector, props.way) : []
})
const hectares = computed(() => polygonArea(polygon.value) / 10_000)
const residents = computed(() => Number(tags.value[RESIDENTS_TAG] ?? 0) || 0)
const jobs = computed(() => Number(tags.value[JOBS_TAG] ?? 0) || 0)

/** Поездок на машине в час пик: те же нормы, что у районов из застройки в макромодели. */
const RESIDENT_TRIPS = M2_PER_RESIDENT * 0.0035
const JOB_TRIPS = M2_PER_JOB * 0.005
const morning = computed(() => ({
  out: Math.round(residents.value * RESIDENT_TRIPS + jobs.value * JOB_TRIPS * 0.1),
  in: Math.round(residents.value * RESIDENT_TRIPS * 0.15 + jobs.value * JOB_TRIPS),
}))

function set(key: string, value: string, label: string): void {
  const next = { ...tags.value }
  const clean = value.trim()
  if (clean) next[key] = key === 'name' ? clean : String(Math.max(0, Math.round(Number(clean) || 0)))
  else delete next[key]
  editor.updateWayTags(props.way.id, next, label)
}

function estimate(): void {
  if (!editor.doc || !editor.projector) return
  const result = estimateZonePopulation(editor.doc, editor.projector, polygon.value)
  editor.updateWayTags(props.way.id, { ...tags.value, [RESIDENTS_TAG]: String(result.residents), [JOBS_TAG]: String(result.jobs) }, 'Оценка района по застройке')
  editor.toast(`По застройке: ${result.residents} жителей, ${result.jobs} рабочих мест`, 'success')
}

function remove(): void {
  editor.requestDelete([{ kind: 'way', id: props.way.id }], tags.value.name ?? `Район ${props.way.id}`)
}
</script>

<template>
  <div class="section">
    <h2>{{ tags.name ?? `Район ${way.id}` }}</h2>
    <p class="muted">Транспортный район, {{ hectares.toFixed(1) }} га. Спрос района считается от жителей и рабочих мест.</p>
    <label class="field">
      <span>Название</span>
      <input class="input" :value="tags.name ?? ''" @change="set('name', ($event.target as HTMLInputElement).value, 'Название района')" />
    </label>
    <label class="field">
      <span>Жители</span>
      <input class="input" type="number" min="0" step="100" :value="residents" @change="set(RESIDENTS_TAG, ($event.target as HTMLInputElement).value, 'Жители района')" />
    </label>
    <label class="field">
      <span>Рабочие места</span>
      <input class="input" type="number" min="0" step="100" :value="jobs" @change="set(JOBS_TAG, ($event.target as HTMLInputElement).value, 'Рабочие места района')" />
    </label>
    <button class="btn block" @click="estimate"><Calculator :size="13" aria-hidden="true" /> Оценить по застройке</button>
    <p class="muted note">
      Утренний час пик: из района ≈ {{ morning.out }} поездок на машине, в район ≈ {{ morning.in }}. Застройка внутри контура в расчёте
      больше не считается отдельно: её заменяют эти числа.
    </p>
    <button class="btn block danger" @click="remove"><Trash2 :size="13" aria-hidden="true" /> Удалить район</button>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}
.note {
  font-size: 11px;
}
</style>
