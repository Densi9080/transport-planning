import { onBeforeUnmount, onMounted, watch } from 'vue';
import AppToolbar from '@/components/AppToolbar.vue';
import AssistantSettingsDialog from '@/components/AssistantSettingsDialog.vue';
import CompareMap from '@/components/CompareMap.vue';
import ExportDialog from '@/components/ExportDialog.vue';
import HelpDialog from '@/components/HelpDialog.vue';
import InspectorPanel from '@/components/InspectorPanel.vue';
import JunctionEditor from '@/components/JunctionEditor.vue';
import LeftDock from '@/components/LeftDock.vue';
import LegendBox from '@/components/LegendBox.vue';
import ListDock from '@/components/ListDock.vue';
import MapCanvas from '@/components/MapCanvas.vue';
import MenuBar from '@/components/MenuBar.vue';
import StatusBar from '@/components/StatusBar.vue';
import TrafficOptions from '@/components/TrafficOptions.vue';
import { parseProfile, withLanes } from '@/core/lanes';
import { useAssistant } from '@/stores/assistant';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const sim = useSimulation();
const assistant = useAssistant();
const TOOL_KEYS = {
    v: 'select',
    n: 'node',
    d: 'road',
    x: 'split',
    t: 'signal',
    c: 'crossing',
    b: 'bridge',
    g: 'tunnel',
    s: 'speed',
    l: 'bump',
    p: 'sign',
};
function isTyping(target) {
    const element = target;
    return !!element && (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable);
}
function changeLanes(delta) {
    const way = editor.selectedWays[0];
    if (!way)
        return;
    const tags = way.tags ?? {};
    const profile = parseProfile(tags);
    if (profile.oneway) {
        const reversed = profile.forward === 0;
        const lanes = Math.max(1, profile.forward + profile.backward + delta);
        editor.updateWayTags(way.id, withLanes(tags, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос');
    }
    else {
        editor.updateWayTags(way.id, withLanes(tags, Math.max(1, profile.forward + delta), Math.max(1, profile.backward + delta)), 'Число полос');
    }
}
function onKeyDown(event) {
    if (isTyping(event.target) || !editor.doc || editor.doc.inTransaction)
        return;
    // Пока открыт диалог, клавиши принадлежат ему: Esc закрывает окно, а не снимает выделение
    if (editor.exportOpen || editor.helpOpen || editor.junctionNode !== null || assistant.settingsOpen)
        return;
    const key = event.key.toLowerCase();
    const code = event.code;
    if ((event.ctrlKey || event.metaKey) && (code === 'KeyZ' || code === 'KeyY')) {
        event.preventDefault();
        if (code === 'KeyY' || event.shiftKey)
            editor.redo();
        else
            editor.undo();
        return;
    }
    // Инструментами в симуляции граф не правится, а отмену расчёт подхватит сам
    if (editor.viewMode === 'sim') {
        if (code === 'Space') {
            event.preventDefault();
            sim.togglePlay();
        }
        else if (key === 'escape') {
            editor.select([]);
        }
        else if (code === 'F1') {
            event.preventDefault();
            editor.helpOpen = !editor.helpOpen;
        }
        return;
    }
    if ((event.ctrlKey || event.metaKey) && code === 'KeyD') {
        event.preventDefault();
        editor.duplicateSelected();
        return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey)
        return;
    if (key === 'escape') {
        if (editor.drawPoints.length > 0)
            editor.drawPoints = [];
        else if (editor.speedStart)
            editor.speedStart = null;
        else if (editor.tool !== 'select')
            editor.setTool('select');
        else
            editor.select([]);
        return;
    }
    if (key === 'enter' && editor.tool === 'road') {
        editor.finishRoad();
        return;
    }
    if (key === 'backspace' && editor.tool === 'road') {
        event.preventDefault();
        editor.drawPoints = editor.drawPoints.slice(0, -1);
        return;
    }
    if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        editor.deleteSelection();
        return;
    }
    if (key === '?' || code === 'F1') {
        event.preventDefault();
        editor.helpOpen = !editor.helpOpen;
        return;
    }
    // Коды клавиш работают и в русской раскладке
    const latin = code.startsWith('Key') ? code.slice(3).toLowerCase() : key;
    const nextTool = TOOL_KEYS[latin];
    if (nextTool) {
        editor.setTool(nextTool);
        return;
    }
    switch (latin) {
        case 'f':
            editor.reverseSelected();
            break;
        case 'm':
            editor.mergeSelected();
            break;
        case 'u':
            editor.unglueSelected();
            break;
        case 'j':
            editor.joinSelected();
            break;
        case 'h':
            editor.fitRev++;
            break;
        case 'e':
            if (editor.selectedNodes[0])
                editor.openJunction(editor.selectedNodes[0].id);
            else
                editor.toast('Выберите узел, чтобы открыть его редактор');
            break;
    }
    if (code === 'BracketRight' || key === ']')
        changeLanes(1);
    else if (code === 'BracketLeft' || key === '[')
        changeLanes(-1);
}
function onBeforeUnload(event) {
    if (editor.saveState === 'dirty' || editor.saveState === 'saving')
        event.preventDefault();
}
onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
    void editor.open(props.id);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('beforeunload', onBeforeUnload);
});
watch(() => props.id, (id) => void editor.open(id));
// Свёрнутый быстрый просмотр открывается при выборе объекта, иначе щелчок выглядит безрезультатным
watch(() => editor.selection, (next, previous) => {
    if (next.length > 0 && previous.length === 0)
        editor.inspectorOpen = true;
});
watch(() => editor.viewMode, (mode, previous) => {
    if (mode === 'sim') {
        editor.setTool('select');
        editor.inspectorOpen = true;
        sim.enter();
    }
    else if (previous === 'sim') {
        sim.leave();
    }
});
watch(() => editor.tool, (tool) => {
    if (tool === 'road')
        editor.inspectorOpen = true;
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(assistant, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['map-slot']} */ ;
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "app" },
    });
    /** @type {__VLS_StyleScopedClasses['app']} */ ;
    if (editor.value.loadError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state" },
            role: "alert",
        });
        /** @type {__VLS_StyleScopedClasses['state']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (editor.value.loadError);
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            ...{ class: "btn" }, to: "/",
        }));
        const __VLS_2 = __VLS_1({
            ...{ class: "btn" },
            to: "/",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        var __VLS_3;
        const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
        // @ts-ignore
        [editor, editor,];
    }
    else if (editor.value.loading || !editor.value.doc || editor.value.projectId !== __VLS_ctx.id) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state" },
        });
        /** @type {__VLS_StyleScopedClasses['state']} */ ;
    }
    else {
        const __VLS_6 = MenuBar;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        }));
        const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
        const __VLS_11 = AppToolbar;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        }));
        const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "workspace" },
        });
        /** @type {__VLS_StyleScopedClasses['workspace']} */ ;
        const __VLS_16 = LeftDock;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        // @ts-ignore
        }));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        const __VLS_21 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
        __VLS_21(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (editor.value.navigatorOpen), }, ...__VLS_directiveHookArgsRest(__VLS_21));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "center" },
        });
        /** @type {__VLS_StyleScopedClasses['center']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stage" },
        });
        /** @type {__VLS_StyleScopedClasses['stage']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "map-slot" },
            ...{ class: ({ split: editor.value.compareOpen }) },
        });
        /** @type {__VLS_StyleScopedClasses['map-slot']} */ ;
        /** @type {__VLS_StyleScopedClasses['split']} */ ;
        const __VLS_22 = MapCanvas;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
            // @ts-ignore
            key: (__VLS_ctx.id),
        }));
        const __VLS_24 = __VLS_23({
            key: (__VLS_ctx.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        const __VLS_27 = LegendBox;
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
        // @ts-ignore
        }));
        const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
        if (editor.value.compareOpen) {
            const __VLS_32 = CompareMap;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
            // @ts-ignore
            }));
            const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
        }
        const __VLS_37 = TrafficOptions;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        // @ts-ignore
        }));
        const __VLS_39 = __VLS_38({}, ...__VLS_functionalComponentArgsRest(__VLS_38));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "toasts" },
            'aria-live': "polite",
        });
        /** @type {__VLS_StyleScopedClasses['toasts']} */ ;
        const __VLS_42 = __VLS_tryAsConstant((editor.value.toasts));
        for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_42))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (item.id),
                ...{ class: "toast" },
                ...{ class: (item.tone) },
            });
            /** @type {__VLS_StyleScopedClasses['toast']} */ ;
            (item.text);
            // @ts-ignore
            [editor, editor, editor, editor, editor, editor, editor, id, id,];
        }
        if (editor.value.listOpen) {
            const __VLS_43 = ListDock;
            // @ts-ignore
            const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
            // @ts-ignore
            }));
            const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
        }
        const __VLS_48 = InspectorPanel;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
        // @ts-ignore
        }));
        const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
        const __VLS_53 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
        __VLS_53(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (editor.value.inspectorOpen), }, ...__VLS_directiveHookArgsRest(__VLS_53));
        const __VLS_54 = StatusBar;
        // @ts-ignore
        const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
        // @ts-ignore
        }));
        const __VLS_56 = __VLS_55({}, ...__VLS_functionalComponentArgsRest(__VLS_55));
        if (editor.value.exportOpen) {
            const __VLS_59 = ExportDialog;
            // @ts-ignore
            const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
            // @ts-ignore
            }));
            const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
        }
        if (editor.value.helpOpen) {
            const __VLS_64 = HelpDialog;
            // @ts-ignore
            const __VLS_65 = __VLS_asFunctionalComponent1(__VLS_64, new __VLS_64({
            // @ts-ignore
            }));
            const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
        }
        if (editor.value.junctionNode !== null) {
            const __VLS_69 = JunctionEditor;
            // @ts-ignore
            const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
                // @ts-ignore
                key: (editor.value.junctionNode),
            }));
            const __VLS_71 = __VLS_70({
                key: (editor.value.junctionNode),
            }, ...__VLS_functionalComponentArgsRest(__VLS_70));
        }
        if (assistant.value.settingsOpen) {
            const __VLS_74 = AssistantSettingsDialog;
            // @ts-ignore
            const __VLS_75 = __VLS_asFunctionalComponent1(__VLS_74, new __VLS_74({
            // @ts-ignore
            }));
            const __VLS_76 = __VLS_75({}, ...__VLS_functionalComponentArgsRest(__VLS_75));
        }
    }
    // @ts-ignore
    [editor, editor, editor, editor, editor, editor, assistant,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
