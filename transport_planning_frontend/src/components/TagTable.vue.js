import { Plus, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { COMMON_KEYS } from '@/core/presets';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const newKey = ref('');
const newValue = ref('');
const rows = computed(() => Object.entries(props.tags).sort(([a], [b]) => a.localeCompare(b)));
const listId = `tag-keys-${Math.random().toString(36).slice(2)}`;
function setValue(key, value) {
    if (props.tags[key] === value)
        return;
    emit('change', { ...props.tags, [key]: value });
}
function renameKey(key, nextKey) {
    const trimmed = nextKey.trim();
    if (!trimmed || trimmed === key)
        return;
    const next = { ...props.tags };
    const value = next[key] ?? '';
    delete next[key];
    next[trimmed] = value;
    emit('change', next);
}
function remove(key) {
    const next = { ...props.tags };
    delete next[key];
    emit('change', next);
}
function add() {
    const key = newKey.value.trim();
    if (!key)
        return;
    emit('change', { ...props.tags, [key]: newValue.value.trim() });
    newKey.value = '';
    newValue.value = '';
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
    __VLS_withDotValue(newKey, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['tag-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tags" },
    });
    /** @type {__VLS_StyleScopedClasses['tags']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
    for (const [[key, value]] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (key),
            ...{ class: "tag-row" },
        });
        /** @type {__VLS_StyleScopedClasses['tag-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    return (renameKey(key, $event.target.value));
                    // @ts-ignore
                    [rows,];
                } },
            ...{ class: "input" },
            value: (key),
            'aria-label': (`Ключ ${key}`),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    return (setValue(key, $event.target.value));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "input" },
            value: (value),
            'aria-label': (`Значение ${key}`),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (remove(key));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "btn ghost small remove" },
            'aria-label': (`Удалить тег ${key}`),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['remove']} */ ;
        let __VLS_1;
        /** @ts-ignore @type { | typeof X} */
        X;
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_3 = __VLS_2({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (add) },
        ...{ class: "tag-row" },
    });
    /** @type {__VLS_StyleScopedClasses['tag-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input" },
        placeholder: "новый ключ",
        'aria-label': "Новый ключ",
        list: (__VLS_unwrap(listId, {})),
    });
    (newKey.value);
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input" },
        placeholder: "значение",
        'aria-label': "Новое значение",
    });
    (__VLS_unwrap(newValue, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ class: "btn small remove" },
        type: "submit",
        'aria-label': "Добавить тег",
        disabled: (!newKey.value.trim()),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    /** @type {__VLS_StyleScopedClasses['remove']} */ ;
    let __VLS_6;
    /** @ts-ignore @type { | typeof Plus} */
    Plus;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        size: (13),
    }));
    const __VLS_8 = __VLS_7({
        size: (13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
        id: (__VLS_unwrap(listId, {})),
    });
    const __VLS_11 = __VLS_tryAsConstant((__VLS_unwrap(COMMON_KEYS, {})));
    for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option)({
            key: (key),
            value: (key),
        });
        // @ts-ignore
        [listId, listId, newKey, newKey, newValue, COMMON_KEYS,];
    }
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
