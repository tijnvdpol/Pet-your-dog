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
 *
 * Anatomy targets (what makes a silhouette read as DOG and not otter):
 *  - square body: length chest->rump ~= height at the withers, deep chest, tucked waist
 *  - legs as long as the chest is deep; hind leg with a clear stifle + hock zig-zag
 *  - neck carried up at ~50 degrees, head high
 *  - long, boxy muzzle (about as long as the skull) with a pronounced stop
 *  - ears that hang from the back of the skull; tail thin-ish and carried up
 * ------------------------------------------------------------------ */

// --- torso: deep chest, narrower hips, waist tuck underneath ---
const chest = ellipsoid([0, 0.45, 0.12], [0.165, 0.165, 0.23])
const hips = ellipsoid([0, 0.465, -0.16], [0.145, 0.14, 0.19])
const torso: Sdf = (x, y, z) => smin(chest(x, y, z), hips(x, y, z), 0.12)
/** Waist tuck: carve a little off the belly in front of the hind legs. */
const tuck = ellipsoid([0, 0.2, -0.06], [0.2, 0.1, 0.12])

// --- neck and head ---
const neck = roundCone([0, 0.52, 0.2], [0, 0.72, 0.36], 0.125, 0.1)
const cranium = ellipsoid([0, 0.77, 0.43], [0.13, 0.118, 0.125])
const cheek = mirror(ellipsoid([0.065, 0.71, 0.5], [0.05, 0.05, 0.07]))
const snoutUpper = ellipsoid([0, 0.715, 0.6], [0.062, 0.05, 0.115])
const jaw = ellipsoid([0, 0.68, 0.585], [0.048, 0.032, 0.09])
const noseShape = ellipsoid([0, 0.725, 0.705], [0.05, 0.038, 0.036])

// --- legs (right side; mirror() adds the left) ---
const frontLeg = mirror((x, y, z) => {
  const upper = roundCone([0.1, 0.5, 0.17], [0.1, 0.3, 0.14], 0.075, 0.055)(x, y, z)
  const lower = roundCone([0.1, 0.3, 0.14], [0.1, 0.115, 0.165], 0.055, 0.042)(x, y, z)
  const paw = ellipsoid([0.1, 0.035, 0.195], [0.048, 0.036, 0.07])(x, y, z)
  return smin(Math.min(upper, lower), paw, 0.03)
})
const hindLeg = mirror((x, y, z) => {
  const thigh = roundCone([0.095, 0.5, -0.19], [0.1, 0.31, -0.13], 0.095, 0.06)(x, y, z) // down and forward to the stifle
  const shin = roundCone([0.1, 0.31, -0.13], [0.09, 0.17, -0.24], 0.06, 0.045)(x, y, z) // back to the hock
  const meta = roundCone([0.09, 0.17, -0.24], [0.09, 0.06, -0.21], 0.045, 0.04)(x, y, z)
  const paw = ellipsoid([0.09, 0.035, -0.185], [0.048, 0.036, 0.072])(x, y, z)
  return smin(Math.min(thigh, shin, meta), paw, 0.03)
})

/** Tail: shorter, carried up and back, thick at the root. */
const TAIL_PTS: { p: V3; r: number }[] = [
  { p: [0, 0.5, -0.3], r: 0.06 },
  { p: [0, 0.53, -0.4], r: 0.058 },
  { p: [0, 0.58, -0.48], r: 0.05 },
  { p: [0, 0.64, -0.54], r: 0.04 },
  { p: [0, 0.7, -0.575], r: 0.03 },
]
const tailParts = TAIL_PTS.slice(1).map((t, i) => roundCone(TAIL_PTS[i].p, t.p, TAIL_PTS[i].r, t.r))
export const tail: Sdf = (x, y, z) => {
  let d = tailParts[0](x, y, z)
  for (let i = 1; i < tailParts.length; i++) d = Math.min(d, tailParts[i](x, y, z))
  return d
}

/** Ear hanging from the back of the skull, flaring slightly outward. */
export const ears = mirror(orientedEllipsoid([0.16, 0.76, 0.39], [0.016, 0.11, 0.08], 0.1, 0, 0.45))

export const mouthCavity = ellipsoid([0, 0.69, 0.6], [0.1, 0.0085, 0.1])
export const tongue = ellipsoid([0, 0.672, 0.59], [0.028, 0.0085, 0.05])
export const noseOnly = noseShape
export const MOUTH_LINE_Y = 0.69

/** A real mouth slit needs a high-poly mesh; the low-poly look draws the mouth as a dark line instead. */
export const MOUTH_CUT = process.env.DOG_MOUTH === '1'

export function dogSdf(): Sdf {
  return (x, y, z) => {
    let d = smax(torso(x, y, z), -tuck(x, y, z), 0.08)
    d = smin(d, frontLeg(x, y, z), 0.09)
    d = smin(d, hindLeg(x, y, z), 0.09)
    d = smin(d, neck(x, y, z), 0.09)
    let head = smin(cranium(x, y, z), cheek(x, y, z), 0.05)
    head = smin(head, snoutUpper(x, y, z), 0.035) // small k keeps the stop visible
    head = smin(head, jaw(x, y, z), 0.04)
    head = smin(head, noseShape(x, y, z), 0.012)
    d = smin(d, head, 0.06)
    d = smin(d, tail(x, y, z), 0.06)
    d = smin(d, ears(x, y, z), 0.025)
    if (MOUTH_CUT) {
      d = smax(d, -mouthCavity(x, y, z), 0.006)
      d = smin(d, tongue(x, y, z), 0.008)
    }
    return d
  }
}

