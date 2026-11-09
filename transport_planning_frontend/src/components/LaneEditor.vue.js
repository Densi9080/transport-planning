import { ArrowLeft, ArrowRight, ArrowUp, Undo2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { dividerMode, parseProfile, toggleTurn, turnAllows, withDivider, withTurns, } from '@/core/lanes';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const profile = computed(() => parseProfile(props.tags));
const buttons = [
    { turn: 'reverse', check: 'reverse', icon: Undo2, label: 'Разворот' },
    { turn: 'left', check: 'left', icon: ArrowLeft, label: 'Налево' },
    { turn: 'through', check: 'through', icon: ArrowUp, label: 'Прямо' },
    { turn: 'right', check: 'right', icon: ArrowRight, label: 'Направо' },
];
const DIVIDER_ORDER = ['both', 'none', 'to_right', 'to_left'];
const DIVIDER_TITLES = {
    both: 'Пунктир: перестроение в обе стороны',
    none: 'Сплошная: перестраиваться нельзя',
    to_right: 'Двойная: только с левой полосы на правую',
    to_left: 'Двойная: только с правой полосы на левую',
};
function dividerOf(direction, boundary) {
    const rules = direction === 'forward' ? profile.value.changeForward : profile.value.changeBackward;
    return dividerMode(rules, boundary);
}
function cycleDivider(direction, boundary) {
    const current = DIVIDER_ORDER.indexOf(dividerOf(direction, boundary));
    const next = DIVIDER_ORDER[(current + 1) % DIVIDER_ORDER.length];
    emit('change', withDivider(props.tags, direction, boundary, next));
}
const directions = computed(() => {
    const result = [];
    const fill = (count, turns) => Array.from({ length: count }, (_, index) => turns?.[index] ?? '');
    if (profile.value.forward > 0) {
        result.push({
            id: 'forward',
            title: profile.value.oneway ? 'По направлению движения' : 'По ходу дороги',
            lanes: fill(profile.value.forward, profile.value.turnsForward),
        });
    }
    if (profile.value.backward > 0) {
        result.push({
            id: 'backward',
            title: profile.value.oneway ? 'По направлению движения' : 'Встречное направление',
            lanes: fill(profile.value.backward, profile.value.turnsBackward),
        });
    }
    return result;
});
function toggle(direction, lanes, index, turn) {
    const next = [...lanes];
    next[index] = toggleTurn(next[index] ?? '', turn);
    emit('change', withTurns(props.tags, direction, next));
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(DIVIDER_TITLES, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['to_right']} */ ;
    /** @type {__VLS_StyleScopedClasses['divider']} */ ;
    /** @type {__VLS_StyleScopedClasses['to_left']} */ ;
    /** @type {__VLS_StyleScopedClasses['turn']} */ ;
    /** @type {__VLS_StyleScopedClasses['turn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lanes" },
    });
    /** @type {__VLS_StyleScopedClasses['lanes']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(directions, {})));
    for (const [direction] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (direction.id),
            ...{ class: "direction" },
        });
        /** @type {__VLS_StyleScopedClasses['direction']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (direction.title);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "strip" },
            role: "group",
            'aria-label': (direction.title),
        });
        /** @type {__VLS_StyleScopedClasses['strip']} */ ;
        const __VLS_1 = __VLS_tryAsConstant((direction.lanes));
        for (const [lane, index] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (index),
            });
            if (index > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(index > 0))
                                throw 0;
                            return (cycleDivider(direction.id, index - 1));
                            // @ts-ignore
                            [directions,];
                        } },
                    ...{ class: "divider" },
                    ...{ class: (dividerOf(direction.id, index - 1)) },
                    title: (`${DIVIDER_TITLES.value[dividerOf(direction.id, index - 1)]}. Нажмите, чтобы сменить`),
                    'aria-label': (`Линия между полосами ${index} и ${index + 1}: ${DIVIDER_TITLES.value[dividerOf(direction.id, index - 1)]}`),
                });
                /** @type {__VLS_StyleScopedClasses['divider']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({});
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "lane" },
            });
            /** @type {__VLS_StyleScopedClasses['lane']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "lane-number" },
            });
            /** @type {__VLS_StyleScopedClasses['lane-number']} */ ;
            (index + 1);
            const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(buttons, {})));
            for (const [button] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            return (toggle(direction.id, direction.lanes, index, button.turn));
                            // @ts-ignore
                            [DIVIDER_TITLES, DIVIDER_TITLES, buttons,];
                        } },
                    key: (button.turn),
                    ...{ class: "turn" },
                    ...{ class: ({ on: __VLS_unwrap(turnAllows, {})(lane, button.check) }) },
                    'aria-pressed': (__VLS_unwrap(turnAllows, {})(lane, button.check)),
                    'aria-label': (`Полоса ${index + 1}: ${button.label}`),
                    title: (button.label),
                });
                /** @type {__VLS_StyleScopedClasses['turn']} */ ;
                /** @type {__VLS_StyleScopedClasses['on']} */ ;
                const __VLS_3 = (button.icon);
                // @ts-ignore
                const __VLS_4 = __VLS_asFunctionalComponent1(__VLS_3, new __VLS_3({
                    // @ts-ignore
                    size: (14),
                }));
                const __VLS_5 = __VLS_4({
                    size: (14),
                }, ...__VLS_functionalComponentArgsRest(__VLS_4));
                // @ts-ignore
                [turnAllows, turnAllows,];
            }
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "faint note" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
