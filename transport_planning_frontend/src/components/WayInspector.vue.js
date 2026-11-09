import { ArrowLeftRight, Copy, Minus, Plus, Scissors, Sparkles, Spline, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { applyElevationRamp, clearElevation, maxSlopePercent, wayHeights } from '@/core/elevation';
import { polylineLength } from '@/core/geo';
import { isOneway, parseProfile, totalWidth, withLanes } from '@/core/lanes';
import { ROAD_TYPES, TYPE_DEFAULTS } from '@/core/presets';
import { useEditor } from '@/stores/editor';
import LaneEditor from './LaneEditor.vue';
import TagTable from './TagTable.vue';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const tab = ref('props');
const tags = computed(() => props.way.tags ?? {});
const profile = computed(() => parseProfile(tags.value));
const title = computed(() => tags.value.name ?? `Дорога ${props.way.id}`);
const isRoad = computed(() => !!tags.value.highway);
const lengthM = computed(() => {
    const doc = editor.doc;
    const projector = editor.projector;
    if (!doc || !projector)
        return 0;
    const points = props.way.nds
        .map((id) => doc.nodes.get(id))
        .filter((node) => !!node)
        .map((node) => projector.toXY(node));
    return polylineLength(points);
});
const heights = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    if (!doc)
        return { start: 0, end: 0, hasEle: false };
    const map = wayHeights(doc, props.way);
    return {
        start: map.get(props.way.nds[0]) ?? 0,
        end: map.get(props.way.nds.at(-1)) ?? 0,
        hasEle: props.way.nds.some((id) => doc.nodes.get(id)?.tags?.ele !== undefined),
    };
});
const parallelGap = ref(12);
const rampStart = ref(0);
const rampEnd = ref(5.5);
const slope = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    const projector = editor.projector;
    return doc && projector ? maxSlopePercent(doc, props.way, projector) : 0;
});
function applyRamp() {
    const from = Number(rampStart.value);
    const to = Number(rampEnd.value);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        editor.toast('Высота должна быть числом', 'error');
        return;
    }
    editor.mutate('Плавный переход по Z', (doc, projector) => applyElevationRamp(doc, projector, props.way.id, from, to));
    editor.toast('Высоты записаны в теги ele узлов', 'success');
}
function resetRamp() {
    editor.mutate('Сброс высот', (doc) => clearElevation(doc, props.way.id));
}
const structure = computed(() => {
    if (tags.value.bridge && tags.value.bridge !== 'no')
        return 'bridge';
    if (tags.value.tunnel && tags.value.tunnel !== 'no')
        return 'tunnel';
    return 'none';
});
function update(next, label) {
    editor.updateWayTags(props.way.id, next, label);
}
function setTag(key, value, label) {
    const next = { ...tags.value };
    if (value.trim())
        next[key] = value.trim();
    else
        delete next[key];
    update(next, label);
}
function setHighway(value) {
    const next = { ...tags.value, highway: value };
    const defaults = TYPE_DEFAULTS[value];
    if (defaults && !next.maxspeed)
        next.maxspeed = defaults.maxspeed;
    update(next, 'Тип дороги');
}
function fillDefaults() {
    const defaults = TYPE_DEFAULTS[tags.value.highway ?? ''];
    if (!defaults)
        return;
    const next = { ...tags.value };
    if (!next.maxspeed)
        next.maxspeed = defaults.maxspeed;
    if (!next.lanes) {
        const lanes = Number(defaults.lanes);
        next.lanes = isOneway(next) ? String(Math.max(1, Math.ceil(lanes / 2))) : defaults.lanes;
    }
    update(next, 'Автозаполнение');
}
function setOneway(oneway) {
    const p = profile.value;
    const total = Math.max(1, p.forward + p.backward);
    if (oneway) {
        const next = { ...tags.value, oneway: 'yes', lanes: String(total) };
        delete next['lanes:forward'];
        delete next['lanes:backward'];
        delete next['turn:lanes:backward'];
        update(next, 'Односторонняя дорога');
    }
    else {
        const next = { ...tags.value };
        delete next.oneway;
        const forward = Math.max(1, Math.ceil(total / 2));
        const backward = Math.max(1, total - forward);
        update(withLanes(next, forward, backward), 'Двусторонняя дорога');
    }
}
function changeLanes(direction, delta) {
    const p = profile.value;
    if (p.oneway) {
        const reversed = p.forward === 0;
        const lanes = Math.max(1, p.forward + p.backward + delta);
        update(withLanes(tags.value, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос');
    }
    else {
        const forward = direction === 'forward' ? Math.max(1, p.forward + delta) : p.forward;
        const backward = direction === 'backward' ? Math.max(1, p.backward + delta) : p.backward;
        update(withLanes(tags.value, forward, backward), 'Число полос');
    }
}
function setStructure(kind) {
    const next = { ...tags.value };
    delete next.bridge;
    delete next.tunnel;
    delete next.layer;
    if (kind === 'bridge') {
        next.bridge = 'yes';
        next.layer = '1';
    }
    else if (kind === 'tunnel') {
        next.tunnel = 'yes';
        next.layer = '-1';
    }
    update(next, 'Мост или тоннель');
}
function changeLayer(delta) {
    const layer = (Number.parseInt(tags.value.layer ?? '0', 10) || 0) + delta;
    setTag('layer', layer === 0 ? '' : String(layer), 'Уровень дороги');
}
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
    __VLS_withDotValue(isRoad, {});
    __VLS_withDotValue(profile, {});
    __VLS_withDotValue(tags, {});
    __VLS_withDotValue(lengthM, {});
    __VLS_withDotValue(tab, {});
    __VLS_withDotValue(ROAD_TYPES, {});
    __VLS_withDotValue(TYPE_DEFAULTS, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(structure, {});
    __VLS_withDotValue(heights, {});
    __VLS_withDotValue(slope, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['stat']} */ ;
    /** @type {__VLS_StyleScopedClasses['stat']} */ ;
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section head" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "ellipsis" },
    });
    /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
    (__VLS_unwrap(title, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint id" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['id']} */ ;
    (__VLS_ctx.way.id);
    if (isRoad.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "hero" },
        });
        /** @type {__VLS_StyleScopedClasses['hero']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stat" },
        });
        /** @type {__VLS_StyleScopedClasses['stat']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (profile.value.oneway ? profile.value.forward + profile.value.backward : `${profile.value.forward} + ${profile.value.backward}`);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stat" },
        });
        /** @type {__VLS_StyleScopedClasses['stat']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_unwrap(totalWidth, {})(profile.value).toFixed(1));
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stat" },
        });
        /** @type {__VLS_StyleScopedClasses['stat']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (tags.value.maxspeed ?? '—');
        if (tags.value.maxspeed && /^\d+$/.test(tags.value.maxspeed)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stat" },
        });
        /** @type {__VLS_StyleScopedClasses['stat']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (lengthM.value.toFixed(0));
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
    }
    if (profile.value.inferred && isRoad.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tabs" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (tab.value = 'props');
                // @ts-ignore
                [title, way, isRoad, isRoad, profile, profile, profile, profile, profile, profile, profile, totalWidth, tags, tags, tags, lengthM, tab,];
            } },
        ...{ class: ({ active: tab.value === 'props' }) },
        role: "tab",
        'aria-selected': (tab.value === 'props'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (tab.value = 'lanes');
                // @ts-ignore
                [tab, tab, tab,];
            } },
        ...{ class: ({ active: tab.value === 'lanes' }) },
        role: "tab",
        'aria-selected': (tab.value === 'lanes'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (tab.value = 'tags');
                // @ts-ignore
                [tab, tab, tab,];
            } },
        ...{ class: ({ active: tab.value === 'tags' }) },
        role: "tab",
        'aria-selected': (tab.value === 'tags'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    if (tab.value === 'props') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "way-name",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setTag('name', $event.target.value, 'Название'));
                    // @ts-ignore
                    [tab, tab, tab,];
                } },
            id: "way-name",
            ...{ class: "input" },
            value: (tags.value.name ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "way-type",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setHighway($event.target.value));
                    // @ts-ignore
                    [tags,];
                } },
            id: "way-type",
            ...{ class: "input" },
            value: (tags.value.highway),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        if (!ROAD_TYPES.value.some((t) => t.value === tags.value.highway)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: (tags.value.highway),
            });
            (tags.value.highway);
        }
        const __VLS_0 = __VLS_tryAsConstant((ROAD_TYPES.value));
        for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (type.value),
                value: (type.value),
            });
            (type.label);
            // @ts-ignore
            [tags, tags, tags, tags, ROAD_TYPES, ROAD_TYPES,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (fillDefaults) },
            ...{ class: "btn block small" },
            disabled: (!TYPE_DEFAULTS.value[tags.value.highway ?? ''] || (!!tags.value.lanes && !!tags.value.maxspeed)),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_1;
        /** @ts-ignore @type { | typeof Sparkles} */
        Sparkles;
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_3 = __VLS_2({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "segmented" },
            role: "group",
            'aria-label': "Направление движения",
        });
        /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (profile.value.oneway && setOneway(false));
                    // @ts-ignore
                    [profile, tags, tags, tags, TYPE_DEFAULTS,];
                } },
            ...{ class: ({ active: !profile.value.oneway }) },
            'aria-pressed': (!profile.value.oneway),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (!profile.value.oneway && setOneway(true));
                    // @ts-ignore
                    [profile, profile, profile,];
                } },
            ...{ class: ({ active: profile.value.oneway }) },
            'aria-pressed': (profile.value.oneway),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.reverseSelected) },
            ...{ class: "btn block small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_6;
        /** @ts-ignore @type { | typeof ArrowLeftRight} */
        ArrowLeftRight;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_8 = __VLS_7({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        (profile.value.oneway ? 'Развернуть движение' : 'Развернуть порядок узлов');
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (profile.value.oneway ? 'Полос' : 'По ходу');
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stepper" },
        });
        /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (changeLanes('forward', -1));
                    // @ts-ignore
                    [profile, profile, profile, profile, editor,];
                } },
            'aria-label': "Меньше полос",
        });
        let __VLS_11;
        /** @ts-ignore @type { | typeof Minus} */
        Minus;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_13 = __VLS_12({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (profile.value.oneway ? profile.value.forward + profile.value.backward : profile.value.forward);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (changeLanes('forward', 1));
                    // @ts-ignore
                    [profile, profile, profile, profile,];
                } },
            'aria-label': "Больше полос",
        });
        let __VLS_16;
        /** @ts-ignore @type { | typeof Plus} */
        Plus;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_18 = __VLS_17({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        if (!profile.value.oneway) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "field" },
            });
            /** @type {__VLS_StyleScopedClasses['field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "stepper" },
            });
            /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(tab.value === 'props'))
                            throw 0;
                        if (!(!profile.value.oneway))
                            throw 0;
                        return (changeLanes('backward', -1));
                        // @ts-ignore
                        [profile,];
                    } },
                'aria-label': "Меньше встречных полос",
            });
            let __VLS_21;
            /** @ts-ignore @type { | typeof Minus} */
            Minus;
            // @ts-ignore
            const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_23 = __VLS_22({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_22));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (profile.value.backward);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(tab.value === 'props'))
                            throw 0;
                        if (!(!profile.value.oneway))
                            throw 0;
                        return (changeLanes('backward', 1));
                        // @ts-ignore
                        [profile,];
                    } },
                'aria-label': "Больше встречных полос",
            });
            let __VLS_26;
            /** @ts-ignore @type { | typeof Plus} */
            Plus;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                // @ts-ignore
                size: (13),
            }));
            const __VLS_28 = __VLS_27({
                size: (13),
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
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
            for: "way-speed",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setTag('maxspeed', $event.target.value, 'Скорость'));
                    // @ts-ignore
                    [];
                } },
            id: "way-speed",
            ...{ class: "input" },
            value: (tags.value.maxspeed ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "way-width",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setTag('width', $event.target.value, 'Ширина'));
                    // @ts-ignore
                    [tags,];
                } },
            id: "way-width",
            ...{ class: "input" },
            value: (tags.value.width ?? ''),
            placeholder: "авто",
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "segmented" },
            role: "group",
            'aria-label': "Сооружение",
        });
        /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setStructure('none'));
                    // @ts-ignore
                    [tags,];
                } },
            ...{ class: ({ active: structure.value === 'none' }) },
            'aria-pressed': (structure.value === 'none'),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setStructure('bridge'));
                    // @ts-ignore
                    [structure, structure,];
                } },
            ...{ class: ({ active: structure.value === 'bridge' }) },
            'aria-pressed': (structure.value === 'bridge'),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (setStructure('tunnel'));
                    // @ts-ignore
                    [structure, structure,];
                } },
            ...{ class: ({ active: structure.value === 'tunnel' }) },
            'aria-pressed': (structure.value === 'tunnel'),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stepper" },
        });
        /** @type {__VLS_StyleScopedClasses['stepper']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (changeLayer(-1));
                    // @ts-ignore
                    [structure, structure,];
                } },
            'aria-label': "Уровень ниже",
        });
        let __VLS_31;
        /** @ts-ignore @type { | typeof Minus} */
        Minus;
        // @ts-ignore
        const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_33 = __VLS_32({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (tags.value.layer ?? '0');
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (changeLayer(1));
                    // @ts-ignore
                    [tags,];
                } },
            'aria-label': "Уровень выше",
        });
        let __VLS_36;
        /** @ts-ignore @type { | typeof Plus} */
        Plus;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_38 = __VLS_37({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "ramp-start",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "ramp-start",
            ...{ class: "input" },
            type: "number",
            step: "0.5",
        });
        (__VLS_unwrap(rampStart, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "ramp-end",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "ramp-end",
            ...{ class: "input" },
            type: "number",
            step: "0.5",
        });
        (__VLS_unwrap(rampEnd, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (applyRamp) },
            ...{ class: "btn block small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted info" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['info']} */ ;
        (heights.value.start.toFixed(1));
        (heights.value.end.toFixed(1));
        (slope.value.toFixed(1));
        if (slope.value > 12) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "warn" },
            });
            /** @type {__VLS_StyleScopedClasses['warn']} */ ;
        }
        if (heights.value.hasEle) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (resetRamp) },
                ...{ class: "btn block small" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['block']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.smoothSelected) },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_41;
        /** @ts-ignore @type { | typeof Spline} */
        Spline;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_43 = __VLS_42({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.duplicateSelected) },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_46;
        /** @ts-ignore @type { | typeof Copy} */
        Copy;
        // @ts-ignore
        const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_48 = __VLS_47({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_47));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "parallel-gap",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "parallel-gap",
            ...{ class: "input" },
            type: "number",
            min: "1",
            step: "0.5",
        });
        (__VLS_unwrap(parallelGap, {}));
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-2" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (editor.value.parallelSelected(__VLS_unwrap(parallelGap, {}), 1));
                    // @ts-ignore
                    [editor, editor, editor, rampStart, rampEnd, heights, heights, heights, slope, slope, parallelGap, parallelGap,];
                } },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (editor.value.parallelSelected(__VLS_unwrap(parallelGap, {}), -1));
                    // @ts-ignore
                    [editor, parallelGap,];
                } },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(tab.value === 'props'))
                        throw 0;
                    return (editor.value.setTool('split'));
                    // @ts-ignore
                    [editor,];
                } },
            ...{ class: "btn block small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        let __VLS_51;
        /** @ts-ignore @type { | typeof Scissors} */
        Scissors;
        // @ts-ignore
        const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_53 = __VLS_52({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_52));
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.deleteSelection) },
            ...{ class: "btn block small danger" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['danger']} */ ;
        let __VLS_56;
        /** @ts-ignore @type { | typeof Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_58 = __VLS_57({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
    }
    else if (tab.value === 'lanes') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        const __VLS_61 = LaneEditor;
        // @ts-ignore
        const __VLS_62 = __VLS_asFunctionalComponent1(__VLS_61, new __VLS_61({
            // @ts-ignore
            ...{ 'onChange': {} }, tags: (tags.value),
        }));
        const __VLS_63 = __VLS_62({
            ...{ 'onChange': {} },
            tags: (tags.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_62));
        let __VLS_66;
        const __VLS_67 = {
            /** @type {typeof __VLS_66.change} */
            onChange: (...[$event]) => {
                void $event;
                if (!!(tab.value === 'props'))
                    throw 0;
                if (!(tab.value === 'lanes'))
                    throw 0;
                return (update($event, 'Манёвры полос'));
                // @ts-ignore
                [tags, tab, editor,];
            },
        };
        void __VLS_67;
        var __VLS_64;
        var __VLS_65;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        const __VLS_68 = TagTable;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
            // @ts-ignore
            ...{ 'onChange': {} }, tags: (tags.value),
        }));
        const __VLS_70 = __VLS_69({
            ...{ 'onChange': {} },
            tags: (tags.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        let __VLS_73;
        const __VLS_74 = {
            /** @type {typeof __VLS_73.change} */
            onChange: (...[$event]) => {
                void $event;
                if (!!(tab.value === 'props'))
                    throw 0;
                if (!!(tab.value === 'lanes'))
                    throw 0;
                return (update($event));
                // @ts-ignore
                [tags,];
            },
        };
        void __VLS_74;
        var __VLS_71;
        var __VLS_72;
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
