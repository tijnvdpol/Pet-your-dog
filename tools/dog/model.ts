import {
  ellipsoid,
  mirror,
  orientedEllipsoid,
  roundCone,
  smax,
  smin,
  smoothstep,
  type Sdf,
  type V3,
} from './sdf.ts'

/* ------------------------------------------------------------------ *
 * The dog, standing, facing +Z, +Y up, +X = the dog's left. Roughly metres.
 * Stylised: big head, short round snout, thick otter tail, stout legs.
 * ------------------------------------------------------------------ */

// --- parts (right side only for mirrored parts; mirror() handles the rest) ---
const chest = ellipsoid([0, 0.4, 0.12], [0.175, 0.19, 0.23])
const hips = ellipsoid([0, 0.4, -0.14], [0.16, 0.17, 0.19])
const torso: Sdf = (x, y, z) => smin(chest(x, y, z), hips(x, y, z), 0.14)

const neck = roundCone([0, 0.48, 0.2], [0, 0.6, 0.37], 0.12, 0.115)
const cranium = ellipsoid([0, 0.64, 0.44], [0.145, 0.13, 0.14])
const cheek = mirror(ellipsoid([0.085, 0.585, 0.49], [0.06, 0.06, 0.075]))
const snoutUpper = ellipsoid([0, 0.6, 0.575], [0.07, 0.055, 0.085])
const jaw = ellipsoid([0, 0.565, 0.55], [0.06, 0.04, 0.08])
const noseShape = ellipsoid([0, 0.622, 0.652], [0.05, 0.034, 0.036])

const frontLeg = mirror((x, y, z) => {
  const upper = roundCone([0.1, 0.35, 0.16], [0.1, 0.2, 0.15], 0.078, 0.064)(x, y, z)
  const lower = roundCone([0.1, 0.2, 0.15], [0.1, 0.09, 0.165], 0.064, 0.054)(x, y, z)
  const paw = ellipsoid([0.1, 0.04, 0.18], [0.06, 0.042, 0.077])(x, y, z)
  return smin(Math.min(upper, lower), paw, 0.035)
})
const hindLeg = mirror((x, y, z) => {
  const thigh = roundCone([0.105, 0.36, -0.2], [0.105, 0.22, -0.13], 0.088, 0.066)(x, y, z)
  const shin = roundCone([0.105, 0.22, -0.13], [0.102, 0.11, -0.2], 0.066, 0.054)(x, y, z)
  const meta = roundCone([0.102, 0.11, -0.2], [0.1, 0.05, -0.19], 0.054, 0.05)(x, y, z)
  const paw = ellipsoid([0.1, 0.04, -0.17], [0.06, 0.042, 0.08])(x, y, z)
  return smin(Math.min(thigh, shin, meta), paw, 0.035)
})

/** Thick "otter" tail: widest in the middle, round tip. */
const TAIL_PTS: { p: V3; r: number }[] = [
  { p: [0, 0.43, -0.3], r: 0.082 },
  { p: [0, 0.45, -0.41], r: 0.086 },
  { p: [0, 0.48, -0.52], r: 0.076 },
  { p: [0, 0.52, -0.61], r: 0.057 },
  { p: [0, 0.56, -0.67], r: 0.038 },
]
const tailParts = TAIL_PTS.slice(1).map((t, i) => roundCone(TAIL_PTS[i].p, t.p, TAIL_PTS[i].r, t.r))
export const tail: Sdf = (x, y, z) => {
  // segments share end radii, so a hard min is seamless (smin would bulge at every joint)
  let d = tailParts[0](x, y, z)
  for (let i = 1; i < tailParts.length; i++) d = Math.min(d, tailParts[i](x, y, z))
  return d
}

/** Soft hanging ear. */
export const ears = mirror(orientedEllipsoid([0.158, 0.615, 0.41], [0.02, 0.1, 0.07], 0, 0, 0.16))

/** Mouth: a thin slit that cuts through the snout sides, so the jaw can open. */
export const mouthCavity = ellipsoid([0, 0.583, 0.56], [0.1, 0.0085, 0.09])
export const tongue = ellipsoid([0, 0.563, 0.55], [0.028, 0.0085, 0.045])
export const noseOnly = noseShape

export function dogSdf(): Sdf {
  return (x, y, z) => {
    let d = torso(x, y, z)
    d = smin(d, frontLeg(x, y, z), 0.1)
    d = smin(d, hindLeg(x, y, z), 0.1)
    d = smin(d, neck(x, y, z), 0.09)
    let head = smin(cranium(x, y, z), cheek(x, y, z), 0.05)
    head = smin(head, snoutUpper(x, y, z), 0.06)
    head = smin(head, jaw(x, y, z), 0.04)
    head = smin(head, noseShape(x, y, z), 0.012)
    d = smin(d, head, 0.06)
    d = smin(d, tail(x, y, z), 0.07)
    d = smin(d, ears(x, y, z), 0.025)
    d = smax(d, -mouthCavity(x, y, z), 0.006)
    d = smin(d, tongue(x, y, z), 0.008)
    return d
  }
}

