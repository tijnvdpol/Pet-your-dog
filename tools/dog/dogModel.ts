/**
 * The stylized labrador as a parametric SDF.
 *
 * Coordinates: metres-ish, y up, ground at y = 0, the dog faces +z, its left side is +x.
 * Every SDF leaf names the bone that moves it. Morph targets are made by building the same
 * tree with different parameters (see `VARIANTS`).
 */
import {
  type Q,
  type V3,
  add,
  clamp,
  cross,
  mirrorX,
  norm,
  qAxisAngle,
  qFromBases,
  qMul,
  qRotate,
  scale,
  sub,
} from './math'
import {
  type Leaf,
  type SdfNode,
  ellipsoid,
  indexLeaves,
  intersect,
  plane,
  roundCone,
  subtract,
  union,
  unionS,
} from './sdf'

export type EarMode = 'floppy' | 'up' | 'half'

export interface DogParams {
  torso: { chest: [V3, V3]; belly: [V3, V3]; hips: [V3, V3]; k: number }
  neck: { a: V3; b: V3; ra: number; rb: number }
  head: {
    skull: [V3, V3]
    cheek: [V3, V3]
    brow: [V3, V3]
    browRoll: number
    muzzle: [V3, V3]
    jaw: [V3, V3]
    mouthY: number
    gap: number
    /** Jaw opening (radians) around `jawPivot`. */
    jawOpen: number
  }
  jawPivot: V3
  ears: {
    mode: EarMode
    root: V3
    tilt: number
    pitch: number
    hinge: number
    rootLobe: [V3, V3]
    tipLobe: [V3, V3]
    fold: number
  }
  tail: { base: V3; seg: number; angles: number[]; radii: number[] }
  front: { joints: V3[]; radii: number[]; paw: [V3, V3] }
  hind: {
    joints: V3[]
    radii: number[]
    paw: [V3, V3]
    haunch: [V3, V3]
    haunchPitch: number
  }
  /** Uniform radius multiplier for the legs (body type). */
  legScale: number
  /** Extra x offset of the legs (body type). */
  legSpread: number
  eye: { c: V3; r: number; yaw: number; pitch: number }
  nose: { c: V3; pitch: number }
  tongue: { c: V3; r: V3 }
}

export const BASE: DogParams = {
  torso: {
    chest: [
      [0, 0.53, 0.12],
      [0.25, 0.26, 0.25],
    ],
    belly: [
      [0, 0.52, -0.08],
      [0.23, 0.225, 0.22],
    ],
    hips: [
      [0, 0.54, -0.26],
      [0.225, 0.225, 0.2],
    ],
    k: 0.14,
  },
  neck: { a: [0, 0.62, 0.2], b: [0, 0.8, 0.29], ra: 0.17, rb: 0.165 },
  head: {
    skull: [
      [0, 0.97, 0.36],
      [0.3, 0.28, 0.28],
    ],
    cheek: [
      [0.14, 0.85, 0.45],
      [0.13, 0.1, 0.13],
    ],
    brow: [
      [0.12, 1.1, 0.575],
      [0.07, 0.03, 0.04],
    ],
    browRoll: 0,
    muzzle: [
      [0, 0.83, 0.56],
      [0.15, 0.115, 0.135],
    ],
    jaw: [
      [0, 0.765, 0.53],
      [0.105, 0.05, 0.13],
    ],
    mouthY: 0.775,
    gap: 0.03,
    jawOpen: 0,
  },
  jawPivot: [0, 0.76, 0.42],
  ears: {
    mode: 'floppy',
    root: [0.24, 1.12, 0.4],
    tilt: 0.42,
    pitch: -0.12,
    hinge: 0.15,
    rootLobe: [
      [0, -0.1, 0],
      [0.03, 0.125, 0.11],
    ],
    tipLobe: [
      [0, -0.075, 0.01],
      [0.027, 0.11, 0.095],
    ],
    fold: 0,
  },
  tail: {
    base: [0, 0.66, -0.39],
    seg: 0.072,
    angles: [0.32, 0.22, 0.12, 0.04, -0.04],
    radii: [0.09, 0.088, 0.082, 0.073, 0.062, 0.05],
  },
  front: {
    // shoulder, elbow, wrist, foot joint
    joints: [
      [0.14, 0.47, 0.17],
      [0.15, 0.28, 0.15],
      [0.15, 0.115, 0.19],
      [0.15, 0.065, 0.215],
    ],
    radii: [0.1, 0.085, 0.078, 0.073],
    paw: [
      [0.15, 0.056, 0.24],
      [0.09, 0.06, 0.106],
    ],
  },
  hind: {
    // hip, knee, hock, foot joint
    joints: [
      [0.15, 0.49, -0.27],
      [0.155, 0.29, -0.19],
      [0.155, 0.155, -0.3],
      [0.155, 0.065, -0.275],
    ],
    radii: [0.105, 0.088, 0.072, 0.069],
    paw: [
      [0.155, 0.056, -0.25],
      [0.087, 0.058, 0.1],
    ],
    haunch: [
      [0.145, 0.44, -0.27],
      [0.115, 0.15, 0.14],
    ],
    haunchPitch: -0.3,
  },
  legScale: 1,
  legSpread: 0,
  eye: { c: [0.135, 1.01, 0.592], r: 0.075, yaw: 0.3, pitch: -0.05 },
  nose: { c: [0, 0.885, 0.665], pitch: 0.2 },
  tongue: { c: [0, 0.75, 0.588], r: [0.054, 0.012, 0.055] },
}

