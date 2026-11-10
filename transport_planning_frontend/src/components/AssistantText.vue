<script setup lang="ts">
import { computed } from 'vue'

/**
 * Простая разметка ответа модели: абзацы, списки, жирный и код.
 * Текст выводится как текст, без вставки HTML: ответ модели не должен выполняться в странице.
 */
const props = defineProps<{ text: string }>()

interface Span {
  text: string
  bold?: boolean
  code?: boolean
}

interface Block {
  list: boolean
  ordered: boolean
  heading: boolean
  items: Span[][]
}

function parseInline(line: string): Span[] {
  const spans: Span[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) spans.push({ text: line.slice(last, index) })
    const token = match[0]
    if (token.startsWith('**')) spans.push({ text: token.slice(2, -2), bold: true })
    else spans.push({ text: token.slice(1, -1), code: true })
    last = index + token.length
  }
  if (last < line.length) spans.push({ text: line.slice(last) })
  return spans
}

const blocks = computed<Block[]>(() => {
  const result: Block[] = []
  for (const raw of props.text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const content = bullet?.[1] ?? numbered?.[1] ?? heading?.[1] ?? line
    const list = Boolean(bullet || numbered)
    const last = result.at(-1)
    if (list && last?.list && last.ordered === Boolean(numbered)) last.items.push(parseInline(content))
    else result.push({ list, ordered: Boolean(numbered), heading: Boolean(heading), items: [parseInline(content)] })
  }
  return result
})
</script>

<template>
  <div class="text">
    <template v-for="(block, index) in blocks" :key="index">
      <component :is="block.ordered ? 'ol' : 'ul'" v-if="block.list">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <template v-for="(span, spanIndex) in item" :key="spanIndex">
            <strong v-if="span.bold">{{ span.text }}</strong>
            <code v-else-if="span.code">{{ span.text }}</code>
            <template v-else>{{ span.text }}</template>
          </template>
        </li>
      </component>
      <p v-else :class="{ heading: block.heading }">
        <template v-for="(span, spanIndex) in block.items[0]" :key="spanIndex">
          <strong v-if="span.bold">{{ span.text }}</strong>
          <code v-else-if="span.code">{{ span.text }}</code>
          <template v-else>{{ span.text }}</template>
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-wrap: anywhere;
}
p {
  margin: 0;
}
.heading {
  font-weight: 600;
}
ul,
ol {
  margin: 0;
  padding-left: 16px;
}
code {
  padding: 0 3px;
  background: var(--inset);
  font-size: 11px;
}
</style>
