import type { Map as MlMap } from 'maplibre-gl'

/**
 * Картинки знаков ПДД по номеру: «sign:3.18.2», «sign:3.24[40]». Рисуются на холсте по запросу
 * карты (событие styleimagemissing), поэтому любой номер из файла получает картинку: известные
 * знаки — по ГОСТ Р 52290 упрощённо, неизвестные — табличкой с номером.
 */

const S = 72
const C = S / 2
const RED = '#d6001c'
const BLUE = '#1b5fbf'
const INK = '#111317'

type Ctx = CanvasRenderingContext2D

function circle(ctx: Ctx, fill: string, stroke: string | null, border = 8): void {
  ctx.beginPath()
  ctx.arc(C, C, C - 3 - (stroke ? border / 2 : 0), 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = border
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}

function arrow(ctx: Ctx, color: string, turn: 'up' | 'left' | 'right' | 'uturn', width = 6): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  const head = (x: number, y: number, angle: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(9, 5)
    ctx.lineTo(-9, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  if (turn === 'up') {
    ctx.moveTo(C, S - 16)
    ctx.lineTo(C, 26)
    ctx.stroke()
    head(C, 22, 0)
  } else if (turn === 'uturn') {
    ctx.moveTo(C + 8, S - 16)
    ctx.lineTo(C + 8, 32)
    ctx.arc(C - 2, 32, 10, 0, Math.PI, true)
    ctx.lineTo(C - 12, 42)
    ctx.stroke()
    head(C - 12, 46, Math.PI)
  } else {
    const side = turn === 'left' ? -1 : 1
    ctx.moveTo(C - side * 6, S - 16)
    ctx.lineTo(C - side * 6, 38)
    ctx.quadraticCurveTo(C - side * 6, 28, C + side * 6, 28)
    ctx.stroke()
    head(C + side * 12, 28, side * (Math.PI / 2))
  }
}

function slash(ctx: Ctx): void {
  ctx.beginPath()
  ctx.moveTo(C - 20, C + 20)
  ctx.lineTo(C + 20, C - 20)
  ctx.lineWidth = 7
  ctx.strokeStyle = RED
  ctx.stroke()
}

function text(ctx: Ctx, value: string, color: string, size: number): void {
  ctx.fillStyle = color
  ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(value, C, C + 2)
}

function prohibitory(turn: 'up' | 'left' | 'right' | 'uturn') {
  return (ctx: Ctx) => {
    circle(ctx, '#ffffff', RED)
    arrow(ctx, INK, turn)
    slash(ctx)
  }
}

function mandatory(turns: ('up' | 'left' | 'right')[]) {
  return (ctx: Ctx) => {
    circle(ctx, BLUE, '#ffffff', 3)
    for (const turn of turns) arrow(ctx, '#ffffff', turn)
  }
}

function blueSquare(paint: (ctx: Ctx) => void) {
  return (ctx: Ctx) => {
    ctx.fillStyle = BLUE
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(4, 4, S - 8, S - 8, 6)
    ctx.fill()
    ctx.stroke()
    paint(ctx)
  }
}

const PAINTERS: Record<string, (ctx: Ctx, value?: string) => void> = {
  '2.1': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(C, 4)
    ctx.lineTo(S - 4, C)
    ctx.lineTo(C, S - 4)
    ctx.lineTo(4, C)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(C, 14)
    ctx.lineTo(S - 14, C)
    ctx.lineTo(C, S - 14)
    ctx.lineTo(14, C)
    ctx.closePath()
    ctx.fillStyle = '#f2c200'
    ctx.fill()
  },
  '2.4': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(5, 9)
    ctx.lineTo(S - 5, 9)
    ctx.lineTo(C, S - 6)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = RED
    ctx.lineWidth = 8
    ctx.lineJoin = 'round'
    ctx.fill()
    ctx.stroke()
  },
  '2.5': (ctx) => {
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + (i * Math.PI) / 4
      ctx.lineTo(C + (C - 3) * Math.cos(angle), C + (C - 3) * Math.sin(angle))
    }
    ctx.closePath()
    ctx.fillStyle = RED
    ctx.fill()
    text(ctx, 'STOP', '#ffffff', 17)
  },
  '3.1': (ctx) => {
    circle(ctx, RED, '#ffffff', 3)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(14, C - 6, S - 28, 12)
  },
  '3.2': (ctx) => circle(ctx, '#ffffff', RED),
  '3.18.1': prohibitory('right'),
  '3.18.2': prohibitory('left'),
  '3.19': prohibitory('uturn'),
  'no-straight': prohibitory('up'),
  '3.20': (ctx) => {
    circle(ctx, '#ffffff', RED)
    text(ctx, '⇈', INK, 30)
  },
  '3.24': (ctx, value) => {
    circle(ctx, '#ffffff', RED, 9)
    text(ctx, value ?? '', INK, (value?.length ?? 0) > 2 ? 22 : 28)
  },
  '3.27': (ctx) => {
    circle(ctx, BLUE, RED)
    ctx.beginPath()
    ctx.moveTo(C - 18, C - 18)
    ctx.lineTo(C + 18, C + 18)
    ctx.moveTo(C + 18, C - 18)
    ctx.lineTo(C - 18, C + 18)
    ctx.lineWidth = 7
    ctx.strokeStyle = RED
    ctx.stroke()
  },
  '3.28': (ctx) => {
    circle(ctx, BLUE, RED)
    ctx.beginPath()
    ctx.moveTo(C - 18, C - 18)
    ctx.lineTo(C + 18, C + 18)
    ctx.lineWidth = 7
    ctx.strokeStyle = RED
    ctx.stroke()
  },
  '4.1.1': mandatory(['up']),
  '4.1.2': mandatory(['right']),
  '4.1.3': mandatory(['left']),
  '4.1.4': mandatory(['up', 'right']),
  '4.1.5': mandatory(['up', 'left']),
  '4.1.6': mandatory(['left', 'right']),
  '5.16': blueSquare((ctx) => text(ctx, 'А', '#ffffff', 34)),
  '5.19.1': blueSquare((ctx) => {
    ctx.beginPath()
    ctx.moveTo(C, 14)
    ctx.lineTo(S - 14, S - 16)
    ctx.lineTo(14, S - 16)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }),
  '5.20': blueSquare((ctx) => {
    ctx.beginPath()
    ctx.moveTo(14, C + 12)
    ctx.quadraticCurveTo(C, C - 22, S - 14, C + 12)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }),
}
PAINTERS['1.17'] = PAINTERS['5.20']!
PAINTERS['5.19.2'] = PAINTERS['5.19.1']!

function tablet(ctx: Ctx, code: string): void {
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(4, 14, S - 8, S - 28, 6)
  ctx.fill()
  ctx.stroke()
  text(ctx, code.length > 7 ? `${code.slice(0, 6)}…` : code, INK, code.length > 4 ? 15 : 20)
}

/** Номер и значение из имени картинки «sign:3.24[40]». */
export function parseSignImage(id: string): { code: string; value?: string } | null {
  const match = /^sign:([^[]+)(?:\[(.*)\])?$/.exec(id)
  return match ? { code: match[1]!, value: match[2] } : null
}

export function ensureSignImage(map: MlMap, id: string): void {
  if (map.hasImage(id)) return
  const parsed = parseSignImage(id)
  if (!parsed) return
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const painter = PAINTERS[parsed.code]
  if (painter) painter(ctx, parsed.value)
  else tablet(ctx, parsed.code)
  map.addImage(id, ctx.getImageData(0, 0, S, S), { pixelRatio: 2 })
}
