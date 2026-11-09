import { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap, MercatorCoordinate } from 'maplibre-gl'

import type { Projector } from '@/core/geo'
import type { Car } from '@/sim/micro'

/**
 * Машины в 3D: свой слой WebGL с инстансингом, чтобы рисовать тысячи машин за один вызов.
 * Координаты хранятся в метрах от центра участка: в единицах Меркатора
 * точности float32 не хватило бы, и машины дрожали бы при движении.
 */

const PART_BODY = 0
const PART_GLASS = 1
const PART_TIRE = 2
const PART_TAIL = 3
const PART_HEAD = 4
const PART_SHADOW = 5

const INSTANCE_FLOATS = 11
const MIN_EXAGGERATE_ZOOM = 16.5
const MAX_EXAGGERATE = 4
const BRAKE_DECEL = -0.8

type MeshBuilder = { data: number[] }

function pushQuad(
  mesh: MeshBuilder,
  a: number[],
  b: number[],
  c: number[],
  d: number[],
  part: number,
): void {
  const ux = b[0]! - a[0]!
  const uy = b[1]! - a[1]!
  const uz = b[2]! - a[2]!
  const vx = d[0]! - a[0]!
  const vy = d[1]! - a[1]!
  const vz = d[2]! - a[2]!
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz) || 1
  nx /= length
  ny /= length
  nz /= length
  for (const point of [a, b, c, a, c, d]) {
    mesh.data.push(point[0]!, point[1]!, point[2]!, nx, ny, nz, part)
  }
}

/** Параллелепипед, у которого верх может быть уже низа: так получаются стойки кабины. */
function pushBox(
  mesh: MeshBuilder,
  x: [number, number],
  y: [number, number],
  z: [number, number],
  part: number,
  top?: { x?: [number, number]; y?: [number, number] },
): void {
  const tx = top?.x ?? x
  const ty = top?.y ?? y
  const b = (px: number, py: number) => [px, py, z[0]]
  const t = (px: number, py: number) => [px, py, z[1]]
  pushQuad(mesh, t(tx[0], ty[0]), t(tx[1], ty[0]), t(tx[1], ty[1]), t(tx[0], ty[1]), part)
  pushQuad(mesh, b(x[0], y[0]), b(x[1], y[0]), t(tx[1], ty[0]), t(tx[0], ty[0]), part)
  pushQuad(mesh, b(x[1], y[1]), b(x[0], y[1]), t(tx[0], ty[1]), t(tx[1], ty[1]), part)
  pushQuad(mesh, b(x[0], y[1]), b(x[0], y[0]), t(tx[0], ty[0]), t(tx[0], ty[1]), part)
  pushQuad(mesh, b(x[1], y[0]), b(x[1], y[1]), t(tx[1], ty[1]), t(tx[1], ty[0]), part)
}

function pushShadow(mesh: MeshBuilder): void {
  const e = 0.56
  pushQuad(mesh, [-e, -e, 0.005], [e, -e, 0.005], [e, e, 0.005], [-e, e, 0.005], PART_SHADOW)
}

function pushWheels(mesh: MeshBuilder, front: number, back: number): void {
  for (const x of [-0.52, 0.42]) {
    for (const y of [front, back]) {
      pushBox(mesh, [x, x + 0.1], [y - 0.07, y + 0.07], [0, 0.22], PART_TIRE)
    }
  }
}

function carMesh(): number[] {
  const mesh: MeshBuilder = { data: [] }
  pushShadow(mesh)
  pushWheels(mesh, 0.31, -0.31)
  // Кузов и более низкий капот
  pushBox(mesh, [-0.5, 0.5], [-0.5, 0.26], [0.14, 0.58], PART_BODY)
  pushBox(mesh, [-0.5, 0.5], [0.26, 0.5], [0.14, 0.5], PART_BODY, { y: [0.26, 0.47] })
  // Кабина: стёкла со скошенными стойками и крыша
  pushBox(mesh, [-0.46, 0.46], [-0.42, 0.22], [0.58, 0.95], PART_GLASS, { x: [-0.4, 0.4], y: [-0.31, 0.05] })
  pushBox(mesh, [-0.41, 0.41], [-0.32, 0.06], [0.95, 1], PART_BODY)
  // Фары и стоп-сигналы
  pushBox(mesh, [-0.46, -0.2], [-0.505, -0.49], [0.38, 0.52], PART_TAIL)
  pushBox(mesh, [0.2, 0.46], [-0.505, -0.49], [0.38, 0.52], PART_TAIL)
  pushBox(mesh, [-0.46, -0.2], [0.49, 0.505], [0.3, 0.42], PART_HEAD)
  pushBox(mesh, [0.2, 0.46], [0.49, 0.505], [0.3, 0.42], PART_HEAD)
  return mesh.data
}

