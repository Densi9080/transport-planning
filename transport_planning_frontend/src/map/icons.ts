import type { Map as MlMap } from 'maplibre-gl'

import { SECTION_SPEEDS } from '@/core/traffic'

const SIZE = 96
const INK = 'rgba(236, 238, 242, 0.82)'

type Painter = (ctx: CanvasRenderingContext2D) => void

function makeImage(paint: Painter, width = SIZE, height = SIZE): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  paint(ctx)
  return ctx.getImageData(0, 0, width, height)
}

/** Стрелка рисуется остриём вверх: это север, поворот задаётся азимутом. */
function shaft(ctx: CanvasRenderingContext2D, turn: 'through' | 'left' | 'right' | 'reverse'): void {
  const cx = SIZE / 2
  ctx.lineWidth = 7
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineCap = 'butt'

  const head = (x: number, y: number, angle: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, -13)
    ctx.lineTo(11, 7)
    ctx.lineTo(-11, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.beginPath()
  ctx.moveTo(cx, SIZE - 6)
  if (turn === 'through') {
    ctx.lineTo(cx, 22)
    ctx.stroke()
    head(cx, 18, 0)
  } else if (turn === 'reverse') {
    ctx.lineTo(cx, 40)
    ctx.arc(cx - 14, 40, 14, 0, Math.PI, true)
    ctx.lineTo(cx - 28, 60)
    ctx.stroke()
    head(cx - 28, 66, Math.PI)
  } else {
    const side = turn === 'left' ? -1 : 1
    ctx.lineTo(cx, 48)
    ctx.quadraticCurveTo(cx, 34, cx + side * 16, 34)
    ctx.stroke()
    head(cx + side * 22, 34, side * (Math.PI / 2))
  }
}

const ARROWS: Record<string, ('through' | 'left' | 'right' | 'reverse')[]> = {
  through: ['through'],
  left: ['left'],
  right: ['right'],
  reverse: ['reverse'],
  through_left: ['through', 'left'],
  through_right: ['through', 'right'],
  left_right: ['left', 'right'],
  all: ['left', 'through', 'right'],
}

function trafficLight(ctx: CanvasRenderingContext2D): void {
  const w = 44
  const h = 96
  ctx.fillStyle = '#0d0f12'
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, 12)
  ctx.fill()
  ctx.stroke()
  for (const [y, color] of [
    [22, '#ef4444'],
    [48, '#f59e0b'],
    [74, '#22c55e'],
  ] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(w / 2, y, 10, 0, Math.PI * 2)
    ctx.fill()
  }
}

function direction(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#e8ecf1'
  ctx.beginPath()
  ctx.moveTo(24, 4)
  ctx.lineTo(44, 44)
  ctx.lineTo(24, 34)
  ctx.lineTo(4, 44)
  ctx.closePath()
  ctx.fill()
}

const SIGN_SIZE = 72

export type StopIconMode = 'bus' | 'trolleybus' | 'tram'

/**
 * Значок остановки по мотивам знаков 5.16 и 5.17 ПДД: синий квадрат, белое поле, силуэт транспорта.
 * У трамвая пантограф сверху, у троллейбуса две штанги: их видно и в мелком масштабе.
 */
function stopIcon(mode: StopIconMode): Painter {
  return (ctx) => {
    const s = SIGN_SIZE
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(1, 1, s - 2, s - 2, 9)
    ctx.fill()
    ctx.fillStyle = mode === 'tram' ? '#b45309' : '#1d4ed8'
    ctx.beginPath()
    ctx.roundRect(4, 4, s - 8, s - 8, 7)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(11, 11, s - 22, s - 22)
    ctx.fillStyle = '#111827'
    ctx.strokeStyle = '#111827'
    const top = mode === 'bus' ? 24 : 30
    // Кузов с окнами
    ctx.beginPath()
    ctx.roundRect(16, top, s - 32, 54 - top, 4)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    const windows = 3
    const gap = 3
    const width = (s - 32 - 8 - gap * (windows - 1)) / windows
    for (let i = 0; i < windows; i++) ctx.fillRect(20 + i * (width + gap), top + 4, width, 9)
    ctx.fillStyle = '#111827'
    if (mode === 'tram') {
      // Колёсные тележки и пантограф
      ctx.fillRect(20, 54, 10, 4)
      ctx.fillRect(s - 30, 54, 10, 4)
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(s / 2 - 8, top)
      ctx.lineTo(s / 2, top - 10)
      ctx.lineTo(s / 2 + 8, top)
      ctx.moveTo(s / 2 - 10, top - 12)
      ctx.lineTo(s / 2 + 10, top - 12)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(24, 55, 4, 0, Math.PI * 2)
      ctx.arc(s - 24, 55, 4, 0, Math.PI * 2)
      ctx.fill()
      if (mode === 'trolleybus') {
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(26, top)
        ctx.lineTo(42, top - 12)
        ctx.moveTo(32, top)
        ctx.lineTo(48, top - 12)
        ctx.stroke()
      }
    }
  }
}

function stopSign(ctx: CanvasRenderingContext2D): void {
  const c = SIGN_SIZE / 2
  const r = c - 3
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + (i * Math.PI) / 4
    ctx.lineTo(c + r * Math.cos(angle), c + r * Math.sin(angle))
  }
  ctx.closePath()
  ctx.fillStyle = '#dc2626'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(16, c - 5, SIGN_SIZE - 32, 10)
}

