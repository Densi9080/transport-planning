<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { bearing } from '@/core/geo'
import { armHasNode, junctionPriority, mainByClass, type PrioritySign, SIGN_TITLES } from '@/core/priority'
import { type Arm, turnKind } from '@/core/topology'
import { useEditor } from '@/stores/editor'

/** Приоритет перекрёстка по ПДД: главная дорога двумя подходами, знаки 2.4 и 2.5 на второстепенных. */
const props = defineProps<{ node: number }>()
const editor = useEditor()
const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
const BEND: Record<string, string> = { through: 'идёт прямо', left: 'поворачивает налево', right: 'поворачивает направо' }

const arms = computed<Arm[]>(() => editor.network?.arms.get(props.node) ?? [])
const priority = computed(() => {
  void editor.rev
  return editor.doc && editor.network ? junctionPriority(editor.doc, editor.network, props.node) : null
})

function armName(arm: Arm): string {
  const name = editor.doc?.ways.get(arm.link.wayId)?.tags?.name
  const side = COMPASS[Math.round(bearing(arm.dir) / 45) % 8]
  return name ? `${name} (${side})` : `сторона ${side}`
}

const mode = ref<'equal' | 'main'>('equal')
const mainA = ref<number | null>(null)
const mainB = ref<number | null>(null)
const signs = ref<Record<number, PrioritySign>>({})

/** Форма заполняется текущим состоянием узла, а для нового — главной по классу дорог. */
function reset(): void {
  const current = priority.value
  const main = current?.arms.filter((item) => item.role === 'main').map((item) => item.arm.neighbor) ?? []
  if (current?.kind === 'main' && main.length === 2) {
    mode.value = 'main'
    ;[mainA.value, mainB.value] = main as [number, number]
  } else {
    mode.value = current?.kind === 'main' ? 'main' : 'equal'
    const guess = editor.doc ? mainByClass(editor.doc, arms.value) : null
    mainA.value = guess?.[0] ?? arms.value[0]?.neighbor ?? null
    mainB.value = guess?.[1] ?? arms.value[1]?.neighbor ?? null
  }
  signs.value = Object.fromEntries((current?.arms ?? []).filter((item) => item.sign).map((item) => [item.arm.neighbor, item.sign!]))
}
watch(() => props.node, reset, { immediate: true })

const armA = computed(() => arms.value.find((arm) => arm.neighbor === mainA.value) ?? null)
const armB = computed(() => arms.value.find((arm) => arm.neighbor === mainB.value) ?? null)
const bend = computed(() => {
  if (!armA.value || !armB.value || armA.value === armB.value) return null
  const kind = turnKind(armA.value, armB.value, arms.value)
  return kind === 'reverse' ? null : kind
})
const minorArms = computed(() =>
  mode.value === 'main' ? arms.value.filter((arm) => arm !== armA.value && arm !== armB.value && arm.lanesIn > 0) : [],
)
const valid = computed(() => mode.value === 'equal' || (armA.value && armB.value && armA.value !== armB.value))

function apply(): void {
  if (!valid.value) return
  const main = mode.value === 'main' ? ([mainA.value!, mainB.value!] as [number, number]) : null
  editor.setJunctionPriority(props.node, main, signs.value)
}

function roleOf(arm: Arm): string {
  const item = priority.value?.arms.find((entry) => entry.arm === arm || (entry.arm.link.wayId === arm.link.wayId && armHasNode(entry.arm, arm.neighbor)))
  if (!item) return ''
  if (item.role === 'main') return item.sign ? `главная, но стоит ${SIGN_TITLES[item.sign]}` : 'главная'
  return item.sign ? SIGN_TITLES[item.sign] : 'без знака'
}

const KIND_TEXT: Record<string, string> = {
  signals: 'Регулируемый: светофор',
  roundabout: 'Круговое движение',
  main: 'Неравнозначный: главная и второстепенные',
  equal: 'Равнозначный: правило правой руки (п. 13.11 ПДД)',
}
</script>

<template>
  <div v-if="priority" class="section">
    <div class="eyebrow">Приоритет по ПДД</div>
    <p class="state">{{ KIND_TEXT[priority.kind] }}{{ priority.kind === 'main' && !priority.explicit ? ', главная определена по знакам' : '' }}</p>
    <ul v-if="priority.issues.length" class="issues">
      <li v-for="(issue, index) in priority.issues" :key="index" :class="issue.severity">{{ issue.text }}</li>
    </ul>

    <template v-if="priority.kind === 'main' || priority.kind === 'equal'">
      <div class="modes" role="radiogroup" aria-label="Вид перекрёстка">
        <label class="check"><input v-model="mode" type="radio" value="equal" /> Равнозначный</label>
        <label class="check"><input v-model="mode" type="radio" value="main" /> Есть главная дорога</label>
      </div>

      <template v-if="mode === 'main'">
        <div class="grid-2">
          <div class="field">
            <label for="main-a">Главная: подход 1</label>
            <select id="main-a" v-model.number="mainA" class="input">
              <option v-for="arm in arms" :key="arm.neighbor" :value="arm.neighbor">{{ armName(arm) }}</option>
            </select>
          </div>
          <div class="field">
            <label for="main-b">Главная: подход 2</label>
            <select id="main-b" v-model.number="mainB" class="input">
              <option v-for="arm in arms" :key="arm.neighbor" :value="arm.neighbor">{{ armName(arm) }}</option>
            </select>
          </div>
        </div>
        <p v-if="armA && armA === armB" class="error">Главная дорога состоит из двух разных подходов</p>
        <p v-else-if="bend && armA" class="muted">
          Из «{{ armName(armA) }}» главная {{ BEND[bend] }}.
          <template v-if="bend !== 'through'">На главных подходах нужен знак 2.1 с табличкой 8.13 «Направление главной дороги».</template>
        </p>

        <div v-for="arm in minorArms" :key="arm.neighbor" class="minor">
          <span class="ellipsis">{{ armName(arm) }}</span>
          <select v-model="signs[arm.neighbor]" class="input" :aria-label="`Знак на подходе ${armName(arm)}`">
            <option :value="undefined">2.4 «Уступи дорогу»</option>
            <option value="stop">2.5 «Стоп»</option>
          </select>
        </div>
      </template>
      <p v-else class="muted note">Знаки приоритета на подходах будут сняты. Проезд по правилу правой руки, трамвай имеет преимущество (п. 13.11 ПДД).</p>

      <button class="btn primary block" :disabled="!valid" @click="apply"><Check :size="13" aria-hidden="true" /> Применить</button>
    </template>

    <details class="now">
      <summary>Подходы сейчас</summary>
      <div v-for="arm in arms" :key="arm.neighbor" class="row-now">
        <span class="ellipsis">{{ armName(arm) }}</span>
        <span class="faint">{{ roleOf(arm) }}</span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.state {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.issues {
  margin: 0;
  padding-left: 16px;
  font-size: 11.5px;
}
.issues .error,
.error {
  color: var(--err-text);
}
.issues .warning {
  color: var(--warn, #f59e0b);
}
.issues .info {
  color: var(--muted);
}
.modes {
  display: flex;
  gap: 12px;
}
.minor {
  display: grid;
  grid-template-columns: 1fr 150px;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.note {
  font-size: 11px;
}
.now {
  font-size: 11.5px;
}
.row-now {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
</style>