function bigMesh(): number[] {
  const mesh: MeshBuilder = { data: [] }
  pushShadow(mesh)
  pushWheels(mesh, 0.32, -0.3)
  pushBox(mesh, [-0.5, 0.5], [-0.5, 0.5], [0.1, 0.97], PART_BODY)
  pushBox(mesh, [-0.505, 0.505], [-0.46, 0.46], [0.5, 0.82], PART_GLASS)
  pushBox(mesh, [-0.42, 0.42], [0.49, 0.507], [0.45, 0.88], PART_GLASS)
  pushBox(mesh, [-0.46, -0.24], [-0.507, -0.49], [0.18, 0.3], PART_TAIL)
  pushBox(mesh, [0.24, 0.46], [-0.507, -0.49], [0.18, 0.3], PART_TAIL)
  pushBox(mesh, [-0.46, -0.24], [0.49, 0.507], [0.16, 0.26], PART_HEAD)
  pushBox(mesh, [0.24, 0.46], [0.49, 0.507], [0.16, 0.26], PART_HEAD)
  return mesh.data
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aPart;
layout(location = 3) in vec4 iPose;
layout(location = 4) in vec3 iSize;
layout(location = 5) in vec4 iColor;
uniform mat4 uMatrix;
uniform float uExaggerate;
out vec3 vColor;
out float vAlpha;

void main() {
  float s = sin(iPose.w);
  float c = cos(iPose.w);
  vec3 size = vec3(iSize.y, iSize.x, iSize.z) * uExaggerate;
  vec3 local = aPosition * size;
  vec3 world = vec3(local.x * c + local.y * s, -local.x * s + local.y * c, local.z) + iPose.xyz;
  vec3 normal = vec3(aNormal.x * c + aNormal.y * s, -aNormal.x * s + aNormal.y * c, aNormal.z);
  gl_Position = uMatrix * vec4(world, 1.0);

  vec3 sun = normalize(vec3(0.45, -0.35, 0.85));
  float light = 0.52 + 0.48 * max(dot(normal, sun), 0.0);
  float part = aPart + 0.5;
  vec3 color;
  vAlpha = 1.0;
  if (part < 1.0) {
    color = iColor.rgb * light;
  } else if (part < 2.0) {
    color = vec3(0.07, 0.09, 0.12) + vec3(0.16, 0.2, 0.26) * pow(max(normal.z, 0.0), 2.0);
  } else if (part < 3.0) {
    color = vec3(0.04);
  } else if (part < 4.0) {
    color = mix(vec3(0.34, 0.03, 0.04), vec3(1.0, 0.1, 0.08), iColor.a);
  } else if (part < 5.0) {
    color = vec3(0.95, 0.93, 0.78);
  } else {
    color = vec3(0.0);
    vAlpha = 0.34;
  }
  vColor = color;
}`

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  fragColor = vec4(vColor * vAlpha, vAlpha);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Шейдер машин не собрался: ${gl.getShaderInfoLog(shader)}`)
  }
  return shader
}

interface MeshBuffers {
  vao: WebGLVertexArrayObject
  vertices: WebGLBuffer
  instances: WebGLBuffer
  vertexCount: number
  capacity: number
  data: Float32Array
}

const STYLE_TINTS = {
  calm: [0.29, 0.64, 0.78],
  normal: [0.62, 0.64, 0.68],
  aggressive: [0.86, 0.2, 0.18],
} as const

/** Цвет машины по доле от разрешённой скорости: красный значит, что машина стоит. */
function speedColor(ratio: number, out: number[]): void {
  const t = Math.min(1, Math.max(0, ratio))
  if (t < 0.5) {
    const k = t / 0.5
    out[0] = 0.82
    out[1] = 0.16 + (0.74 - 0.16) * k
    out[2] = 0.17 + (0.2 - 0.17) * k
  } else {
    const k = (t - 0.5) / 0.5
    out[0] = 0.82 + (0.2 - 0.82) * k
    out[1] = 0.74 + (0.72 - 0.74) * k
    out[2] = 0.2 + (0.68 - 0.2) * k
  }
}

export class CarLayer implements CustomLayerInterface {
  readonly id = 'cars'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  cars: Car[] = []
  alpha = 1
  colorMode: 'fleet' | 'speed' | 'style' = 'fleet'
  limitOf: (car: Car) => number = () => 14

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private uMatrix: WebGLUniformLocation | null = null
  private uExaggerate: WebGLUniformLocation | null = null
  private meshes: MeshBuffers[] = []
  private readonly model = new Float64Array(16)
  private readonly matrix = new Float32Array(16)
  private readonly tint = [0, 0, 0]

