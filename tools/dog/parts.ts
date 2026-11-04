/** Separate meshes: eyes, nose and tongue (each a child of a bone, not skinned). */
import { type DogParams, VARIANTS, jawQ } from './dogModel'
import { type Q, type V3, add, qEuler, qRotate, sub } from './math'
import { type Mesh, ensureOutward, meshSdf, vertexNormals } from './mesher'
import { compile, ellipsoid, subtract, union } from './sdf'

export interface PartMesh extends Mesh {
  normals: Float32Array
  /** Optional per-vertex RGBA (0..1). */
  colors?: Float32Array
  /** Morph targets: name -> position deltas (normals deltas optional). */
  morphs: Record<string, { dp: Float32Array; dn?: Float32Array }>
}

export interface Part {
  name: string
  parentBone: string
  /** Node translation relative to the parent bone joint (rest pose). */
  t: V3
  q: Q
  mesh: PartMesh
  material: 'eye' | 'nose' | 'tongue'
}

// ---------- eyes ----------

function sphere(r: number, wSeg: number, hSeg: number): Mesh {
  const pos: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= hSeg; j++) {
    const v = j / hSeg
    const phi = v * Math.PI
    for (let i = 0; i <= wSeg; i++) {
      const u = i / wSeg
      const th = u * Math.PI * 2
      // pole along local y so the front (+z) gets an even ring distribution
      pos.push(
        -r * Math.cos(th) * Math.sin(phi),
        r * Math.cos(phi),
        r * Math.sin(th) * Math.sin(phi),
      )
    }
  }
  for (let j = 0; j < hSeg; j++)
    for (let i = 0; i < wSeg; i++) {
      const a = j * (wSeg + 1) + i
      const b = a + wSeg + 1
      if (j !== 0) idx.push(a, b, a + 1)
      if (j !== hSeg - 1) idx.push(a + 1, b, b + 1)
    }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

/**
 * Eye ball in eye-local space (+z = looking direction). Morphs squash the ball into
 * a closed-eye line (blink), a happy arc (^) and a droopy sad shape.
 */
/** Eye ball scale (x, y, z); the eye shader undoes it to draw the iris. */
export const EYE_SCALE: V3 = [1, 1.1, 0.55]

function eyeMesh(r: number, s: 1 | -1): PartMesh {
  const m = ensureOutward(sphere(r, 28, 18))
  // a slightly tall, flattened lens: sits on the face instead of bulging out
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i + 1] *= EYE_SCALE[1]
    m.positions[i + 2] *= EYE_SCALE[2]
  }
  const n = vertexNormals(m.positions, m.indices)
  const nv = m.positions.length / 3
  const blink = new Float32Array(nv * 3)
  const happy = new Float32Array(nv * 3)
  const sad = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) {
    const x = m.positions[i * 3]
    const y = m.positions[i * 3 + 1]
    const z = m.positions[i * 3 + 2]
    const u = x / r
    // closed: a thin, slightly smiling line
    const by = -0.28 * r + 0.22 * r * u * u + y * 0.1
    blink.set([x * 1.04 - x, by - y, z * 0.9 - z], i * 3)
    // happy: an upward arc
    const hy = 0.05 * r + 0.38 * r * (1 - u * u) - 0.3 * r + y * 0.16
    happy.set([x * 1.02 - x, hy - y, z * 0.9 - z], i * 3)
    // sad: upper lid slanting down towards the outer corner
    const uOut = u * s
    const lid = r * (0.45 - 0.42 * uOut)
    sad.set([0, Math.min(y, lid) - y, 0], i * 3)
  }
  return {
    ...m,
    normals: n,
    morphs: { blink: { dp: blink }, happy_eyes: { dp: happy }, sad_brows: { dp: sad } },
  }
}

// ---------- nose ----------

const NOSE_SCALE = 1.12
const ns = (v: V3): V3 => [v[0] * NOSE_SCALE, v[1] * NOSE_SCALE, v[2] * NOSE_SCALE]

function noseSdf() {
  return subtract(
    0.008,
    union(
      0.03,
      ellipsoid('nose', '', [0, 0, 0], ns([0.068, 0.046, 0.044])),
      ellipsoid('nose_low', '', ns([0, -0.02, 0.004]), ns([0.042, 0.034, 0.036])),
    ),
    union(
      0,
      ellipsoid('nostril_L', '', ns([0.027, -0.008, 0.04]), ns([0.015, 0.009, 0.014])),
      ellipsoid('nostril_R', '', ns([-0.027, -0.008, 0.04]), ns([0.015, 0.009, 0.014])),
    ),
  )
}

