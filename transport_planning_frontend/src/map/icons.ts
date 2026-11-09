import type { Map as MlMap } from 'maplibre-gl'

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

export function registerIcons(map: MlMap): void {
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