  constructor(projector: Projector) {
    const origin = MercatorCoordinate.fromLngLat([projector.lon0, projector.lat0])
    const unit = origin.meterInMercatorCoordinateUnits()
    // Метры вокруг центра участка в единицы Меркатора: север в Меркаторе направлен к нулю
    this.model.set([unit, 0, 0, 0, 0, -unit, 0, 0, 0, 0, unit, 0, origin.x, origin.y, 0, 1])
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext): void {
    this.map = map
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Программа машин не собралась: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    this.uMatrix = gl.getUniformLocation(program, 'uMatrix')
    this.uExaggerate = gl.getUniformLocation(program, 'uExaggerate')
    this.meshes = [this.createMesh(gl, carMesh()), this.createMesh(gl, bigMesh())]
  }

  private createMesh(gl: WebGL2RenderingContext, vertices: number[]): MeshBuffers {
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)

    const vertexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)
    const stride = 7 * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24)

    const instances = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, instances)
    const instanceStride = INSTANCE_FLOATS * 4
    const layout: [number, number, number][] = [
      [3, 4, 0],
      [4, 3, 16],
      [5, 4, 28],
    ]
    for (const [location, size, offset] of layout) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, instanceStride, offset)
      gl.vertexAttribDivisor(location, 1)
    }
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    return {
      vao,
      vertices: vertexBuffer,
      instances,
      vertexCount: vertices.length / 7,
      capacity: 0,
      data: new Float32Array(0),
    }
  }

  render(gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput): void {
    const context = gl as WebGL2RenderingContext
    if (!this.program || !this.map || this.cars.length === 0) return

    const counts = [0, 0]
    for (const car of this.cars) counts[car.mesh]!++
    this.meshes.forEach((mesh, index) => {
      const needed = counts[index]! * INSTANCE_FLOATS
      if (mesh.data.length < needed) mesh.data = new Float32Array(Math.max(needed * 2, 256 * INSTANCE_FLOATS))
    })

    const cursors = [0, 0]
    const alpha = this.alpha
    for (const car of this.cars) {
      if (!car.placed) continue
      const mesh = this.meshes[car.mesh]!
      const data = mesh.data
      let i = cursors[car.mesh]!
      let difference = car.heading - car.prevHeading
      if (difference > Math.PI) difference -= Math.PI * 2
      else if (difference < -Math.PI) difference += Math.PI * 2
      data[i++] = car.prevX + (car.x - car.prevX) * alpha
      data[i++] = car.prevY + (car.y - car.prevY) * alpha
      data[i++] = car.prevZ + (car.z - car.prevZ) * alpha
      data[i++] = car.prevHeading + difference * alpha
      data[i++] = car.length
      data[i++] = car.width
      data[i++] = car.height
      if (this.colorMode === 'speed') {
        speedColor(car.v / this.limitOf(car), this.tint)
        data[i++] = this.tint[0]!
        data[i++] = this.tint[1]!
        data[i++] = this.tint[2]!
      } else if (this.colorMode === 'style' && car.lineId === null) {
        const tint = STYLE_TINTS[car.style]
        data[i++] = tint[0]
        data[i++] = tint[1]
        data[i++] = tint[2]
      } else {
        data[i++] = car.color[0]
        data[i++] = car.color[1]
        data[i++] = car.color[2]
      }
      data[i++] = car.acc < BRAKE_DECEL || car.v < 0.3 ? 1 : 0
      cursors[car.mesh] = i
    }

    multiply(this.matrix, args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>, this.model)

    context.useProgram(this.program)
    context.uniformMatrix4fv(this.uMatrix, false, this.matrix)
    const zoom = this.map.getZoom()
    context.uniform1f(this.uExaggerate, Math.min(MAX_EXAGGERATE, Math.max(1, 2 ** (MIN_EXAGGERATE_ZOOM - zoom))))
    context.enable(context.DEPTH_TEST)
    context.depthFunc(context.LEQUAL)
    context.depthMask(true)
    context.disable(context.CULL_FACE)
    context.enable(context.BLEND)
    context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA)

    this.meshes.forEach((mesh, index) => {
      const used = cursors[index]!
      if (used === 0) return
      context.bindVertexArray(mesh.vao)
      context.bindBuffer(context.ARRAY_BUFFER, mesh.instances)
      context.bufferData(context.ARRAY_BUFFER, mesh.data.subarray(0, used), context.DYNAMIC_DRAW)
      context.drawArraysInstanced(context.TRIANGLES, 0, mesh.vertexCount, used / INSTANCE_FLOATS)
    })
    context.bindVertexArray(null)
    context.bindBuffer(context.ARRAY_BUFFER, null)
  }

  onRemove(_map: MlMap, gl: WebGL2RenderingContext): void {
    for (const mesh of this.meshes) {
      gl.deleteVertexArray(mesh.vao)
      gl.deleteBuffer(mesh.vertices)
      gl.deleteBuffer(mesh.instances)
    }
    if (this.program) gl.deleteProgram(this.program)
    this.meshes = []
    this.program = null
    this.map = null
  }
}

function multiply(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[row + 4]! * b[column * 4 + 1]! +
        a[row + 8]! * b[column * 4 + 2]! +
        a[row + 12]! * b[column * 4 + 3]!
    }
  }
}
