import { Box, BusFront, CarFront, Circle, Download, Footprints, Gauge, Landmark, MapPinPlus, Maximize, MousePointer2, Network, OctagonAlert, PanelBottom, PanelLeft, PanelRight, Pause, PencilRuler, Play, Redo2, Route, Scissors, Sparkles, TrafficCone, TrainFrontTunnel, Undo2, Waves, } from 'lucide-vue-next';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const tools = [
    { id: 'select', label: 'Выбор', key: 'V', icon: MousePointer2 },
    { id: 'road', label: 'Новая дорога', key: 'D', icon: Route },
    { id: 'node', label: 'Новый узел', key: 'N', icon: Circle },
    { id: 'split', label: 'Разрезать дорогу', key: 'X', icon: Scissors },
    { id: 'signal', label: 'Светофор', key: 'T', icon: TrafficCone },
    { id: 'crossing', label: 'Пешеходный переход', key: 'C', icon: Footprints },
    { id: 'speed', label: 'Участок сниженной скорости', key: 'S', icon: Gauge },
    { id: 'bump', label: 'Лежачий полицейский', key: 'L', icon: Waves },
    { id: 'sign', label: 'Знак приоритета', key: 'P', icon: OctagonAlert },
    { id: 'bridge', label: 'Мост', key: 'B', icon: Landmark },
    { id: 'tunnel', label: 'Тоннель', key: 'G', icon: TrainFrontTunnel },
];
const modes = [
    { id: 'engineering', label: 'Инженерия', icon: PencilRuler },
    { id: 'graph', label: 'Граф', icon: Network },
    { id: '3d', label: '3D', icon: Box },
    { id: 'sim', label: 'Симуляция', icon: CarFront },
];
function toggleAssistant() {
    if (editor.inspectorOpen && editor.rightTab === 'assistant') {
        editor.rightTab = 'quick';
        return;
    }
    editor.inspectorOpen = true;
    editor.rightTab = 'assistant';
}
function chooseLineTool(tool) {
    editor.navigatorOpen = true;
    editor.leftTab = 'transit';
    if (editor.selectedLineId === null) {
        editor.toast('Выберите маршрут в окне «Линии ОТ» или создайте новый');
        return;
    }
    editor.setTool(tool);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(sim, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar" },
        role: "toolbar",
        'aria-label': "Панель инструментов",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (editor.value.undo) },
        ...{ class: "tool" },
        title: "Отменить (Ctrl+Z)",
        'aria-label': "Отменить",
        disabled: (!editor.value.canUndo),
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof Undo2} */
    Undo2;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_2 = __VLS_1({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (editor.value.redo) },
        ...{ class: "tool" },
        title: "Повторить (Ctrl+Y)",
        'aria-label': "Повторить",
        disabled: (!editor.value.canRedo),
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof Redo2} */
    Redo2;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_7 = __VLS_6({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "sep" },
    });
    /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    if (editor.value.viewMode !== 'sim') {
        const __VLS_10 = __VLS_tryAsConstant((__VLS_unwrap(tools, {})));
        for (const [tool] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(editor.value.viewMode !== 'sim'))
                            throw 0;
                        return (editor.value.setTool(tool.id));
                        // @ts-ignore
                        [editor, editor, editor, editor, editor, editor, tools,];
                    } },
                key: (tool.id),
                ...{ class: "tool" },
                ...{ class: ({ active: editor.value.tool === tool.id }) },
                'aria-pressed': (editor.value.tool === tool.id),
                'aria-label': (tool.label),
                title: (`${tool.label} (${tool.key})`),
            });
            /** @type {__VLS_StyleScopedClasses['tool']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            const __VLS_11 = (tool.icon);
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                // @ts-ignore
                size: (15),
            }));
            const __VLS_13 = __VLS_12({
                size: (15),
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            // @ts-ignore
            [editor, editor,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "sep" },
        });
        /** @type {__VLS_StyleScopedClasses['sep']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(editor.value.viewMode !== 'sim'))
                        throw 0;
                    return (chooseLineTool('lineWay'));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "tool" },
            ...{ class: ({ active: editor.value.tool === 'lineWay' }) },
            title: "Добавлять дороги в маршрут ОТ",
            'aria-label': "Добавлять дороги в маршрут ОТ",
        });
        /** @type {__VLS_StyleScopedClasses['tool']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        let __VLS_16;
        /** @ts-ignore @type { | typeof BusFront} */
        BusFront;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_18 = __VLS_17({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(editor.value.viewMode !== 'sim'))
                        throw 0;
                    return (chooseLineTool('lineStop'));
                    // @ts-ignore
                    [editor,];
                } },
            ...{ class: "tool" },
            ...{ class: ({ active: editor.value.tool === 'lineStop' }) },
            title: "Добавлять остановки в маршрут ОТ",
            'aria-label': "Добавлять остановки в маршрут ОТ",
        });
        /** @type {__VLS_StyleScopedClasses['tool']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        let __VLS_21;
        /** @ts-ignore @type { | typeof MapPinPlus} */
        MapPinPlus;
        // @ts-ignore
        const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
            // @ts-ignore
            size: (15),
        }));
        const __VLS_23 = __VLS_22({
            size: (15),
        }, ...__VLS_functionalComponentArgsRest(__VLS_22));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "sep" },
        });
        /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (sim.value.togglePlay) },
            ...{ class: "btn small" },
            ...{ class: ({ primary: !sim.value.running }) },
            disabled: (sim.value.level !== 'micro'),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        if (sim.value.running) {
            let __VLS_26;
            /** @ts-ignore @type { | typeof Pause} */
            Pause;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_28 = __VLS_27({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        }
        else {
            let __VLS_31;
            /** @ts-ignore @type { | typeof Play} */
            Play;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_33 = __VLS_32({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        }
        (sim.value.running ? 'Пауза' : 'Запуск');
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "sep" },
        });
        /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.fitRev++);
                // @ts-ignore
                [editor, editor, sim, sim, sim, sim, sim,];
            } },
        ...{ class: "tool" },
        title: "Показать весь участок (H)",
        'aria-label': "Показать весь участок",
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    let __VLS_36;
    /** @ts-ignore @type { | typeof Maximize} */
    Maximize;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_38 = __VLS_37({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "sep" },
    });
    /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "segmented modes" },
        role: "group",
        'aria-label': "Режим просмотра",
    });
    /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
    /** @type {__VLS_StyleScopedClasses['modes']} */ ;
    const __VLS_41 = __VLS_tryAsConstant((__VLS_unwrap(modes, {})));
    for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_41))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (editor.value.viewMode = mode.id);
                    // @ts-ignore
                    [editor, modes,];
                } },
            key: (mode.id),
            ...{ class: ({ active: editor.value.viewMode === mode.id }) },
            'aria-pressed': (editor.value.viewMode === mode.id),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        const __VLS_42 = (mode.icon);
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_44 = __VLS_43({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_43));
        (mode.label);
        // @ts-ignore
        [editor, editor,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (toggleAssistant) },
        ...{ class: "tool" },
        ...{ class: ({ active: editor.value.inspectorOpen && editor.value.rightTab === 'assistant' }) },
        title: "Помощник",
        'aria-label': "Помощник",
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_47;
    /** @ts-ignore @type { | typeof Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_49 = __VLS_48({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "sep" },
    });
    /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.navigatorOpen = !editor.value.navigatorOpen);
                // @ts-ignore
                [editor, editor, editor, editor,];
            } },
        ...{ class: "tool" },
        ...{ class: ({ active: editor.value.navigatorOpen }) },
        'aria-pressed': (editor.value.navigatorOpen),
        title: "Окно «Сеть»",
        'aria-label': "Окно «Сеть»",
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_52;
    /** @ts-ignore @type { | typeof PanelLeft} */
    PanelLeft;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_54 = __VLS_53({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.listOpen = !editor.value.listOpen);
                // @ts-ignore
                [editor, editor, editor, editor,];
            } },
        ...{ class: "tool" },
        ...{ class: ({ active: editor.value.listOpen }) },
        'aria-pressed': (editor.value.listOpen),
        title: "Списки",
        'aria-label': "Списки",
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_57;
    /** @ts-ignore @type { | typeof PanelBottom} */
    PanelBottom;
    // @ts-ignore
    const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_59 = __VLS_58({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_58));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.inspectorOpen = !editor.value.inspectorOpen);
                // @ts-ignore
                [editor, editor, editor, editor,];
            } },
        ...{ class: "tool" },
        ...{ class: ({ active: editor.value.inspectorOpen }) },
        'aria-pressed': (editor.value.inspectorOpen),
        title: "Быстрый просмотр",
        'aria-label': "Быстрый просмотр",
    });
    /** @type {__VLS_StyleScopedClasses['tool']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_62;
    /** @ts-ignore @type { | typeof PanelRight} */
    PanelRight;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
        // @ts-ignore
        size: (15),
    }));
    const __VLS_64 = __VLS_63({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_63));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "sep" },
    });
    /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.exportOpen = true);
                // @ts-ignore
                [editor, editor, editor,];
            } },
        ...{ class: "btn small primary" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    let __VLS_67;
    /** @ts-ignore @type { | typeof Download} */
    Download;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent1(__VLS_67, new __VLS_67({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_69 = __VLS_68({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
