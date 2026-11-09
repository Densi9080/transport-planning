import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { runTraffic, type TrafficResult } from '@/api'

import { useEditor } from './editor'

/** Расчёт загрузки настоящим SUMO. Симуляция в браузере живёт отдельно. */
export const useTraffic = defineStore('traffic', () => {
  const trips = ref(1000)
  const running = ref(false)
  const visible = ref(true)
  const result = shallowRef<TrafficResult | null>(null)

  async function run(count = trips.value): Promise<void> {
    const editor = useEditor()
    if (!editor.projectId || !editor.doc || running.value) return
    running.value = true
    editor.consoleOpen = true
    editor.logConsole('info', 'SUMO', `Запуск расчёта: поездок ${count} за час`)
    try {
      const data = await runTraffic(editor.projectId, editor.doc.changes(), count, 3600)
      if (!data.available) {
        editor.logConsole('error', 'SUMO', data.message ?? 'SUMO недоступен')
        editor.toast(data.message ?? 'SUMO недоступен', 'error')
        return
      }
      result.value = data
      visible.value = true
      for (const line of data.log ?? []) editor.logConsole('info', 'SUMO', line)
      const stats = data.stats
      if (stats) {
        const level = stats.teleports > 0 ? 'warning' : 'info'
        editor.logConsole(level, 'SUMO', `Загружено ${stats.loaded}, выехало ${stats.inserted}, телепортов ${stats.teleports}, средняя скорость ${stats.meanSpeed ?? '—'} км/ч`)
      }
      editor.toast(`Расчёт завершён: полос с движением ${data.lanes?.length ?? 0}`, 'success')
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      editor.logConsole('error', 'SUMO', text)
      editor.toast(text, 'error')
    } finally {
      running.value = false
    }
  }

  function clear(): void {
    result.value = null
  }

  return { trips, running, visible, result, run, clear }
})
