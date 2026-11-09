import { BusFront, MapPinPlus, Plus, Search, Trash2, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { DEFAULT_INTERVAL_MIN, TRANSIT_MODE_LABELS } from '@/core/transit';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const query = ref('');
const modeFilter = ref('all');
const creating = ref(false);
const newRef = ref('');
const newMode = ref('bus');
const newInterval = ref(10);
const modes = ['bus', 'trolleybus', 'tram', 'minibus'];
const visible = computed(() => {
    const needle = query.value.trim().toLowerCase();
    return editor.lines
        .filter((line) => modeFilter.value === 'all' || line.mode === modeFilter.value)
        .filter((line) => !needle || line.ref.toLowerCase().includes(needle) || line.name.toLowerCase().includes(needle));
});
const line = computed(() => editor.selectedLine);
const lineResult = computed(() => {
    const id = editor.selectedLineId;
    return sim.macro?.lines.find((item) => item.service.line.id === id) ?? null;
});
function createLine() {
    const ref = newRef.value.trim();
    if (!ref) {
        editor.toast('Укажите номер маршрута', 'error');
        return;
    }
    editor.createTransitLine({ ref, mode: newMode.value, interval: newInterval.value });
    creating.value = false;
    newRef.value = '';
}
function setField(key, event) {
    if (!line.value)
        return;
    const value = event.target.value.trim();
    const tags = { ...line.value.tags };
    if (value)
        tags[key] = value;
    else
        delete tags[key];
    editor.updateLineTags(line.value.id, tags);
}
function setInterval(event) {
    if (!line.value)
        return;
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) {
        editor.toast('Интервал должен быть положительным числом минут', 'error');
        return;
    }
    editor.updateLineTags(line.value.id, { ...line.value.tags, interval: String(value) }, 'Интервал маршрута');
}
function toggleTool(tool) {
    editor.setTool(editor.tool === tool ? 'select' : tool);
}
function wayName(id) {
    return editor.doc?.ways.get(id)?.tags?.name ?? `Дорога ${id}`;
}
/** Удаление отменяется через Ctrl+Z, поэтому отдельного подтверждения не нужно. */
function deleteSelected() {
    if (!line.value)
        return;
    const name = line.value.name;
    editor.deleteTransitLine(line.value.id);
    editor.toast(`Маршрут «${name}» удалён. Вернуть: Ctrl+Z`);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(creating, {});
    __VLS_withDotValue(TRANSIT_MODE_LABELS, {});
    __VLS_withDotValue(visible, {});
    __VLS_withDotValue(line, {});
    __VLS_withDotValue(lineResult, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['line-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['line-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['member']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "check grow" },
    });
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['grow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (editor.value.layers.transit);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (creating.value = !creating.value);
                // @ts-ignore
                [editor, creating, creating,];
            } },
        ...{ class: "btn small" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof Plus} */
    Plus;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (12), 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (12),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    if (creating.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
            ...{ onSubmit: (createLine) },
            ...{ class: "create" },
        });
        /** @type {__VLS_StyleScopedClasses['create']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "new-ref",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "new-ref",
            ...{ class: "input" },
        });
        (__VLS_unwrap(newRef, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "new-mode",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            id: "new-mode",
            value: (__VLS_unwrap(newMode, {})),
            ...{ class: "input" },
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(modes, {})));
        for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (mode),
                value: (mode),
            });
            (TRANSIT_MODE_LABELS.value[mode]);
            // @ts-ignore
            [creating, newRef, newMode, modes, TRANSIT_MODE_LABELS,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "new-interval",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "new-interval",
            ...{ class: "input" },
            type: "number",
            min: "1",
        });
        (__VLS_unwrap(newInterval, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ class: "btn primary block" },
            type: "submit",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search" },
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    let __VLS_6;
    /** @ts-ignore @type { | typeof Search} */
    Search;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        size: (13), ...{ class: "faint" }, 'aria-hidden': "true",
    }));
    const __VLS_8 = __VLS_7({
        size: (13),
        ...{ class: "faint" },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input" },
        placeholder: "Номер или название",
        'aria-label': "Поиск маршрута",
    });
    (__VLS_unwrap(query, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (__VLS_unwrap(modeFilter, {})),
        ...{ class: "input" },
        'aria-label': "Вид транспорта",
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "all",
    });
    const __VLS_11 = __VLS_tryAsConstant((__VLS_unwrap(modes, {})));
    for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (mode),
            value: (mode),
        });
        (TRANSIT_MODE_LABELS.value[mode]);
        // @ts-ignore
        [modes, TRANSIT_MODE_LABELS, newInterval, query, modeFilter,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "list" },
        'aria-label': "Маршруты",
    });
    /** @type {__VLS_StyleScopedClasses['list']} */ ;
    const __VLS_12 = __VLS_tryAsConstant((visible.value));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (editor.value.focusLine(item.id));
                    // @ts-ignore
                    [editor, visible,];
                } },
            key: (item.id),
            ...{ class: "line-row" },
            ...{ class: ({ active: editor.value.selectedLineId === item.id }) },
            'aria-pressed': (editor.value.selectedLineId === item.id),
        });
        /** @type {__VLS_StyleScopedClasses['line-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "chip" },
            ...{ style: ({ background: item.color }) },
        });
        /** @type {__VLS_StyleScopedClasses['chip']} */ ;
        (item.ref || '—');
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ellipsis" },
        });
        /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
        (item.from && item.to ? `${item.from} — ${item.to}` : item.name);
        // @ts-ignore
        [editor, editor,];
    }
    if (visible.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    }
    if (line.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "section card" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        /** @type {__VLS_StyleScopedClasses['card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "chip" },
            ...{ style: ({ background: line.value.color }) },
        });
        /** @type {__VLS_StyleScopedClasses['chip']} */ ;
        (line.value.ref || '—');
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
            ...{ class: "ellipsis" },
        });
        /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
        (TRANSIT_MODE_LABELS.value[line.value.mode]);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(line.value))
                        throw 0;
                    return (editor.value.selectLine(null));
                    // @ts-ignore
                    [editor, TRANSIT_MODE_LABELS, visible, line, line, line, line,];
                } },
            ...{ class: "btn ghost small" },
            'aria-label': "Снять выбор маршрута",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_13;
        /** @ts-ignore @type { | typeof X} */
        X;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
            // @ts-ignore
            size: (12),
        }));
        const __VLS_15 = __VLS_14({
            size: (12),
        }, ...__VLS_functionalComponentArgsRest(__VLS_14));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "line-name",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(line.value))
                        throw 0;
                    return (setField('name', $event));
                    // @ts-ignore
                    [];
                } },
            id: "line-name",
            ...{ class: "input" },
            value: (line.value.tags.name ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "line-ref",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(line.value))
                        throw 0;
                    return (setField('ref', $event));
                    // @ts-ignore
                    [line,];
                } },
            id: "line-ref",
            ...{ class: "input" },
            value: (line.value.ref),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "line-interval",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (setInterval) },
            id: "line-interval",
            ...{ class: "input" },
            type: "number",
            min: "1",
            value: (line.value.interval),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        if (!line.value.intervalTagged) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted info" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['info']} */ ;
            (__VLS_unwrap(DEFAULT_INTERVAL_MIN, {}));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        ((line.value.lengthM / 1000).toFixed(2));
        (line.value.wayIds.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (line.value.outsideWays);
        (line.value.outsideStops);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (line.value.stops.length);
        if (lineResult.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (lineResult.value.service.frequency.toFixed(1));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (Math.round(lineResult.value.timeS / 60));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (Math.round(lineResult.value.speedKmh));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(line.value))
                        throw 0;
                    return (toggleTool('lineWay'));
                    // @ts-ignore
                    [line, line, line, line, line, line, line, line, DEFAULT_INTERVAL_MIN, lineResult, lineResult, lineResult, lineResult,];
                } },
            ...{ class: "btn small" },
            ...{ class: ({ on: editor.value.tool === 'lineWay' }) },
            'aria-pressed': (editor.value.tool === 'lineWay'),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['on']} */ ;
        let __VLS_18;
        /** @ts-ignore @type { | typeof BusFront} */
        BusFront;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
            // @ts-ignore
            size: (12), 'aria-hidden': "true",
        }));
        const __VLS_20 = __VLS_19({
            size: (12),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(line.value))
                        throw 0;
                    return (toggleTool('lineStop'));
                    // @ts-ignore
                    [editor, editor,];
                } },
            ...{ class: "btn small" },
            ...{ class: ({ on: editor.value.tool === 'lineStop' }) },
            'aria-pressed': (editor.value.tool === 'lineStop'),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['on']} */ ;
        let __VLS_23;
        /** @ts-ignore @type { | typeof MapPinPlus} */
        MapPinPlus;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
            // @ts-ignore
            size: (12), 'aria-hidden': "true",
        }));
        const __VLS_25 = __VLS_24({
            size: (12),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
        (line.value.stops.length);
        const __VLS_28 = __VLS_tryAsConstant((line.value.stops));
        for (const [stop] of __VLS_vFor(__VLS_nonNull(__VLS_28))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (`${stop.node}-${stop.role}`),
                ...{ class: "member" },
            });
            /** @type {__VLS_StyleScopedClasses['member']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(line.value))
                            throw 0;
                        return (editor.value.focusNode(stop.node));
                        // @ts-ignore
                        [editor, editor, editor, line, line,];
                    } },
                ...{ class: "link ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['link']} */ ;
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (stop.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(line.value))
                            throw 0;
                        return (editor.value.removeStopFromLine(line.value.id, stop.node));
                        // @ts-ignore
                        [editor, line,];
                    } },
                ...{ class: "btn ghost small" },
                'aria-label': (`Убрать остановку ${stop.name}`),
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            let __VLS_29;
            /** @ts-ignore @type { | typeof X} */
            X;
            // @ts-ignore
            const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
                // @ts-ignore
                size: (11),
            }));
            const __VLS_31 = __VLS_30({
                size: (11),
            }, ...__VLS_functionalComponentArgsRest(__VLS_30));
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
        (line.value.wayIds.length);
        const __VLS_34 = __VLS_tryAsConstant((line.value.wayIds));
        for (const [id, index] of __VLS_vFor(__VLS_nonNull(__VLS_34))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (`${id}-${index}`),
                ...{ class: "member" },
            });
            /** @type {__VLS_StyleScopedClasses['member']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(line.value))
                            throw 0;
                        return (editor.value.focusWay(id));
                        // @ts-ignore
                        [editor, line, line,];
                    } },
                ...{ class: "link ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['link']} */ ;
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (wayName(id));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(line.value))
                            throw 0;
                        return (editor.value.removeWayFromLine(line.value.id, id));
                        // @ts-ignore
                        [editor, line,];
                    } },
                ...{ class: "btn ghost small" },
                'aria-label': (`Убрать дорогу ${wayName(id)} из маршрута`),
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            let __VLS_35;
            /** @ts-ignore @type { | typeof X} */
            X;
            // @ts-ignore
            const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
                // @ts-ignore
                size: (11),
            }));
            const __VLS_37 = __VLS_36({
                size: (11),
            }, ...__VLS_functionalComponentArgsRest(__VLS_36));
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (deleteSelected) },
            ...{ class: "btn block small danger" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['danger']} */ ;
        let __VLS_40;
        /** @ts-ignore @type { | typeof Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
            // @ts-ignore
            size: (12), 'aria-hidden': "true",
        }));
        const __VLS_42 = __VLS_41({
            size: (12),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
