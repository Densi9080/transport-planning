import { Map as MlMap } from 'maplibre-gl';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isDrivable } from '@/core/lanes';
import { BASEMAP_OPTIONS, basemapSource } from '@/map/style';
import { useEditor } from '@/stores/editor';
/** Снимок или схема рядом с графом. Камера синхронна с основной картой, поверх — тонкие оси дорог. */
const editor = useEditor();
const container = ref(null);
let map = null;
let ready = false;
let applyingCamera = false;
/** Рядом с графом нужна реальная картина, поэтому по умолчанию показываем снимок. */
const source = computed(() => (editor.basemap === 'none' ? 'satellite' : editor.basemap));
const title = computed(() => {
    if (source.value === 'custom')
        return 'Свой источник';
    return BASEMAP_OPTIONS.find((option) => option.id === source.value)?.label ?? '';
});
function axes() {
    const doc = editor.doc;
    if (!doc)
        return { type: 'FeatureCollection', features: [] };
    const features = [];
    for (const way of doc.ways.values()) {
        if (!isDrivable(way.tags))
            continue;
        const coordinates = way.nds
            .map((id) => doc.nodes.get(id))
            .filter((node) => !!node)
            .map((node) => [node.lon, node.lat]);
        if (coordinates.length >= 2)
            features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
    }
    return { type: 'FeatureCollection', features };
}
function applySource() {
    if (!ready || !map)
        return;
    for (const id of ['compare-raster-2', 'compare-raster'])
        if (map.getLayer(id))
            map.removeLayer(id);
    for (const id of ['compare-raster-2', 'compare-raster'])
        if (map.getSource(id))
            map.removeSource(id);
    const specs = basemapSource(source.value, editor.customTileUrl);
    specs.forEach((spec, index) => {
        const id = index === 0 ? 'compare-raster' : 'compare-raster-2';
        map.addSource(id, spec);
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 120 } }, 'compare-axes');
    });
}
onMounted(() => {
    const camera = editor.camera;
    const instance = new MlMap({
        container: container.value,
        center: camera?.center ?? [0, 0],
        zoom: camera?.zoom ?? 15,
        bearing: camera?.bearing ?? 0,
        pitch: camera?.pitch ?? 0,
        maxZoom: 22,
        style: {
            version: 8,
            sources: { axes: { type: 'geojson', data: axes() } },
            layers: [
                // Здесь нужен настоящий цвет: стиль карты не понимает переменные CSS
                { id: 'compare-bg', type: 'background', paint: { 'background-color': '#101114' } },
                { id: 'compare-axes', type: 'line', source: 'axes', paint: { 'line-color': '#fb7185', 'line-width': 1.2, 'line-opacity': 0.85 } },
            ],
        },
    });
    map = instance;
    instance.on('load', () => {
        ready = true;
        applySource();
    });
    instance.on('move', (event) => {
        if (applyingCamera || !event.originalEvent)
            return;
        const center = instance.getCenter();
        editor.requestCamera({
            center: [center.lng, center.lat],
            zoom: instance.getZoom(),
            bearing: instance.getBearing(),
            pitch: instance.getPitch(),
        });
    });
});
onBeforeUnmount(() => {
    map?.remove();
    map = null;
    ready = false;
});
watch(() => editor.camera, (camera) => {
    if (!camera || !map)
        return;
    applyingCamera = true;
    map.jumpTo({ center: camera.center, zoom: camera.zoom, bearing: camera.bearing, pitch: camera.pitch });
    applyingCamera = false;
});
watch(() => [source.value, editor.customTileUrl], applySource);
watch(() => editor.rev, () => {
    ;
    map?.getSource('axes')?.setData(axes());
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "compare" },
        'aria-label': "Подложка рядом с графом",
    });
    /** @type {__VLS_StyleScopedClasses['compare']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map" },
    });
    /** @type {__VLS_StyleScopedClasses['map']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_unwrap(title, {}));
    // @ts-ignore
    [title,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
