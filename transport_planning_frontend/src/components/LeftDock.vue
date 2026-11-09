<script setup lang="ts">
import { computed } from 'vue'

import { type LeftTab, useEditor } from '@/stores/editor'

import FilterPanel from './FilterPanel.vue'
import GraphicsPanel from './GraphicsPanel.vue'
import NetworkPanel from './NetworkPanel.vue'

const editor = useEditor()

const activeFilters = computed(() => editor.filterRules.filter((rule) => rule.enabled).length)

const tabs = computed<{ id: LeftTab; label: string; badge?: number }[]>(() => [
  { id: 'network', label: 'Сеть' },
  { id: 'graphics', label: 'Графика' },
  { id: 'filter', label: 'Фильтр', badge: activeFilters.value || undefined },
])
</script>

<template>
  <aside class="dock" aria-label="Окно сети">
    <div class="dock-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        :class="{ active: editor.leftTab === tab.id }"
        :aria-selected="editor.leftTab === tab.id"
        @click="editor.leftTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.badge" class="badge">{{ tab.badge }}</span>
      </button>
    </div>
    <div class="body">
      <GraphicsPanel v-if="editor.leftTab === 'graphics'" />
      <FilterPanel v-else-if="editor.leftTab === 'filter'" />
      <NetworkPanel v-else />
    </div>
  </aside>
</template>

<style scoped>
.dock {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 310px;
  min-height: 0;
  background: var(--panel);
  border-right: 1px solid var(--line-strong);
}
.body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.badge {
  min-width: 14px;
  padding: 0 3px;
  background: var(--accent);
  border-radius: 7px;
  color: var(--on-accent);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}
</style>