const clone = (p: DogParams): DogParams => structuredClone(p)
const mulV = (a: V3, s: V3): V3 => [a[0] * s[0], a[1] * s[1], a[2] * s[2]]

/** Parameter sets for the shape morph targets. */
export const VARIANTS: Record<string, (p: DogParams) => DogParams> = {
  ears_up: (p0) => {
    const p = clone(p0)
    p.ears.mode = 'up'
    p.ears.root = [0.2, 1.17, 0.36]
    p.ears.rootLobe = [
      [0, -0.08, 0],
      [0.026, 0.105, 0.09],
    ]
    p.ears.tipLobe = [
      [0, -0.05, 0],
      [0.02, 0.09, 0.055],
    ]
    return p
  },
  ears_half: (p0) => {
    const p = clone(p0)
    p.ears.mode = 'half'
    p.ears.root = [0.205, 1.17, 0.365]
    p.ears.hinge = 0.115
    p.ears.rootLobe = [
      [0, -0.065, 0],
      [0.027, 0.085, 0.092],
    ]
    p.ears.tipLobe = [
      [0, -0.06, 0.0],
      [0.024, 0.095, 0.082],
    ]
    p.ears.fold = -2.65
    return p
  },
  snout_long: (p0) => {
    const p = clone(p0)
    p.head.muzzle = [
      add(p.head.muzzle[0], [0, -0.005, 0.06]),
      add(p.head.muzzle[1], [0, -0.004, 0.05]),
    ]
    p.head.jaw = [add(p.head.jaw[0], [0, 0, 0.06]), add(p.head.jaw[1], [0, 0, 0.05])]
    p.nose.c = add(p.nose.c, [0, -0.008, 0.11])
    p.tongue.c = add(p.tongue.c, [0, 0, 0.07])
    return p
  },
  snout_short: (p0) => {
    const p = clone(p0)
    // the skull front limits how far back the muzzle can go before the nose gets buried;
    // the jaw follows the upper lip exactly so the mouth stays closed
    p.head.muzzle = [
      add(p.head.muzzle[0], [0, 0.004, -0.02]),
      add(p.head.muzzle[1], [0.008, 0.004, -0.03]),
    ]
    p.head.jaw = [
      add(p.head.jaw[0], [0, 0, -0.02]),
      add(p.head.jaw[1], [0.005, 0, -0.027]),
    ]
    p.nose.c = add(p.nose.c, [0, 0.004, -0.04])
    p.tongue.c = add(p.tongue.c, [0, 0, -0.035])
    return p
  },
  body_slim: (p0) => {
    const p = clone(p0)
    p.torso.chest[1] = mulV(p.torso.chest[1], [0.84, 0.93, 0.98])
    p.torso.belly[1] = mulV(p.torso.belly[1], [0.76, 0.85, 1])
    p.torso.hips[1] = mulV(p.torso.hips[1], [0.84, 0.93, 1])
    p.neck.ra *= 0.86
    p.neck.rb *= 0.88
    p.legScale = 0.84
    p.legSpread = -0.012
    p.hind.haunch[1] = mulV(p.hind.haunch[1], [0.86, 0.92, 0.9])
    return p
  },
  body_chunky: (p0) => {
    const p = clone(p0)
    p.torso.chest[1] = mulV(p.torso.chest[1], [1.22, 1.08, 1.04])
    p.torso.belly[1] = mulV(p.torso.belly[1], [1.3, 1.16, 1.04])
    p.torso.hips[1] = mulV(p.torso.hips[1], [1.2, 1.07, 1.03])
    p.neck.ra *= 1.12
    p.neck.rb *= 1.1
    p.legScale = 1.16
    p.legSpread = 0.024
    p.hind.haunch[1] = mulV(p.hind.haunch[1], [1.15, 1.06, 1.08])
    return p
  },
  tail_long: (p0) => {
    const p = clone(p0)
    p.tail.seg *= 1.4
    return p
  },
  tail_short: (p0) => {
    const p = clone(p0)
    p.tail.seg *= 0.55
    p.tail.radii = p.tail.radii.map((r, i) => r * (1 - i * 0.02))
    return p
  },
  mouth_open: (p0) => {
    const p = clone(p0)
    p.head.jawOpen = 0.42
    return p
  },
  sad_brows: (p0) => {
    const p = clone(p0)
    p.head.brow = [add(p.head.brow[0], [-0.008, 0.012, 0]), p.head.brow[1]]
    p.head.browRoll = -0.45
    return p
  },
}

