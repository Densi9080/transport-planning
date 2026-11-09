import { Footprints, Route, Scissors, TrafficCone, Trash2, Unlink } from 'lucide-vue-next';
import { computed } from 'vue';
import { bearing } from '@/core/geo';
import { moveNode, setMovementAllowed } from '@/core/ops';
import { junctionMovements } from '@/core/topology';
import { useEditor } from '@/stores/editor';
import SignalSummary from './SignalSummary.vue';
import TagTable from './TagTable.vue';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const tags = computed(() => props.node.tags ?? {});
const wayIds = computed(() => {
    void editor.rev;
    return editor.doc?.waysOfNode(props.node.id) ?? [];
});
const isSignal = computed(() => tags.value.highway === 'traffic_signals');
const isCrossing = computed(() => tags.value.highway === 'crossing');
const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
const TURN_LABELS = {
    left: 'налево',
    through: 'прямо',
    right: 'направо',
    reverse: 'разворот',
};
function armName(arm) {
    const name = editor.doc?.ways.get(arm.link.wayId)?.tags?.name;
    const side = COMPASS[Math.round(bearing(arm.dir) / 45) % 8];
    return name ? `${name} (${side})` : `сторона ${side}`;
}
const groups = computed(() => {
    const network = editor.network;
    const doc = editor.doc;
    if (!network || !doc)
        return [];
    const arms = network.arms.get(props.node.id) ?? [];
    if (arms.length < 2)
        return [];
    const all = junctionMovements(doc, network, props.node.id);
    const byArm = new Map();
    for (const movement of all) {
        const list = byArm.get(movement.from);
        if (list)
            list.push(movement);
        else
            byArm.set(movement.from, [movement]);
    }
    return [...byArm.entries()].map(([arm, movements]) => ({ arm, movements }));
});
function toggleMovement(movement) {
    editor.mutate(movement.allowed ? 'Запрет манёвра' : 'Разрешение манёвра', (doc, projector) => {
        setMovementAllowed(doc, projector, props.node.id, movement.from.neighbor, movement.to.neighbor, !movement.allowed);
    });
}
function setCoordinate(key, event) {
    const value = Number.parseFloat(event.target.value);
    if (!Number.isFinite(value)) {
        editor.toast('Координата должна быть числом', 'error');
        return;
    }
    editor.mutate('Координаты узла', (doc) => {
        moveNode(doc, props.node.id, { lat: props.node.lat, lon: props.node.lon, [key]: value });
    });
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
    __VLS_withDotValue(wayIds, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(isSignal, {});
    __VLS_withDotValue(groups, {});
    __VLS_withDotValue(TURN_LABELS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (wayIds.value.length > 1 ? 'Перекрёсток' : 'Узел');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint id" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['id']} */ ;
    (__VLS_ctx.node.id);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted info" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['info']} */ ;
    (wayIds.value.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid-2" },
    });
    /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "node-lat",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                void $event;
                return (setCoordinate('lat', $event));
                // @ts-ignore
                [wayIds, wayIds, node,];
            } },
        id: "node-lat",
        ...{ class: "input" },
        value: (__VLS_ctx.node.lat.toFixed(7)),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "node-lon",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                void $event;
                return (setCoordinate('lon', $event));
                // @ts-ignore
                [node,];
            } },
        id: "node-lon",
        ...{ class: "input" },
        value: (__VLS_ctx.node.lon.toFixed(7)),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.openJunction(__VLS_ctx.node.id));
                // @ts-ignore
                [node, node, editor,];
            } },
        ...{ class: "btn primary block" },
        disabled: (wayIds.value.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof Route} */
    Route;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid-2" },
    });
    /** @type {__VLS_StyleScopedClasses['grid-2']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.toggleOnNode('signal', { nodeId: __VLS_ctx.node.id, position: __VLS_ctx.node }));
                // @ts-ignore
                [wayIds, node, node, editor,];
            } },
        ...{ class: "btn small" },
        ...{ class: ({ on: isSignal.value }) },
        'aria-pressed': (isSignal.value),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof TrafficCone} */
    TrafficCone;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_7 = __VLS_6({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.toggleOnNode('crossing', { nodeId: __VLS_ctx.node.id, position: __VLS_ctx.node }));
                // @ts-ignore
                [node, node, editor, isSignal, isSignal,];
            } },
        ...{ class: "btn small" },
        ...{ class: ({ on: __VLS_unwrap(isCrossing, {}) }) },
        'aria-pressed': (__VLS_unwrap(isCrossing, {})),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    let __VLS_10;
    /** @ts-ignore @type { | typeof Footprints} */
    Footprints;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_12 = __VLS_11({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.splitAtNode(__VLS_ctx.node.id));
                // @ts-ignore
                [node, editor, isCrossing, isCrossing,];
            } },
        ...{ class: "btn small" },
        disabled: (wayIds.value.length === 0),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_15;
    /** @ts-ignore @type { | typeof Scissors} */
    Scissors;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_17 = __VLS_16({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (editor.value.unglueSelected) },
        ...{ class: "btn small" },
        disabled: (wayIds.value.length < 2),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_20;
    /** @ts-ignore @type { | typeof Unlink} */
    Unlink;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_22 = __VLS_21({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (editor.value.deleteSelection) },
        ...{ class: "btn small block danger" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['danger']} */ ;
    let __VLS_25;
    /** @ts-ignore @type { | typeof Trash2} */
    Trash2;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_27 = __VLS_26({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    if (isSignal.value) {
        const __VLS_30 = SignalSummary;
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
            // @ts-ignore
            node: (__VLS_ctx.node.id),
        }));
        const __VLS_32 = __VLS_31({
            node: (__VLS_ctx.node.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    }
    if (groups.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        const __VLS_35 = __VLS_tryAsConstant((groups.value));
        for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_35))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (`${group.arm.neighbor}`),
                ...{ class: "movement-group" },
            });
            /** @type {__VLS_StyleScopedClasses['movement-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "from" },
            });
            /** @type {__VLS_StyleScopedClasses['from']} */ ;
            (armName(group.arm));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chips" },
            });
            /** @type {__VLS_StyleScopedClasses['chips']} */ ;
            const __VLS_36 = __VLS_tryAsConstant((group.movements));
            for (const [movement] of __VLS_vFor(__VLS_nonNull(__VLS_36))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(groups.value.length))
                                throw 0;
                            return (toggleMovement(movement));
                            // @ts-ignore
                            [wayIds, wayIds, node, editor, editor, isSignal, groups, groups,];
                        } },
                    key: (movement.to.neighbor),
                    ...{ class: "chip" },
                    ...{ class: ([movement.kind, { off: !movement.allowed }]) },
                    'aria-pressed': (movement.allowed),
                    title: (`${armName(movement.to)}: ${movement.allowed ? 'разрешено, нажмите, чтобы запретить' : 'запрещено, нажмите, чтобы разрешить'}`),
                });
                /** @type {__VLS_StyleScopedClasses['chip']} */ ;
                /** @type {__VLS_StyleScopedClasses['off']} */ ;
                (TURN_LABELS.value[movement.kind]);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "to" },
                });
                /** @type {__VLS_StyleScopedClasses['to']} */ ;
                (armName(movement.to));
                // @ts-ignore
                [TURN_LABELS,];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "faint note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    const __VLS_37 = TagTable;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        // @ts-ignore
        ...{ 'onChange': {} }, tags: (__VLS_unwrap(tags, {})),
    }));
    const __VLS_39 = __VLS_38({
        ...{ 'onChange': {} },
        tags: (__VLS_unwrap(tags, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    let __VLS_42;
    const __VLS_43 = {
        /** @type {typeof __VLS_42.change} */
        onChange: (...[$event]) => {
            void $event;
            return (editor.value.updateNodeTags(__VLS_ctx.node.id, $event));
            // @ts-ignore
            [node, editor, tags,];
        },
    };
    void __VLS_43;
    var __VLS_40;
    var __VLS_41;
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
