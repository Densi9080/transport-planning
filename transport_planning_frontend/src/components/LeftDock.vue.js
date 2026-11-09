import { computed } from 'vue';
import { useEditor } from '@/stores/editor';
import FilterPanel from './FilterPanel.vue';
import GraphicsPanel from './GraphicsPanel.vue';
import IssuesPanel from './IssuesPanel.vue';
import NetworkPanel from './NetworkPanel.vue';
import TransitPanel from './TransitPanel.vue';
const editor = useEditor();
const activeFilters = computed(() => editor.filterRules.filter((rule) => rule.enabled).length);
const tabs = computed(() => [
    { id: 'network', label: 'Сеть' },
    { id: 'graphics', label: 'Графика' },
    { id: 'filter', label: 'Фильтр', badge: activeFilters.value || undefined },
    { id: 'transit', label: 'Линии ОТ' },
    { id: 'issues', label: 'Проверка', badge: editor.errorCount || undefined },
]);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
        ...{ class: "dock" },
        'aria-label': "Окно сети",
    });
    /** @type {__VLS_StyleScopedClasses['dock']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-tabs" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['dock-tabs']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(tabs, {})));
    for (const [tab] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (editor.value.leftTab = tab.id);
                    // @ts-ignore
                    [tabs, editor,];
                } },
            key: (tab.id),
            role: "tab",
            ...{ class: ({ active: editor.value.leftTab === tab.id }) },
            'aria-selected': (editor.value.leftTab === tab.id),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (tab.label);
        if (tab.badge) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (tab.badge);
        }
        // @ts-ignore
        [editor, editor,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    if (editor.value.leftTab === 'network') {
        const __VLS_1 = NetworkPanel;
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
        // @ts-ignore
        }));
        const __VLS_3 = __VLS_2({}, ...__VLS_functionalComponentArgsRest(__VLS_2));
    }
    else if (editor.value.leftTab === 'graphics') {
        const __VLS_6 = GraphicsPanel;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        }));
        const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    }
    else if (editor.value.leftTab === 'filter') {
        const __VLS_11 = FilterPanel;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        }));
        const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    }
    else if (editor.value.leftTab === 'transit') {
        const __VLS_16 = TransitPanel;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        // @ts-ignore
        }));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    }
    else {
        const __VLS_21 = IssuesPanel;
        // @ts-ignore
        const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
        // @ts-ignore
        }));
        const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
    }
    // @ts-ignore
    [editor, editor, editor, editor,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