export const SHAPE_MORPHS = [
  'ears_up',
  'ears_half',
  'snout_long',
  'snout_short',
  'body_slim',
  'body_chunky',
  'tail_long',
  'tail_short',
] as const
export const FACE_MORPHS = ['blink', 'mouth_open', 'happy_eyes', 'sad_brows'] as const

// ---------- helpers ----------

/** Mirror a rotation across the x = 0 plane. */
export const mirrorQ = (q: Q): Q => [q[0], -q[1], -q[2], q[3]]

/** Rotation of the left ear's root and tip frames (local: -y = along the ear, +x = outer face). */
export function earFrames(e: DogParams['ears']) {
  const hang = qMul(qAxisAngle([0, 0, 1], e.tilt), qAxisAngle([1, 0, 0], e.pitch))
  let rootQ = hang
  if (e.mode !== 'floppy') {
    // upright: along the ear = up and a bit outward, outer face = backwards and a bit outward
    const outer = norm([0.25, 0, -0.97])
    const along = norm([0.3, 0.95, -0.06])
    const y = norm(sub(scale(along, -1), scale(outer, -dotV(along, outer))))
    const z = cross(outer, y)
    rootQ = qFromBases(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [outer, y, z],
    )
  }
  const hingeWorld = add(e.root, qRotate(rootQ, [0, -e.hinge, 0]))
  const tipQ = e.mode === 'half' ? qMul(rootQ, qAxisAngle([0, 0, 1], e.fold)) : rootQ
  return { rootQ, tipQ, hingeWorld }
}
const dotV = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Points along the tail (base + 5 segment ends). */
export function tailPoints(t: DogParams['tail']): V3[] {
  const pts: V3[] = [t.base]
  for (let i = 0; i < t.angles.length; i++) {
    const a = t.angles[i]
    pts.push(add(pts[i], [0, Math.sin(a) * t.seg, -Math.cos(a) * t.seg]))
  }
  return pts
}

/** Rotates a point around the jaw pivot (x axis) by the jaw opening. */
export function jawRotate(p: DogParams, v: V3): V3 {
  if (!p.head.jawOpen) return v
  return add(
    p.jawPivot,
    qRotate(qAxisAngle([1, 0, 0], p.head.jawOpen), sub(v, p.jawPivot)),
  )
}
export const jawQ = (p: DogParams): Q => qAxisAngle([1, 0, 0], p.head.jawOpen)

const side = (v: V3, s: 1 | -1): V3 => (s > 0 ? v : mirrorX(v))

// ---------- the tree ----------