export const BOUNDS_MIN: V3 = [-0.3, -0.01, -0.86]
export const BOUNDS_MAX: V3 = [0.3, 0.82, 0.72]

/* ------------------------------------------------------------------ *
 * Skeleton (joint positions are world coordinates in the rest pose;
 * all rest rotations are identity so bone axes == world axes).
 * ------------------------------------------------------------------ */
export interface BoneDef {
  name: string
  parent: string | null
  at: V3
  /** Segment used to measure distance for skin weights. */
  seg: [V3, V3]
  /** Subtracted from the distance so thick bones (spine) can claim the surface around them. */
  inflate: number
  side?: 'L' | 'R'
}

const bone = (name: string, parent: string | null, at: V3, a: V3, b: V3, inflate = 0, side?: 'L' | 'R'): BoneDef => ({
  name,
  parent,
  at,
  seg: [a, b],
  inflate,
  side,
})

export function skeleton(): BoneDef[] {
  const bones: BoneDef[] = [
    bone('root', null, [0, 0, 0], [0, 0.3, 0], [0, 0.3, 0.0001], 0),
    bone('pelvis', 'root', [0, 0.4, -0.2], [0, 0.4, -0.3], [0, 0.41, -0.1], 0.13),
    bone('spine1', 'pelvis', [0, 0.42, -0.02], [0, 0.41, -0.1], [0, 0.43, 0.06], 0.14),
    bone('spine2', 'spine1', [0, 0.45, 0.12], [0, 0.43, 0.06], [0, 0.46, 0.2], 0.14),
    bone('neck', 'spine2', [0, 0.5, 0.25], [0, 0.48, 0.2], [0, 0.58, 0.37], 0.06),
    bone('head', 'neck', [0, 0.58, 0.37], [0, 0.6, 0.4], [0, 0.62, 0.56], 0.07),
    bone('jaw', 'head', [0, 0.58, 0.47], [0, 0.565, 0.5], [0, 0.56, 0.62], 0),
  ]
  for (const [s, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    bones.push(bone(`ear_${s}_0`, 'head', [0.125 * sx, 0.7, 0.41], [0.13 * sx, 0.7, 0.41], [0.16 * sx, 0.62, 0.405], 0, s))
    bones.push(bone(`ear_${s}_1`, `ear_${s}_0`, [0.16 * sx, 0.62, 0.405], [0.16 * sx, 0.62, 0.405], [0.175 * sx, 0.53, 0.4], 0, s))
  }
  const T = TAIL_PTS.map((t) => t.p)
  const tipEnd: V3 = [0, 0.59, -0.71]
  T.forEach((p, i) => {
    bones.push(bone(`tail_${i}`, i === 0 ? 'pelvis' : `tail_${i - 1}`, p, p, i < 4 ? T[i + 1] : tipEnd, 0.02))
  })
  for (const [s, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const X = (x: number): number => x * sx
    bones.push(bone(`hind_${s}_thigh`, 'pelvis', [X(0.105), 0.37, -0.2], [X(0.105), 0.37, -0.2], [X(0.105), 0.22, -0.13], 0.03, s))
    bones.push(bone(`hind_${s}_shin`, `hind_${s}_thigh`, [X(0.105), 0.22, -0.13], [X(0.105), 0.22, -0.13], [X(0.102), 0.11, -0.2], 0.015, s))
    bones.push(bone(`hind_${s}_meta`, `hind_${s}_shin`, [X(0.102), 0.11, -0.2], [X(0.102), 0.11, -0.2], [X(0.1), 0.05, -0.19], 0.01, s))
    bones.push(bone(`hind_${s}_foot`, `hind_${s}_meta`, [X(0.1), 0.05, -0.19], [X(0.1), 0.05, -0.19], [X(0.1), 0.035, -0.12], 0.01, s))
    bones.push(bone(`front_${s}_upper`, 'spine2', [X(0.1), 0.36, 0.16], [X(0.1), 0.36, 0.16], [X(0.1), 0.2, 0.15], 0.03, s))
    bones.push(bone(`front_${s}_fore`, `front_${s}_upper`, [X(0.1), 0.2, 0.15], [X(0.1), 0.2, 0.15], [X(0.1), 0.09, 0.165], 0.015, s))
    bones.push(bone(`front_${s}_pastern`, `front_${s}_fore`, [X(0.1), 0.09, 0.165], [X(0.1), 0.09, 0.165], [X(0.1), 0.05, 0.17], 0.01, s))
    bones.push(bone(`front_${s}_foot`, `front_${s}_pastern`, [X(0.1), 0.05, 0.17], [X(0.1), 0.05, 0.17], [X(0.1), 0.035, 0.24], 0.01, s))
  }
  return bones
}

/* ------------------------------------------------------------------ *
 * Skin weights: inverse-distance to the bone segments, softened at
 * joints, restricted to the right body side for limbs/ears. Max 4 bones.
 * ------------------------------------------------------------------ */
function distToSeg(p: V3, a: V3, b: V3): number {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ap: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  const t = l2 < 1e-12 ? 0 : Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2))
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t)
}