export const BOUNDS_MIN: V3 = [-0.3, -0.01, -0.7]
export const BOUNDS_MAX: V3 = [0.3, 0.96, 0.78]

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
    bone('pelvis', 'root', [0, 0.465, -0.18], [0, 0.46, -0.3], [0, 0.47, -0.08], 0.12),
    bone('spine1', 'pelvis', [0, 0.47, -0.02], [0, 0.47, -0.08], [0, 0.48, 0.06], 0.13),
    bone('spine2', 'spine1', [0, 0.48, 0.12], [0, 0.48, 0.06], [0, 0.5, 0.2], 0.13),
    bone('neck', 'spine2', [0, 0.54, 0.22], [0, 0.52, 0.2], [0, 0.72, 0.36], 0.06),
    bone('head', 'neck', [0, 0.72, 0.36], [0, 0.77, 0.4], [0, 0.76, 0.56], 0.07),
    bone('jaw', 'head', [0, 0.72, 0.47], [0, 0.68, 0.5], [0, 0.67, 0.66], 0),
  ]
  for (const [s, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    bones.push(bone(`ear_${s}_0`, 'head', [0.115 * sx, 0.835, 0.39], [0.115 * sx, 0.835, 0.39], [0.16 * sx, 0.76, 0.39], 0, s))
    bones.push(bone(`ear_${s}_1`, `ear_${s}_0`, [0.16 * sx, 0.76, 0.39], [0.16 * sx, 0.76, 0.39], [0.205 * sx, 0.665, 0.39], 0, s))
  }
  const T = TAIL_PTS.map((t) => t.p)
  const tipEnd: V3 = [0, 0.73, -0.59]
  T.forEach((p, i) => {
    bones.push(bone(`tail_${i}`, i === 0 ? 'pelvis' : `tail_${i - 1}`, p, p, i < 4 ? T[i + 1] : tipEnd, 0.02))
  })
  for (const [s, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const X = (x: number): number => x * sx
    bones.push(bone(`hind_${s}_thigh`, 'pelvis', [X(0.095), 0.5, -0.19], [X(0.095), 0.5, -0.19], [X(0.1), 0.31, -0.13], 0.03, s))
    bones.push(bone(`hind_${s}_shin`, `hind_${s}_thigh`, [X(0.1), 0.31, -0.13], [X(0.1), 0.31, -0.13], [X(0.09), 0.17, -0.24], 0.015, s))
    bones.push(bone(`hind_${s}_meta`, `hind_${s}_shin`, [X(0.09), 0.17, -0.24], [X(0.09), 0.17, -0.24], [X(0.09), 0.06, -0.21], 0.01, s))
    bones.push(bone(`hind_${s}_foot`, `hind_${s}_meta`, [X(0.09), 0.06, -0.21], [X(0.09), 0.06, -0.21], [X(0.09), 0.035, -0.12], 0.01, s))
    bones.push(bone(`front_${s}_upper`, 'spine2', [X(0.1), 0.5, 0.17], [X(0.1), 0.5, 0.17], [X(0.1), 0.3, 0.14], 0.03, s))
    bones.push(bone(`front_${s}_fore`, `front_${s}_upper`, [X(0.1), 0.3, 0.14], [X(0.1), 0.3, 0.14], [X(0.1), 0.115, 0.165], 0.015, s))
    bones.push(bone(`front_${s}_pastern`, `front_${s}_fore`, [X(0.1), 0.115, 0.165], [X(0.1), 0.115, 0.165], [X(0.1), 0.06, 0.18], 0.01, s))
    bones.push(bone(`front_${s}_foot`, `front_${s}_pastern`, [X(0.1), 0.06, 0.18], [X(0.1), 0.06, 0.18], [X(0.1), 0.035, 0.255], 0.01, s))
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
    const slitY = MOUTH_LINE_Y - 0.006
    const jawAmt = smoothstep(slitY + 0.002, slitY - 0.012, p[1]) * smoothstep(0.47, 0.53, p[2])
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
  // cream (coat_secondary): head, neck, chest, belly, lower front legs, paws
  const headNeck = y > 0.58 && z > 0.2 ? 1 : 0
  const chestPatch = 1 - smoothstep(0.9, 1.0, Math.hypot(x / 0.17, (y - 0.4) / 0.2, (z - 0.28) / 0.2))
  const belly = y < 0.38 && Math.abs(x) < 0.08 && z > -0.1 ? 1 : 0
  const lowerFront = y < 0.3 && z > 0.05 ? 1 : 0
  const paws = y < 0.12 ? 1 : 0
  const isEar = earWeight > 0.5 ? 1 : 0
  // tan patch round the dog's left eye, as in the reference
  const eyePatch = Math.hypot(x - 0.07, y - 0.79, z - 0.53) < 0.05 ? 1 : 0
  const cream = Math.max(headNeck, chestPatch, belly, lowerFront, paws) * (1 - isEar) * (1 - eyePatch)
  const nose = noseOnly(x, y, z) < 0.004 ? 1 : 0
  const mouthD = mouthCavity(x, y, z)
  const mouthLine = Math.abs(y - MOUTH_LINE_Y) < 0.008 && z > 0.55 && Math.abs(x) < 0.07 && noseOnly(x, y, z) > 0.01
  const mouth = MOUTH_CUT ? (mouthD < 0.004 ? 1 : 0) : mouthLine ? 1 : 0
  const tongueMask = MOUTH_CUT && tongue(x, y, z) < 0.002 && mouthD < 0.006 ? 1 : 0
  const facesHead = n[0] * Math.sign(x || 1) < -0.5 ? 1 : 0
  return {
    secondary: cream,
    nose,
    innerEar: isEar * facesHead,
    tongue: tongueMask,
    mouth: mouth * (1 - nose),
  }
}