function leg(
  name: string,
  s: 1 | -1,
  joints: V3[],
  radii: number[],
  paw: [V3, V3],
  ls: number,
  spread: number,
  boneOf: (i: number) => string,
): SdfNode {
  const J = joints.map((j) => side(add(j, [spread, 0, 0]), s))
  const R = radii.map((r) => r * ls)
  const pawC = side(add(paw[0], [spread, 0, 0]), s)
  const pawR: V3 = [paw[1][0] * (0.5 + ls / 2), paw[1][1], paw[1][2] * (0.6 + ls * 0.4)]
  // three chubby toes on the front of the paw, with shallow grooves between them
  const toeSpread = 0.048 * (0.5 + ls / 2)
  const toes = [-1, 0, 1].map((dx, i) =>
    ellipsoid(
      `${name}_toe_${i}`,
      boneOf(3),
      add(pawC, [dx * toeSpread, 0.004, pawR[2] * 0.62 + (dx === 0 ? 0.008 : 0)]),
      [0.036, 0.042, 0.045],
    ),
  )
  const grooves = [-1, 1].map((dx, i) =>
    ellipsoid(
      `${name}_groove_${i}`,
      boneOf(3),
      add(pawC, [(dx * toeSpread) / 2, 0.038, pawR[2] * 0.72]),
      [0.008, 0.03, 0.05],
    ),
  )
  return unionS(
    0.0,
    0.022,
    roundCone(`${name}_upper`, boneOf(0), J[0], J[1], R[0], R[1]),
    roundCone(`${name}_lower`, boneOf(1), J[1], J[2], R[1], R[2]),
    roundCone(`${name}_pastern`, boneOf(2), J[2], J[3], R[2], R[3]),
    subtract(
      0.01,
      union(0.02, ellipsoid(`${name}_paw`, boneOf(3), pawC, pawR), ...toes),
      union(0, ...grooves),
    ),
  )
}

function ear(p: DogParams, s: 1 | -1): SdfNode {
  const e = p.ears
  const { rootQ, tipQ, hingeWorld } = earFrames(e)
  const sideName = s > 0 ? 'L' : 'R'
  const fq = (q: Q) => (s > 0 ? q : mirrorQ(q))
  const rootC = add(e.root, qRotate(rootQ, e.rootLobe[0]))
  const tipC = add(hingeWorld, qRotate(tipQ, e.tipLobe[0]))
  return union(
    0.09,
    ellipsoid(
      `ear_${sideName}_root`,
      `ear_${sideName}_0`,
      side(rootC, s),
      e.rootLobe[1],
      fq(rootQ),
    ),
    ellipsoid(
      `ear_${sideName}_tip`,
      `ear_${sideName}_1`,
      side(tipC, s),
      e.tipLobe[1],
      fq(tipQ),
    ),
  )
}

export function buildTree(p: DogParams): { root: SdfNode; leaves: Leaf[] } {
  const t = p.torso
  const torso = union(
    t.k,
    ellipsoid('chest', 'spine_2', t.chest[0], t.chest[1]),
    ellipsoid('belly', 'spine_1', t.belly[0], t.belly[1]),
    ellipsoid('hips', 'spine_0', t.hips[0], t.hips[1]),
  )
  const legs: SdfNode[] = []
  for (const s of [1, -1] as const) {
    const sn = s > 0 ? 'L' : 'R'
    legs.push(
      leg(
        `front_${sn}`,
        s,
        p.front.joints,
        p.front.radii,
        p.front.paw,
        p.legScale,
        p.legSpread,
        (i) => `front_${sn}_${i}`,
      ),
      leg(
        `hind_${sn}`,
        s,
        p.hind.joints,
        p.hind.radii,
        p.hind.paw,
        p.legScale,
        p.legSpread,
        (i) => `hind_${sn}_${i}`,
      ),
      ellipsoid(
        `hind_${sn}_haunch`,
        `hind_${sn}_0`,
        side(add(p.hind.haunch[0], [p.legSpread, 0, 0]), s),
        p.hind.haunch[1],
        qAxisAngle([1, 0, 0], p.hind.haunchPitch),
      ),
    )
  }
  const tp = tailPoints(p.tail)
  const tail = unionS(
    0,
    0.03,
    ...tp
      .slice(0, -1)
      .map((a, i) =>
        roundCone(
          `tail_${i}`,
          `tail_${i}`,
          a,
          tp[i + 1],
          p.tail.radii[i],
          p.tail.radii[i + 1],
        ),
      ),
  )
  const body = union(0.06, union(0.08, torso, ...legs), tail)
  const neckBody = union(
    0.11,
    body,
    roundCone('neck', 'neck', p.neck.a, p.neck.b, p.neck.ra, p.neck.rb),
  )

  const h = p.head
  const browQ = (s: 1 | -1) => qAxisAngle([0, 0, 1], s * h.browRoll)
  const headCore = union(
    0.035,
    union(
      0.07,
      ellipsoid('skull', 'head', h.skull[0], h.skull[1]),
      ellipsoid('cheek_L', 'head', h.cheek[0], h.cheek[1]),
      ellipsoid('cheek_R', 'head', mirrorX(h.cheek[0]), h.cheek[1]),
      intersect(
        0.004,
        ellipsoid('muzzle', 'head', h.muzzle[0], h.muzzle[1]),
        plane('muzzle_cut', 'head', [0, h.mouthY, 0], [0, -1, 0], 'muzzle'),
      ),
    ),
    ellipsoid('brow_L', 'head', h.brow[0], h.brow[1], browQ(1)),
    ellipsoid('brow_R', 'head', mirrorX(h.brow[0]), h.brow[1], browQ(-1)),
  )
  const jq = jawQ(p)
  const jawTop = jawRotate(p, [0, h.mouthY - h.gap, 0])
  const jaw = intersect(
    0.004,
    ellipsoid('jaw', 'jaw', jawRotate(p, h.jaw[0]), h.jaw[1], jq),
    plane('jaw_cut', 'jaw', jawTop, qRotate(jq, [0, 1, 0]), 'jaw'),
  )
  const head = union(0.025, union(0.02, headCore, jaw), ear(p, 1), ear(p, -1))
  const root = union(0.15, neckBody, head)
  return { root, leaves: indexLeaves(root) }
}

