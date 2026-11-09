<script setup lang="ts">
import { type GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { isDrivable } from '@/core/lanes'
import { BASEMAP_OPTIONS, basemapSource } from '@/map/style'
import { useEditor } from '@/stores/editor'

/** Снимок или схема рядом с графом. Камера синхронна с основной картой, поверх — тонкие оси дорог. */
const editor = useEditor()
const container = ref<HTMLDivElement | null>(null)
let map: MlMap | null = null
let ready = false
let applyingCamera = false

/** Рядом с графом нужна реальная картина, поэтому по умолчанию показываем снимок. */
const source = computed(() => (editor.basemap === 'none' ? 'satellite' : editor.basemap))
const title = computed(() => {
  if (source.value === 'custom') return 'Свой источник'
  return BASEMAP_OPTIONS.find((option) => option.id === source.value)?.label ?? ''
})

function axes(): GeoJSON.FeatureCollection {
  const doc = editor.doc
  if (!doc) return { type: 'FeatureCollection', features: [] }
  const features: GeoJSON.Feature[] = []
  for (const way of doc.ways.values()) {
    if (!isDrivable(way.tags)) continue
    const coordinates = way.nds
      .map((id) => doc.nodes.get(id))
      .filter((node): node is NonNullable<typeof node> => !!node)
      .map((node) => [node.lon, node.lat])
    if (coordinates.length >= 2) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })
  }
  return { type: 'FeatureCollection', features }
}

function applySource(): void {
  if (!ready || !map) return
  for (const id of ['compare-raster-2', 'compare-raster']) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of ['compare-raster-2', 'compare-raster']) if (map.getSource(id)) map.removeSource(id)
  const specs = basemapSource(source.value, editor.customTileUrl)
  specs.forEach((spec, index) => {
    const id = index === 0 ? 'compare-raster' : 'compare-raster-2'
    map!.addSource(id, spec)
    map!.addLayer(
      { id, type: 'raster', source: id, paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 120 } },
      'compare-axes',
    )
  })
}

onMounted(() => {
  const camera = editor.camera
  const instance = new MlMap({
    container: container.value!,
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
  })
  map = instance
  instance.on('load', () => {
    ready = true
    applySource()
  })
  instance.on('move', (event) => {
    if (applyingCamera || !(event as { originalEvent?: unknown }).originalEvent) return
    const center = instance.getCenter()
    editor.requestCamera({
      center: [center.lng, center.lat],
      zoom: instance.getZoom(),
      bearing: instance.getBearing(),
      pitch: instance.getPitch(),
    })
  })
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  ready = false
})

watch(() => editor.camera, (camera) => {
  if (!camera || !map) return
  applyingCamera = true
  map.jumpTo({ center: camera.center, zoom: camera.zoom, bearing: camera.bearing, pitch: camera.pitch })
  applyingCamera = false
})
watch(() => [source.value, editor.customTileUrl], applySource)
watch(() => editor.rev, () => {
  ;(map?.getSource('axes') as GeoJSONSource | undefined)?.setData(axes())
})
</script>

<template>
  <section class="compare" aria-label="Подложка рядом с графом">
    <div ref="container" class="map" />
    <span class="title">{{ title }}</span>
  </section>
</template>

<style scoped>
.compare {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 50%;
  border-left: 2px solid var(--accent);
}
.map {
  position: absolute;
  inset: 0;
}
.title {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 7px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  font-size: 11px;
  pointer-events: none;
}
</style>
