import { Plus, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { collectKeyStats, countMatches, FILTER_OPS, QUICK_FILTERS } from '@/core/filter';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
let nextId = 1;
const keyStats = computed(() => {
    void editor.rev;
    return editor.doc ? collectKeyStats(editor.doc) : [];
});
const quick = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    if (!doc)
        return [];
    return QUICK_FILTERS.map((filter) => ({ ...filter, count: countMatches(doc, filter) })).filter((filter) => filter.count > 0);
});
function ruleId() {
    return Date.now() + nextId++;
}
function findQuickRule(filter) {
    return editor.filterRules.find((rule) => rule.key === filter.key && rule.op === filter.op && rule.value === filter.value);
}
function toggleQuick(filter) {
    const existing = findQuickRule(filter);
    if (existing) {
        existing.enabled = !existing.enabled;
        if (!existing.enabled)
            editor.filterRules = editor.filterRules.filter((rule) => rule !== existing);
        return;
    }
    editor.filterRules.push({ id: ruleId(), enabled: true, key: filter.key, op: filter.op, value: filter.value });
}
const draftKey = ref('');
const draftOp = ref('exists');
const draftValue = ref('');
const needsValue = computed(() => FILTER_OPS.find((op) => op.id === draftOp.value)?.needsValue ?? false);
const canAdd = computed(() => draftKey.value.trim() !== '' && (!needsValue.value || draftValue.value.trim() !== ''));
const valuesForDraft = computed(() => keyStats.value.find((stat) => stat.key === draftKey.value.trim())?.values ?? []);
const draftCount = computed(() => {
    const doc = editor.doc;
    if (!doc || !canAdd.value)
        return null;
    return countMatches(doc, { key: draftKey.value.trim(), op: draftOp.value, value: draftValue.value.trim() });
});
function addRule() {
    if (!canAdd.value)
        return;
    editor.filterRules.push({
        id: ruleId(),
        enabled: true,
        key: draftKey.value.trim(),
        op: draftOp.value,
        value: needsValue.value ? draftValue.value.trim() : '',
    });
    draftKey.value = '';
    draftValue.value = '';
    draftOp.value = 'exists';
}
function removeRule(id) {
    editor.filterRules = editor.filterRules.filter((rule) => rule.id !== id);
}
function needsValueFor(op) {
    return FILTER_OPS.find((item) => item.id === op)?.needsValue ?? false;
}
function ruleCount(rule) {
    void editor.rev;
    return editor.doc ? countMatches(editor.doc, rule) : 0;
}
const hiddenTotal = computed(() => editor.hidden.ways.size + editor.hidden.nodes.size);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(needsValue, {});
    __VLS_withDotValue(canAdd, {});
    __VLS_withDotValue(draftCount, {});
    __VLS_withDotValue(editor, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['rule']} */ ;
    /** @type {__VLS_StyleScopedClasses['rule']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(quick, {})));
    for (const [filter] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (filter.id),
            ...{ class: "check quick" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        /** @type {__VLS_StyleScopedClasses['quick']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    return (toggleQuick(filter));
                    // @ts-ignore
                    [quick,];
                } },
            checked: (findQuickRule(filter)?.enabled ?? false),
            type: "checkbox",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ellipsis" },
        });
        /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
        (filter.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "count faint" },
        });
        /** @type {__VLS_StyleScopedClasses['count']} */ ;
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        (filter.count);
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "filter-key",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "filter-key",
        ...{ class: "input" },
        list: "filter-keys",
        placeholder: "например, building",
    });
    (__VLS_unwrap(draftKey, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
        id: "filter-keys",
    });
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(keyStats, {})));
    for (const [stat] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (stat.key),
            value: (stat.key),
        });
        (stat.ways + stat.nodes);
        // @ts-ignore
        [draftKey, keyStats,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid-2" },
    });
    /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "filter-op",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        id: "filter-op",
        value: (__VLS_unwrap(draftOp, {})),
        ...{ class: "input" },
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(FILTER_OPS, {})));
    for (const [op] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (op.id),
            value: (op.id),
        });
        (op.label);
        // @ts-ignore
        [draftOp, FILTER_OPS,];
    }
    if (needsValue.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "filter-value",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "filter-value",
            ...{ class: "input" },
            list: "filter-values",
        });
        (__VLS_unwrap(draftValue, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
            id: "filter-values",
        });
        const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(valuesForDraft, {})));
        for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (item.value),
                value: (item.value),
            });
            (item.count);
            // @ts-ignore
            [needsValue, draftValue, valuesForDraft,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (addRule) },
        ...{ class: "btn block" },
        disabled: (!canAdd.value),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    let __VLS_4;
    /** @ts-ignore @type { | typeof Plus} */
    Plus;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent1(__VLS_4, new __VLS_4({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_6 = __VLS_5({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    (draftCount.value !== null ? `: ${draftCount.value} объектов` : '');
    if (editor.value.filterRules.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(editor.value.filterRules.length))
                        throw 0;
                    return (editor.value.filterRules = []);
                    // @ts-ignore
                    [canAdd, draftCount, draftCount, editor, editor,];
                } },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        const __VLS_9 = __VLS_tryAsConstant((editor.value.filterRules));
        for (const [rule] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (rule.id),
                ...{ class: "rule" },
            });
            /** @type {__VLS_StyleScopedClasses['rule']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "checkbox",
                'aria-label': (`Включить правило ${rule.key}`),
            });
            (rule.enabled);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ class: "input" },
                'aria-label': (`Атрибут правила`),
            });
            (rule.key);
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (rule.op),
                ...{ class: "input op" },
                'aria-label': "Условие",
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            /** @type {__VLS_StyleScopedClasses['op']} */ ;
            const __VLS_10 = __VLS_tryAsConstant((__VLS_unwrap(FILTER_OPS, {})));
            for (const [op] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (op.id),
                    value: (op.id),
                });
                (op.label);
                // @ts-ignore
                [FILTER_OPS, editor,];
            }
            if (needsValueFor(rule.op)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    ...{ class: "input" },
                    'aria-label': "Значение",
                });
                (rule.value);
                /** @type {__VLS_StyleScopedClasses['input']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "count faint" },
                title: (`Подходит объектов: ${ruleCount(rule)}`),
            });
            /** @type {__VLS_StyleScopedClasses['count']} */ ;
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (ruleCount(rule));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(editor.value.filterRules.length))
                            throw 0;
                        return (removeRule(rule.id));
                        // @ts-ignore
                        [];
                    } },
                ...{ class: "btn ghost small remove" },
                'aria-label': (`Удалить правило ${rule.key}`),
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            /** @type {__VLS_StyleScopedClasses['remove']} */ ;
            let __VLS_11;
            /** @ts-ignore @type { | typeof X} */
            X;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                // @ts-ignore
                size: (12),
            }));
            const __VLS_13 = __VLS_12({
                size: (12),
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted info" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['info']} */ ;
        (__VLS_unwrap(hiddenTotal, {}));
    }
    // @ts-ignore
    [hiddenTotal,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