export const GRID = {
  xMax: 0.46,
  y: [-0.03, 1.4] as [number, number],
  z: [-0.95, 0.82] as [number, number],
}

// ---------- skeleton ----------

export interface BoneDef {
  name: string
  parent: string | null
  /** World position of the joint in the rest pose. */
  head: V3
}

export function skeleton(p: DogParams): BoneDef[] {
  const bones: BoneDef[] = [
    { name: 'root', parent: null, head: [0, 0, 0] },
    { name: 'spine_0', parent: 'root', head: [0, 0.54, -0.26] },
    { name: 'spine_1', parent: 'spine_0', head: [0, 0.53, -0.05] },
    { name: 'spine_2', parent: 'spine_1', head: [0, 0.54, 0.14] },
    { name: 'neck', parent: 'spine_2', head: [0, 0.64, 0.22] },
    { name: 'head', parent: 'neck', head: [0, 0.81, 0.3] },
    { name: 'jaw', parent: 'head', head: p.jawPivot },
  ]
  const { hingeWorld } = earFrames(p.ears)
  for (const s of [1, -1] as const) {
    const sn = s > 0 ? 'L' : 'R'
    bones.push(
      { name: `ear_${sn}_0`, parent: 'head', head: side(p.ears.root, s) },
      { name: `ear_${sn}_1`, parent: `ear_${sn}_0`, head: side(hingeWorld, s) },
    )
  }
  const tp = tailPoints(p.tail)
  for (let i = 0; i < 5; i++)
    bones.push({
      name: `tail_${i}`,
      parent: i ? `tail_${i - 1}` : 'spine_0',
      head: tp[i],
    })
  for (const s of [1, -1] as const) {
    const sn = s > 0 ? 'L' : 'R'
    p.front.joints.forEach((j, i) =>
      bones.push({
        name: `front_${sn}_${i}`,
        parent: i ? `front_${sn}_${i - 1}` : 'spine_2',
        head: side(j, s),
      }),
    )
    p.hind.joints.forEach((j, i) =>
      bones.push({
        name: `hind_${sn}_${i}`,
        parent: i ? `hind_${sn}_${i - 1}` : 'spine_0',
        head: side(j, s),
      }),
    )
  }
  return bones
}

/** End points of the leaf bones (for IK / foot direction): toe tips. */
export function toeTip(p: DogParams, front: boolean, s: 1 | -1): V3 {
  const paw = front ? p.front.paw : p.hind.paw
  return side(add(paw[0], [0, 0, paw[1][2] * 0.95]), s)
}

// ---------- colour zones ----------

/** Signed distance to an axis-aligned ellipsoid (approximate). */
function ellD(p: V3, c: V3, r: V3) {
  const x = (p[0] - c[0]) / r[0]
  const y = (p[1] - c[1]) / r[1]
  const z = (p[2] - c[2]) / r[2]
  const k0 = Math.hypot(x, y, z)
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2])
  return k1 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r)
}
const field = (signedDist: number, band: number) => clamp(0.5 - signedDist / band, 0, 1)

