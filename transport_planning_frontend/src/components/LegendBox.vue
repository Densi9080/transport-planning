<script setup lang="ts">
import { computed } from 'vue'

import { APPROACH_COLORS, LOS_COLORS } from '@/map/style'
import { LOS_LABELS, LOS_TITLES } from '@/sim/macro'
import { LOS_SPEED_THRESHOLDS } from '@/sim/micro'
import { DRIVER_STYLES, STYLE_LABELS } from '@/sim/micro'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()

const isSim = computed(() => editor.viewMode === 'sim')

const VC_HINT = ['< 35%', '35–55%', '55–75%', '75–90%', '90–100%', '> 100%']

const rows = computed(() =>
  LOS_LABELS.map((label, index) => {
    const low = LOS_SPEED_THRESHOLDS[index]
    const hint = sim.level === 'macro' ? VC_HINT[index] : low !== undefined ? `≥ ${Math.round(low * 100)}%` : `< ${Math.round(LOS_SPEED_THRESHOLDS.at(-1)! * 100)}%`
    return { label, title: LOS_TITLES[index], color: LOS_COLORS[index]!, hint }
  }),
)

const STYLE_COLORS = { calm: '#4aa3c7', normal: '#9ea3ad', aggressive: '#db332e' }
</script>

<template>
  <div v-if="isSim" class="legend" aria-label="Легенда">
    <div class="eyebrow">{{ sim.level === 'macro' ? 'Загрузка: поток / пропускная способность' : 'Скорость от разрешённой' }}</div>
    <div v-for="row in rows" :key="row.label" class="row">
      <i :style="{ background: row.color }" />
      <b>{{ row.label }}</b>
      <span>{{ row.title }}</span>
      <span class="faint hint">{{ row.hint }}</span>
    </div>
    <template v-if="sim.level === 'macro' && sim.macroView === 'bars'">
      <div class="faint note">Ширина столбика показывает объём потока, авт/ч</div>
    </template>
    <template v-if="sim.level === 'micro' && sim.colorMode === 'style'">
      <div class="eyebrow gap">Стиль вождения</div>
      <div v-for="style in DRIVER_STYLES" :key="style" class="row short">
        <i :style="{ background: STYLE_COLORS[style] }" />
        <span>{{ STYLE_LABELS[style] }}</span>
      </div>
    </template>
  </div>
  <div v-else-if="editor.viewMode === 'engineering' && editor.layers.turnPaths" class="legend compact" aria-label="Легенда">
    <span class="short"><i :style="{ background: APPROACH_COLORS[0] }" /> С севера</span>
    <span class="short"><i :style="{ background: APPROACH_COLORS[1] }" /> С востока</span>
    <span class="short"><i :style="{ background: APPROACH_COLORS[2] }" /> С юга</span>
    <span class="short"><i :style="{ background: APPROACH_COLORS[3] }" /> С запада</span>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  right: 8px;
  bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 7px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  font-size: 11px;
  z-index: 5;
}
.legend.compact {
  flex-direction: row;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 18px 12px 76px auto;
  align-items: center;
  gap: 4px;
}
.row.short {
  grid-template-columns: 18px auto;
}
.short {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
i {
  display: block;
  width: 18px;
  height: 7px;
  flex: none;
}
.hint {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.note {
  margin-top: 3px;
}
.gap {
  margin-top: 5px;
}
</style>
