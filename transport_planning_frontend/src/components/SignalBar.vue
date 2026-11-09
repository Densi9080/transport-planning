<script setup lang="ts">
import { computed } from 'vue'

import type { SignalSegment } from '@/core/signals'
import { formatSeconds, SIGNAL_LABELS } from '@/sim/signalView'

const props = withDefaults(
  defineProps<{
    segments: SignalSegment[]
    cycle: number
    /** Текущий момент цикла, пока идёт симуляция. */
    marker?: number | null
    labels?: boolean
  }>(),
  { marker: null, labels: true },
)

/** Подпись на отрезке, в который она не помещается, только мешала бы. */
const MIN_LABEL_SHARE = 0.06

const description = computed(() => {
  const totals = new Map<string, number>()
  for (const segment of props.segments) totals.set(segment.color, (totals.get(segment.color) ?? 0) + segment.length)
  return [...totals.entries()].map(([color, seconds]) => `${SIGNAL_LABELS[color as SignalSegment['color']]} ${formatSeconds(seconds)} с`).join(', ')
})
</script>

<template>
  <div class="bar" :class="{ thin: !labels }" role="img" :aria-label="description" :title="description">
    <span
      v-for="segment in segments"
      :key="segment.start"
      class="segment"
      :class="segment.color"
      :style="{ left: `${(segment.start / cycle) * 100}%`, width: `${(segment.length / cycle) * 100}%` }"
    >
      <template v-if="labels && segment.length / cycle >= MIN_LABEL_SHARE">{{ formatSeconds(segment.length) }}</template>
    </span>
    <span v-if="marker !== null" class="marker" :style="{ left: `${(marker / cycle) * 100}%` }" />
  </div>
</template>

<style scoped>
.bar {
  position: relative;
  width: 100%;
  height: 16px;
  overflow: hidden;
  background: var(--inset);
}
.bar.thin {
  height: 7px;
}
.segment {
  position: absolute;
  top: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}
.green {
  background: #15803d;
  color: #fff;
}
.yellow {
  background: #eab308;
  color: #1c1917;
}
.red {
  background: #c62f2f;
  color: #fff;
}
.marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #fff;
  box-shadow: 0 0 0 1px #111;
}
</style>