async function noseMesh(): Promise<PartMesh> {
  const f = compile(noseSdf())
  const m = await meshSdf(
    f,
    { xMax: 0.1, y: [-0.08, 0.065], z: [-0.065, 0.065], h: 0.0035 },
    { targetTris: 900 },
  )
  const n = vertexNormals(m.positions, m.indices)
  const nv = m.positions.length / 3
  const colors = new Float32Array(nv * 4)
  for (let i = 0; i < nv; i++) {
    const x = Math.abs(m.positions[i * 3])
    const y = m.positions[i * 3 + 1]
    const z = m.positions[i * 3 + 2]
    // darker inside the nostrils
    const d = Math.hypot(
      (x / NOSE_SCALE - 0.027) / 0.02,
      (y / NOSE_SCALE + 0.008) / 0.014,
      (z / NOSE_SCALE - 0.04) / 0.02,
    )
    const shade = d < 1 ? 0.35 + 0.65 * d * d : 1
    colors.set([shade, shade, shade, 1], i * 4)
  }
  return { ...m, normals: n, colors, morphs: {} }
}

// ---------- tongue ----------

async function tongueMesh(r: V3): Promise<PartMesh> {
  const f = compile(
    subtract(
      0.006,
      ellipsoid('tongue', '', [0, 0, 0], r),
      ellipsoid('groove', '', [0, r[1] * 1.1, 0.01], [0.007, 0.008, r[2] * 0.75]),
    ),
  )
  const m = await meshSdf(
    f,
    {
      xMax: r[0] + 0.01,
      y: [-r[1] - 0.01, r[1] + 0.01],
      z: [-r[2] - 0.01, r[2] + 0.01],
      h: 0.0028,
    },
    { targetTris: 700 },
  )
  return { ...m, normals: vertexNormals(m.positions, m.indices), morphs: {} }
}

// ---------- assembly ----------

export async function buildParts(
  p: DogParams,
  bonePos: (name: string) => V3,
): Promise<Part[]> {
  const head = bonePos('head')
  const jaw = bonePos('jaw')
  const parts: Part[] = []
  for (const s of [1, -1] as const) {
    const c: V3 = [p.eye.c[0] * s, p.eye.c[1], p.eye.c[2]]
    parts.push({
      name: s > 0 ? 'eye_L' : 'eye_R',
      parentBone: 'head',
      t: sub(c, head),
      q: qEuler(p.eye.pitch, p.eye.yaw * s, 0),
      mesh: eyeMesh(p.eye.r, s),
      material: 'eye',
    })
  }

  // nose: follows the snout morphs
  const nose = await noseMesh()
  for (const name of ['snout_long', 'snout_short']) {
    const d = sub(VARIANTS[name](p).nose.c, p.nose.c)
    const dp = new Float32Array(nose.positions.length)
    for (let i = 0; i < dp.length; i += 3) dp.set(d, i)
    nose.morphs[name] = { dp }
  }
  parts.push({
    name: 'nose',
    parentBone: 'head',
    t: sub(p.nose.c, head),
    q: qEuler(p.nose.pitch, 0, 0),
    mesh: nose,
    material: 'nose',
  })

  // tongue: rides on the jaw; follows snout morphs and the mouth_open morph
  const tongue = await tongueMesh(p.tongue.r)
  const tOff = sub(p.tongue.c, jaw)
  const nv = tongue.positions.length / 3
  for (const name of ['snout_long', 'snout_short']) {
    const d = sub(VARIANTS[name](p).tongue.c, p.tongue.c)
    const dp = new Float32Array(nv * 3)
    for (let i = 0; i < nv; i++) dp.set(d, i * 3)
    tongue.morphs[name] = { dp }
  }
  {
    const q = jawQ(VARIANTS.mouth_open(p))
    const dp = new Float32Array(nv * 3)
    const dn = new Float32Array(nv * 3)
    for (let i = 0; i < nv; i++) {
      const v: V3 = [
        tongue.positions[i * 3],
        tongue.positions[i * 3 + 1],
        tongue.positions[i * 3 + 2],
      ]
      const w = add(qRotate(q, add(v, tOff)), [-tOff[0], -tOff[1], -tOff[2]])
      dp.set(sub(w, v), i * 3)
      const nn: V3 = [
        tongue.normals[i * 3],
        tongue.normals[i * 3 + 1],
        tongue.normals[i * 3 + 2],
      ]
      dn.set(sub(qRotate(q, nn), nn), i * 3)
    }
    tongue.morphs.mouth_open = { dp, dn }
  }
  parts.push({
    name: 'tongue',
    parentBone: 'jaw',
    t: tOff,
    q: [0, 0, 0, 1],
    mesh: tongue,
    material: 'tongue',
  })
  return parts
}