/**
 * Colour-zone fields for one vertex. Each value is a smooth 0..1 field whose 0.5 level is
 * the zone border; the shader thresholds it, which gives crisp but smooth edges.
 *
 * zones  = [chest/belly bib, muzzle, leg height (0 = ground), inner ear]
 * marks  = [mouth, blaze, saddle, eye patch]
 */
export function zoneFields(
  p: DogParams,
  v: V3,
  own: Array<[number, number]>,
  leaves: Leaf[],
): { zones: [number, number, number, number]; marks: [number, number, number, number] } {
  const ownBy = (pred: (n: string) => boolean) =>
    own.reduce((s, [id, w]) => (pred(leaves[id].name) ? s + w : s), 0)
  const legOwn = ownBy(
    (n) => (n.startsWith('front_') || n.startsWith('hind_')) && !n.endsWith('haunch'),
  )
  const headOwn = ownBy(
    (n) =>
      ['skull', 'muzzle', 'muzzle_cut', 'jaw', 'jaw_cut'].includes(n) ||
      n.startsWith('cheek') ||
      n.startsWith('brow'),
  )
  const torsoOwn = ownBy((n) => n === 'chest' || n === 'belly' || n === 'hips')

  // bib: throat + front of the chest + belly underside
  const bib = Math.min(
    ellD(v, [0, 0.5, 0.33], [0.12, 0.2, 0.1]),
    ellD(v, [0, 0.27, -0.06], [0.11, 0.06, 0.24]),
  )
  const chest = field(bib, 0.06)

  const muzzleD = ellD(v, [0, 0.8, 0.62], [0.16, 0.13, 0.14])
  const muzzle = field(muzzleD, 0.05) * clamp(headOwn * 1.5, 0, 1)

  const legH = 1 - legOwn * (1 - clamp(v[1] / 0.4, 0, 1))

  // inner ear: inner face of the ear lobes, away from the rim
  let inner = 0
  let earW = 0
  for (const [id, w] of own) {
    const l = leaves[id]
    if (!l.name.startsWith('ear_') || l.shape.type !== 'ellipsoid') continue
    const s = l.name.startsWith('ear_L') ? 1 : -1
    const q = l.shape.q ?? [0, 0, 0, 1]
    const local = qRotate([-q[0], -q[1], -q[2], q[3]], sub(v, l.shape.c))
    const ux = local[0] / l.shape.r[0]
    inner += w * clamp(0.5 + (-s * ux - 0.55) / 0.3, 0, 1)
    earW += w
  }
  const innerEar = earW > 0.3 ? inner / earW : 0

  // mouth: the slit between upper lip and jaw (interior faces + a thin lip line)
  const h = p.head
  const yTop = h.mouthY + 0.004
  const yBot = h.mouthY - h.gap - 0.004
  const slab = Math.min(v[1] - yBot, yTop - v[1])
  const mouth =
    field(-slab, 0.01) *
    clamp((0.14 - Math.abs(v[0])) / 0.02, 0, 1) *
    clamp((v[2] - 0.4) / 0.03, 0, 1) *
    clamp(headOwn * 2, 0, 1)

  // blaze: white stripe from the forehead down to the nose
  const blazeW = 0.03 + 0.035 * clamp((1.05 - v[1]) / 0.18, 0, 1)
  const blaze =
    field(Math.abs(v[0]) - blazeW, 0.025) *
    clamp((v[2] - 0.3) / 0.06, 0, 1) *
    clamp((v[1] - 0.86) / 0.03, 0, 1) *
    clamp(headOwn * 2, 0, 1)

  // saddle: dark back
  const saddle =
    field(0.69 - v[1], 0.05) *
    clamp((v[2] + 0.45) / 0.08, 0, 1) *
    clamp((0.22 - v[2]) / 0.08, 0, 1) *
    clamp(torsoOwn * 1.5, 0, 1)

  // eye patch around the dog's left eye
  const patch =
    field(ellD(v, [0.145, 1.02, 0.56], [0.12, 0.11, 0.1]), 0.04) *
    clamp(headOwn * 2, 0, 1)

  return { zones: [chest, muzzle, legH, innerEar], marks: [mouth, blaze, saddle, patch] }
}