function giveWaySign(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(5, 8)
  ctx.lineTo(SIGN_SIZE - 5, 8)
  ctx.lineTo(SIGN_SIZE / 2, SIGN_SIZE - 6)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 8
  ctx.lineJoin = 'round'
  ctx.fill()
  ctx.stroke()
}

/** Знак 2.1 «Главная дорога»: жёлтый ромб в белой кайме с тёмным контуром. */
function mainRoadDiamond(ctx: CanvasRenderingContext2D, size: number, top: number): void {
  const c = SIGN_SIZE / 2
  const r = size / 2
  const cy = top + r
  ctx.beginPath()
  ctx.moveTo(c, cy - r)
  ctx.lineTo(c + r, cy)
  ctx.lineTo(c, cy + r)
  ctx.lineTo(c - r, cy)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#111317'
  ctx.lineWidth = 3
  ctx.fill()
  ctx.stroke()
  const inner = r * 0.62
  ctx.beginPath()
  ctx.moveTo(c, cy - inner)
  ctx.lineTo(c + inner, cy)
  ctx.lineTo(c, cy + inner)
  ctx.lineTo(c - inner, cy)
  ctx.closePath()
  ctx.fillStyle = '#facc15'
  ctx.fill()
}

function mainRoadSign(ctx: CanvasRenderingContext2D): void {
  mainRoadDiamond(ctx, SIGN_SIZE - 8, 4)
}

/** 2.1 с табличкой 8.13 «Направление главной дороги»: ромб меньше, под ним белая табличка с изломом. */
function mainRoadBentSign(ctx: CanvasRenderingContext2D): void {
  mainRoadDiamond(ctx, 44, 2)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#111317'
  ctx.lineWidth = 2
  ctx.fillRect(14, 50, SIGN_SIZE - 28, 20)
  ctx.strokeRect(14, 50, SIGN_SIZE - 28, 20)
  ctx.beginPath()
  ctx.moveTo(22, 65)
  ctx.lineTo(36, 65)
  ctx.lineTo(48, 54)
  ctx.lineWidth = 4
  ctx.stroke()
}

function bumpSign(ctx: CanvasRenderingContext2D): void {
  const c = SIGN_SIZE / 2
  ctx.beginPath()
  ctx.arc(c, c, c - 3, 0, Math.PI * 2)
  ctx.fillStyle = '#facc15'
  ctx.strokeStyle = '#111317'
  ctx.lineWidth = 4
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(12, c + 13)
  ctx.lineTo(23, c + 13)
  ctx.quadraticCurveTo(c, c - 26, SIGN_SIZE - 23, c + 13)
  ctx.lineTo(SIGN_SIZE - 12, c + 13)
  ctx.lineWidth = 6
  ctx.stroke()
}

function speedSign(speed: number): Painter {
  return (ctx) => {
    const c = SIGN_SIZE / 2
    ctx.beginPath()
    ctx.arc(c, c, c - 6, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 9
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#111317'
    ctx.font = '700 30px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(speed), c, c + 2)
  }
}

export function registerIcons(map: MlMap): void {
  map.addImage('sign-stop', makeImage(stopSign, SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  map.addImage('sign-give-way', makeImage(giveWaySign, SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  map.addImage('sign-bump', makeImage(bumpSign, SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  map.addImage('sign-main', makeImage(mainRoadSign, SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  map.addImage('sign-main-bent', makeImage(mainRoadBentSign, SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  for (const mode of ['bus', 'trolleybus', 'tram'] as const) {
    map.addImage(`stop-${mode}`, makeImage(stopIcon(mode), SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  }
  for (const speed of SECTION_SPEEDS) {
    map.addImage(`sign-speed-${speed}`, makeImage(speedSign(speed), SIGN_SIZE, SIGN_SIZE), { pixelRatio: 2 })
  }
  for (const [name, turns] of Object.entries(ARROWS)) {
    map.addImage(
      `arrow-${name}`,
      makeImage((ctx) => turns.forEach((turn) => shaft(ctx, turn))),
    )
  }
  map.addImage('traffic-light', makeImage(trafficLight, 44, 96), { pixelRatio: 3 })
  map.addImage('direction', makeImage(direction, 48, 48), { pixelRatio: 3 })
}

/** Подписи рисуются картинками: так кириллица работает без внешнего сервера шрифтов. */
export function ensureLabelImage(map: MlMap, name: string, theme: 'light' | 'dark' = 'dark'): string {
  const id = `label:${theme}:${name}`
  if (map.hasImage(id)) return id
  const measure = document.createElement('canvas').getContext('2d')!
  const font = '500 26px "Segoe UI", system-ui, sans-serif'
  measure.font = font
  const width = Math.ceil(measure.measureText(name).width) + 16
  const image = makeImage(
    (ctx) => {
      ctx.font = font
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 5
      ctx.strokeStyle = theme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(16,17,20,0.9)'
      ctx.strokeText(name, 8, 20)
      ctx.fillStyle = theme === 'light' ? 'rgba(28,33,39,0.95)' : 'rgba(214,218,226,0.95)'
      ctx.fillText(name, 8, 20)
    },
    width,
    40,
  )
  map.addImage(id, image, { pixelRatio: 2 })
  return id
}
