import { RotateCcw } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { bearing } from '@/core/geo';
import { nodeConnectors, resetLaneConnections, setLaneConnection } from '@/core/laneOps';
import { connectivityAt } from '@/core/topology';
import { COLORS } from '@/map/style';
import { useEditor } from '@/stores/editor';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const VIEW = 560;
const CENTER = VIEW / 2;
const LANE_W = 17;
const ARM_END = 232;
const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
const data = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    const projector = editor.projector;
    if (!doc || !projector)
        return null;
    return nodeConnectors(doc, projector, props.node);
});
/** Длинную сторону центра определяют самые широкие подходы. */
const armStart = computed(() => {
    const arms = data.value?.arms ?? [];
    const widest = Math.max(1, ...arms.map((arm) => arm.lanesIn + arm.lanesOut));
    return Math.max(46, widest * LANE_W * 0.72);
});
function toSvg(x, y) {
    return { x: CENTER + x, y: CENTER - y };
}
const shapes = computed(() => {
    const result = [];
    for (const arm of data.value?.arms ?? []) {
        const nx = -arm.dir.y;
        const ny = arm.dir.x;
        const make = (index, incoming) => {
            // Въезд лежит слева, если смотреть от узла наружу: движение правостороннее
            const offset = (incoming ? 1 : -1) * (index + 0.5) * LANE_W;
            const half = LANE_W / 2 - 1;
            const at = (radius, shift) => toSvg(arm.dir.x * radius + nx * (offset + shift), arm.dir.y * radius + ny * (offset + shift));
            const a = at(armStart.value, half);
            const b = at(ARM_END, half);
            const c = at(ARM_END, -half);
            const d = at(armStart.value, -half);
            const tipRadius = ARM_END - 30;
            const baseRadius = tipRadius + (incoming ? 16 : -16);
            const headRadius = incoming ? tipRadius : baseRadius + 16;
            const backRadius = incoming ? baseRadius : baseRadius;
            const tip = at(headRadius, 0);
            const left = at(backRadius, 5);
            const right = at(backRadius, -5);
            result.push({
                arm,
                index,
                incoming,
                polygon: [a, b, c, d].map((p) => `${p.x},${p.y}`).join(' '),
                joint: at(armStart.value, 0),
                arrow: [tip, left, right].map((p) => `${p.x},${p.y}`).join(' '),
            });
        };
        for (let i = 0; i < arm.lanesIn; i++)
            make(i, true);
        for (let i = 0; i < arm.lanesOut; i++)
            make(i, false);
    }
    return result;
});
function armName(arm) {
    const name = editor.doc?.ways.get(arm.link.wayId)?.tags?.name;
    const side = COMPASS[Math.round(bearing(arm.dir) / 45) % 8];
    return name ? `${name} (${side})` : `Подход ${side}`;
}
const labels = computed(() => (data.value?.arms ?? []).map((arm) => {
    const point = toSvg(arm.dir.x * (ARM_END + 8), arm.dir.y * (ARM_END + 8));
    return {
        key: arm.neighbor,
        x: point.x,
        y: point.y,
        anchor: arm.dir.x > 0.3 ? 'end' : arm.dir.x < -0.3 ? 'start' : 'middle',
        dy: arm.dir.y > 0.5 ? 12 : arm.dir.y < -0.5 ? -4 : -10,
        text: armName(arm),
    };
}));
const KIND_COLORS = {
    left: COLORS.left,
    right: COLORS.right,
    through: '#0f9d8a',
    reverse: COLORS.reverse,
};
const selected = ref(null);
function laneShape(arm, index, incoming) {
    return shapes.value.find((shape) => shape.arm === arm && shape.index === index && shape.incoming === incoming);
}
const curves = computed(() => {
    return (data.value?.connectors ?? []).flatMap((connector) => {
        const from = laneShape(connector.from, connector.fromLane, true);
        const to = laneShape(connector.to, connector.toLane, false);
        if (!from || !to)
            return [];
        const active = selected.value?.neighbor === connector.from.neighbor && selected.value.lane === connector.fromLane;
        return [
            {
                key: `${connector.from.neighbor}:${connector.fromLane}>${connector.to.neighbor}:${connector.toLane}`,
                path: `M ${from.joint.x} ${from.joint.y} Q ${CENTER} ${CENTER} ${to.joint.x} ${to.joint.y}`,
                color: KIND_COLORS[connector.kind] ?? '#888',
                active,
                dim: selected.value !== null && !active,
            },
        ];
    });
});
function isConnected(toNeighbor, toLane) {
    const from = selected.value;
    if (!from)
        return false;
    return (data.value?.connectors ?? []).some((c) => c.from.neighbor === from.neighbor && c.fromLane === from.lane && c.to.neighbor === toNeighbor && c.toLane === toLane);
}
function clickLane(shape) {
    if (shape.incoming) {
        const same = selected.value?.neighbor === shape.arm.neighbor && selected.value.lane === shape.index;
        selected.value = same ? null : { neighbor: shape.arm.neighbor, lane: shape.index };
        return;
    }
    const from = selected.value;
    if (!from) {
        editor.toast('Сначала выберите полосу, с которой въезжают в узел');
        return;
    }
    if (shape.arm.neighbor === from.neighbor) {
        editor.toast('Разворот на ту же дорогу здесь не настраивается');
        return;
    }
    const enabled = !isConnected(shape.arm.neighbor, shape.index);
    editor.mutate(enabled ? 'Соединение полос' : 'Отключение соединения', (doc, projector) => setLaneConnection(doc, projector, props.node, from.neighbor, from.lane, shape.arm.neighbor, shape.index, enabled));
}
const hasManual = computed(() => {
    void editor.rev;
    return editor.doc ? connectivityAt(editor.doc, props.node).length > 0 : false;
});
function reset() {
    editor.mutate('Сброс соединений полос', (doc) => resetLaneConnections(doc, props.node));
    selected.value = null;
}
function laneClass(shape) {
    const isFrom = selected.value?.neighbor === shape.arm.neighbor && selected.value.lane === shape.index;
    return {
        lane: true,
        incoming: shape.incoming,
        selected: shape.incoming && isFrom,
        connected: !shape.incoming && isConnected(shape.arm.neighbor, shape.index),
        target: !shape.incoming && selected.value !== null,
    };
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
    __VLS_withDotValue(KIND_COLORS, {});
    __VLS_withDotValue(hasManual, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['lane']} */ ;
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "schematic" },
    });
    /** @type {__VLS_StyleScopedClasses['schematic']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        viewBox: (`0 0 ${__VLS_unwrap(VIEW, {})} ${__VLS_unwrap(VIEW, {})}`),
        role: "img",
        'aria-label': "Схема полос узла",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "0",
        y: "0",
        width: (__VLS_unwrap(VIEW, {})),
        height: (__VLS_unwrap(VIEW, {})),
        ...{ class: "bg" },
    });
    /** @type {__VLS_StyleScopedClasses['bg']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(shapes, {})));
    for (const [shape] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (clickLane(shape));
                    // @ts-ignore
                    [VIEW, VIEW, VIEW, VIEW, shapes,];
                } },
            ...{ onKeydown: (...[$event]) => {
                    void $event;
                    return (clickLane(shape));
                    // @ts-ignore
                    [];
                } },
            key: (`${shape.arm.neighbor}-${shape.incoming}-${shape.index}`),
            points: (shape.polygon),
            ...{ class: (laneClass(shape)) },
            tabindex: "0",
            role: "button",
            'aria-label': (`${armName(shape.arm)}, ${shape.incoming ? 'въезд' : 'выезд'}, полоса ${shape.index + 1}`),
        });
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        'pointer-events': "none",
    });
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(shapes, {})));
    for (const [shape] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
            key: (`a-${shape.arm.neighbor}-${shape.incoming}-${shape.index}`),
            points: (shape.arrow),
            ...{ class: "arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['arrow']} */ ;
        // @ts-ignore
        [shapes,];
    }
    const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(curves, {})));
    for (const [curve] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            key: (curve.key),
            d: (curve.path),
            fill: "none",
            stroke: (curve.color),
            'stroke-width': (curve.active ? 4 : 2.5),
            opacity: (curve.dim ? 0.18 : 0.95),
            'stroke-linecap': "round",
        });
        // @ts-ignore
        [curves,];
    }
    const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(labels, {})));
    for (const [label] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            key: (label.key),
            x: (label.x),
            y: (label.y),
            dy: (label.dy),
            'text-anchor': (label.anchor),
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (label.text);
        // @ts-ignore
        [labels,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "side" },
    });
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.br)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
        ...{ style: ({ background: KIND_COLORS.value.through }) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
        ...{ style: ({ background: KIND_COLORS.value.left }) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
        ...{ style: ({ background: KIND_COLORS.value.right }) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (reset) },
        ...{ class: "btn block" },
        disabled: (!hasManual.value),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    let __VLS_4;
    /** @ts-ignore @type { | typeof RotateCcw} */
    RotateCcw;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent1(__VLS_4, new __VLS_4({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_6 = __VLS_5({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "faint note" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    // @ts-ignore
    [KIND_COLORS, KIND_COLORS, KIND_COLORS, hasManual,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