export interface Skin {
  joints: Uint16Array
  weights: Float32Array
}

export function skinWeights(positions: Float32Array, bones: BoneDef[]): Skin {
  const n = positions.length / 3
  const joints = new Uint16Array(n * 4)
  const weights = new Float32Array(n * 4)
  const earOnly = ears
  const tailOnly = tail
  const jawIdx = bones.findIndex((b) => b.name === 'jaw')
  const headIdx = bones.findIndex((b) => b.name === 'head')
  const raw = new Float64Array(bones.length)
  for (let v = 0; v < n; v++) {
    const p: V3 = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]
    const earMember = smoothstep(0.012, -0.008, earOnly(p[0], p[1], p[2]))
    const tailMember = smoothstep(0.02, -0.01, tailOnly(p[0], p[1], p[2]))
    let sum = 0
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i]
      if (b.name === 'root' || i === jawIdx) {
        raw[i] = 0
        continue
      }
      let d = Math.max(distToSeg(p, b.seg[0], b.seg[1]) - b.inflate, 0.004)
      let w = 1 / Math.pow(d + 0.008, 4)
      if (b.side) {
        const sx = b.side === 'L' ? p[0] : -p[0]
        w *= smoothstep(-0.03, 0.03, sx)
        if (b.name.startsWith('ear_')) w *= earMember * earMember
      }
      if (b.name.startsWith('tail_')) w *= tailMember
      raw[i] = w
      sum += w
    }
    // the rest of an ear/tail vertex's weight falls to the head / pelvis automatically via normalisation
    if (sum <= 0) {
      raw[headIdx] = 1
      sum = 1
    }
    // jaw: lower lip + chin, below the mouth slit, in front of the cheek hinge
    const slitY = 0.583 - 0.006
    const jawAmt = smoothstep(slitY + 0.002, slitY - 0.012, p[1]) * smoothstep(0.47, 0.53, p[2]) * smoothstep(0.7, 0.62, p[1] + 0.0)
    const headShare = raw[headIdx] / sum
    raw[jawIdx] = jawAmt * headShare * sum
    raw[headIdx] -= raw[jawIdx]
    // pick top four
    const order = Array.from(raw.keys()).sort((a, b) => raw[b] - raw[a]).slice(0, 4)
    let ts = 0
    for (const i of order) ts += raw[i]
    order.forEach((bi, k) => {
      joints[v * 4 + k] = bi
      weights[v * 4 + k] = raw[bi] / ts
    })
  }
  return { joints, weights }
}

/* ------------------------------------------------------------------ *
 * Colour zones: soft masks evaluated at the final vertex positions.
 * ------------------------------------------------------------------ */
export interface Zones {
  secondary: number
  nose: number
  innerEar: number
  tongue: number
  mouth: number
}

export function zonesAt(p: V3, n: V3, earWeight: number): Zones {
  const [x, y, z] = p
  const muzzle = smoothstep(0.5, 0.58, z) * smoothstep(0.65, 0.61, y)
  const chestPatch = 1 - smoothstep(0.55, 1.0, Math.hypot(x / 0.14, (y - 0.33) / 0.17, (z - 0.3) / 0.15))
  const paws = smoothstep(0.12, 0.075, y)
  const noseD = noseOnly(x, y, z)
  const nose = smoothstep(0.012, -0.002, noseD)
  const mouthD = mouthCavity(x, y, z)
  const mouth = smoothstep(0.012, 0.003, mouthD)
  const tongueMask = smoothstep(0.008, 0.0, tongue(x, y, z)) * smoothstep(0.002, -0.004, mouthD - 0.002)
  const facesHead = smoothstep(-0.5, -0.8, n[0] * Math.sign(x || 1))
  const innerEar = smoothstep(0.6, 0.9, earWeight) * facesHead
  return {
    secondary: Math.max(muzzle, chestPatch * 0.9, paws),
    nose: Math.min(1, nose),
    innerEar,
    tongue: Math.min(1, tongueMask),
    mouth: Math.min(1, mouth) * (1 - Math.min(1, nose)),
  }
}
