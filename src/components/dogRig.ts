import {
  AnimationClip,
  Euler,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type Object3D,
} from 'three'

/**
 * Procedural clips baked into real AnimationClips at load time.
 *
 * Why procedural and not keyframes in the GLB: every loop is a sum of sines whose frequencies are
 * integer multiples of the clip length, so loops are seamless by construction; clips share a single
 * "idle" base pose; and the GLB stays tiny (~200 KB). The same mixer still gives us crossfades.
 *
 * Bone axes == world axes in the rest pose (+X dog's left, +Y up, +Z forward). For a limb that hangs
 * down, rotation.x > 0 swings its end backwards; for a forward-pointing head, > 0 pitches the nose down.
 */
export type Pose = Record<string, [number, number, number]> // euler XYZ radians
export interface PoseOut {
  rot: Pose
  /** Extra translation per bone (added to the rest translation). */
  pos: Record<string, [number, number, number]>
}

export const CLIP_NAMES = ['Idle', 'Wag', 'Sit', 'Lie', 'Sleep', 'Eat', 'Run', 'Roll', 'Jump', 'Sulk', 'PetHappy'] as const
export type ClipName = (typeof CLIP_NAMES)[number]

/** Face state a clip wants (blended by the Dog component). */
export interface FaceState {
  happy: number
  sad: number
  mouth: number
  /** Eyes held shut (sleep). */
  closed: number
  blink: boolean
}
export const FACE: Record<ClipName, FaceState> = {
  Idle: { happy: 0, sad: 0, mouth: 0, closed: 0, blink: true },
  Wag: { happy: 0.6, sad: 0, mouth: 0.1, closed: 0, blink: true },
  Sit: { happy: 0, sad: 0, mouth: 0, closed: 0, blink: true },
  Lie: { happy: 0, sad: 0, mouth: 0, closed: 0, blink: true },
  Sleep: { happy: 0, sad: 0, mouth: 0, closed: 1, blink: false },
  Eat: { happy: 0.2, sad: 0, mouth: 0, closed: 0, blink: true },
  Run: { happy: 0.5, sad: 0, mouth: 0.15, closed: 0, blink: true },
  Roll: { happy: 1, sad: 0, mouth: 0.1, closed: 0, blink: false },
  Jump: { happy: 0.8, sad: 0, mouth: 0.15, closed: 0, blink: false },
  Sulk: { happy: 0, sad: 1, mouth: 0, closed: 0, blink: true },
  PetHappy: { happy: 1, sad: 0, mouth: 0.1, closed: 0, blink: false },
}

type Ctx = { u: number } // u = loop phase in [0,1)
const TAU = Math.PI * 2
const s = (u: number, k = 1, ph = 0) => Math.sin(TAU * (u * k + ph))
const ease = (x: number) => x * x * (3 - 2 * x)

const out = (): PoseOut => ({ rot: {}, pos: {} })
const add = (p: PoseOut, bone: string, x = 0, y = 0, z = 0) => {
  const r = p.rot[bone] ?? [0, 0, 0]
  p.rot[bone] = [r[0] + x, r[1] + y, r[2] + z]
}
const move = (p: PoseOut, bone: string, x = 0, y = 0, z = 0) => {
  const r = p.pos[bone] ?? [0, 0, 0]
  p.pos[bone] = [r[0] + x, r[1] + y, r[2] + z]
}
const sides = ['L', 'R'] as const

/** Gentle breathing + tail sway, the base of every loop. Period = 1 clip length. */
function base(p: PoseOut, { u }: Ctx, breath = 1) {
  add(p, 'spine2', 0.012 * s(u, 1) * breath)
  add(p, 'neck', -0.01 * s(u, 1, 0.1) * breath)
  move(p, 'spine2', 0, 0.004 * s(u, 1) * breath, 0)
  add(p, 'head', 0.015 * s(u, 1, 0.15), 0.03 * s(u, 1, 0.5), 0)
  for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0.01 * s(u, 1, -i * 0.05), 0.07 * s(u, 1, -i * 0.08), 0)
}

function sitPose(p: PoseOut, k = 1) {
  // hind legs fold under: pelvis drops and tips up (the whole front follows), thigh forward, shin back, foot flat
  move(p, 'pelvis', 0, -0.27 * k, -0.04 * k)
  add(p, 'pelvis', -0.62 * k)
  add(p, 'spine1', 0.12 * k)
  add(p, 'spine2', 0.15 * k)
  add(p, 'neck', 0.2 * k)
  add(p, 'head', 0.05 * k)
  for (const sd of sides) {
    add(p, `hind_${sd}_thigh`, -1.3 * k)
    add(p, `hind_${sd}_shin`, 2.2 * k)
    add(p, `hind_${sd}_meta`, -0.6 * k)
    add(p, `hind_${sd}_foot`, -0.3 * k)
    add(p, `front_${sd}_upper`, 0.5 * k) // keep the front legs vertical although the chest tipped up
  }
  for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0.12 * k)
}

function liePose(p: PoseOut, k = 1) {
  move(p, 'root', 0, -0.17 * k, 0)
  add(p, 'pelvis', -0.05 * k)
  add(p, 'neck', -0.08 * k)
  for (const sd of sides) {
    const x = sd === 'L' ? 1 : -1
    add(p, `hind_${sd}_thigh`, -1.5 * k, 0, 0.45 * x * k)
    add(p, `hind_${sd}_shin`, 2.1 * k)
    add(p, `hind_${sd}_meta`, -0.6 * k)
    // sphinx: forelegs reach forward along the ground
    add(p, `front_${sd}_upper`, -1.25 * k)
    add(p, `front_${sd}_fore`, 0.2 * k)
    add(p, `front_${sd}_pastern`, 0.1 * k)
    add(p, `front_${sd}_foot`, 1.1 * k)
  }
  for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0.06 * k, 0.1 * k)
}

/** Walk-style leg swing helper: phase in cycles. */
function swing(p: PoseOut, sd: 'L' | 'R', fore: boolean, ph: number, u: number, amp: number, k = 1) {
  const bone = fore ? 'front' : 'hind'
  const a = s(u, k, ph)
  const lift = Math.max(0, s(u, k, ph + 0.25))
  add(p, `${bone}_${sd}_${fore ? 'upper' : 'thigh'}`, -amp * a)
  add(p, `${bone}_${sd}_${fore ? 'fore' : 'shin'}`, amp * 0.9 * lift)
  add(p, `${bone}_${sd}_${fore ? 'pastern' : 'meta'}`, -amp * 0.4 * lift)
}

export const POSES: Record<ClipName, { duration: number; fn: (p: PoseOut, c: Ctx) => void }> = {
  Idle: { duration: 3.2, fn: (p, c) => base(p, c) },
  Wag: {
    duration: 1.6,
    fn: (p, c) => {
      base(p, c)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.35 * s(c.u, 4, -i * 0.06) * (0.5 + i * 0.25), 0)
      add(p, 'pelvis', 0, 0.06 * s(c.u, 4, 0.1), 0)
      add(p, 'spine2', 0, -0.03 * s(c.u, 4, 0.1), 0)
      add(p, 'head', 0, 0, 0.04 * s(c.u, 4, 0.2))
      for (const sd of sides) add(p, `ear_${sd}_0`, 0.05 * s(c.u, 4, 0.3))
    },
  },
  Sit: {
    duration: 3.2,
    fn: (p, c) => {
      sitPose(p)
      base(p, c)
    },
  },
  Lie: {
    duration: 3.2,
    fn: (p, c) => {
      liePose(p)
      base(p, c, 1.3)
    },
  },
  Sleep: {
    duration: 3.2,
    fn: (p, c) => {
      liePose(p)
      add(p, 'neck', 0.3)
      add(p, 'head', 0.25, 0, -0.35)
      move(p, 'spine2', 0, 0.006 * s(c.u, 1), 0)
      add(p, 'spine1', 0.02 * s(c.u, 1))
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.03 * s(c.u, 1, -i * 0.05))
    },
  },
  Eat: {
    duration: 1.6,
    fn: (p, c) => {
      base(p, c, 0.5)
      add(p, 'spine2', 0.12)
      add(p, 'neck', 0.55 + 0.06 * s(c.u, 3))
      add(p, 'head', 0.35 + 0.1 * s(c.u, 3, 0.25))
      add(p, 'jaw', Math.max(0, s(c.u, 3, 0.1)) * 0.35)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.25 * s(c.u, 2, -i * 0.05))
    },
  },
  Run: {
    duration: 0.8,
    fn: (p, c) => {
      const u = c.u
      // bound/gallop: front pair then hind pair, spine flexes, whole body bobs
      swing(p, 'L', true, 0, u, 0.75)
      swing(p, 'R', true, 0.08, u, 0.75)
      swing(p, 'L', false, 0.5, u, 0.85)
      swing(p, 'R', false, 0.58, u, 0.85)
      add(p, 'spine1', 0.12 * s(u, 1, 0.25))
      add(p, 'spine2', 0.12 * s(u, 1, 0.25))
      add(p, 'pelvis', -0.08 * s(u, 1, 0.25))
      move(p, 'pelvis', 0, 0.05 * Math.abs(s(u, 1, 0.1)), 0)
      add(p, 'neck', -0.1 + 0.08 * s(u, 1, 0.25))
      add(p, 'jaw', 0.04)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, -0.25 + 0.15 * s(u, 1, -i * 0.05), 0.1 * s(u, 2, -i * 0.08))
      for (const sd of sides) add(p, `ear_${sd}_0`, 0.25 + 0.2 * s(u, 1, 0.3))
    },
  },
  Roll: {
    duration: 1.6,
    fn: (p, c) => {
      const a = TAU * c.u
      // rotate the whole dog around its belly axis (z): root pivots about (0, .3, 0)
      const cy = 0.4
      add(p, 'root', 0, 0, a)
      move(p, 'root', cy * Math.sin(a), cy - cy * Math.cos(a) + 0.08 * Math.abs(Math.sin(a)), 0)
      for (const sd of sides) {
        add(p, `front_${sd}_upper`, -0.8 + 0.3 * s(c.u, 3, sd === 'L' ? 0 : 0.5))
        add(p, `front_${sd}_fore`, -0.6)
        add(p, `hind_${sd}_thigh`, -0.7 + 0.3 * s(c.u, 3, sd === 'L' ? 0.5 : 0))
        add(p, `hind_${sd}_shin`, 0.8)
      }
      add(p, 'neck', -0.2)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.3 * s(c.u, 3, -i * 0.06))
    },
  },
  Jump: {
    duration: 1.6,
    fn: (p, c) => {
      // crouch -> launch -> tuck in air -> land, repeated
      const u = c.u
      const air = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.25) / 0.5))))
      const crouch = (1 - ease(Math.min(1, Math.abs(u - 0.15) / 0.15))) * (u < 0.25 ? 1 : 0) + (u > 0.75 ? ease((u - 0.75) / 0.1) * (1 - ease(Math.min(1, (u - 0.85) / 0.15))) : 0)
      move(p, 'root', 0, 0.3 * air - 0.07 * crouch, 0)
      add(p, 'pelvis', -0.15 * air + 0.2 * crouch)
      add(p, 'spine2', 0.15 * air - 0.12 * crouch)
      add(p, 'neck', -0.3 * air)
      for (const sd of sides) {
        add(p, `front_${sd}_upper`, -0.9 * air + 0.5 * crouch)
        add(p, `front_${sd}_fore`, 0.9 * air - 0.6 * crouch)
        add(p, `hind_${sd}_thigh`, 0.6 * air - 0.7 * crouch)
        add(p, `hind_${sd}_shin`, 0.5 * air + 0.9 * crouch)
        add(p, `hind_${sd}_meta`, -0.3 * air - 0.4 * crouch)
      }
      add(p, 'jaw', 0.08 * air)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.3 * s(u, 3, -i * 0.06))
      for (const sd of sides) add(p, `ear_${sd}_0`, 0.35 * air - 0.1 * crouch)
    },
  },
  Sulk: {
    duration: 3.2,
    fn: (p, c) => {
      sitPose(p, 0.9)
      add(p, 'root', 0, 0.65, 0) // turned away
      add(p, 'spine2', 0.1)
      add(p, 'neck', 0.55)
      add(p, 'head', 0.2, 0.35 * s(c.u, 1, 0.1), 0)
      move(p, 'spine2', 0, 0.003 * s(c.u, 1), 0)
      for (const sd of sides) {
        add(p, `ear_${sd}_0`, 0.2)
        add(p, `ear_${sd}_1`, 0.25)
      }
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0.15, 0.04 * s(c.u, 1, -i * 0.06))
    },
  },
  PetHappy: {
    duration: 1.6,
    fn: (p, c) => {
      sitPose(p, 0.75)
      base(p, c)
      // left hind leg scratches in the air; head leans into the hand
      const scr = s(c.u, 8)
      add(p, 'hind_L_thigh', -0.7 + 0.35 * scr)
      add(p, 'hind_L_shin', -1.2 + 0.7 * scr)
      add(p, 'hind_L_meta', 0.3 * scr)
      add(p, 'spine1', 0, 0, -0.1)
      add(p, 'neck', 0.1, 0, -0.25)
      add(p, 'head', 0.1, 0, -0.3 + 0.03 * scr)
      for (let i = 0; i < 5; i++) add(p, `tail_${i}`, 0, 0.3 * s(c.u, 4, -i * 0.06) * (0.4 + i * 0.2))
      add(p, 'ear_L_0', 0.1 * scr)
    },
  },
}

/** Bakes every pose function into a 30 fps AnimationClip bound to the skeleton's bone names. */
export function buildClips(skeleton: Object3D): AnimationClip[] {
  const bones = new Map<string, Object3D>()
  skeleton.traverse((o) => {
    if ((o as { isBone?: boolean }).isBone) bones.set(o.name, o)
  })
  const q = new Quaternion()
  const e = new Euler()
  return CLIP_NAMES.map((name) => {
    const { duration, fn } = POSES[name]
    const frames = Math.round(duration * 30)
    const times: number[] = []
    const rotVals = new Map<string, number[]>()
    const posVals = new Map<string, number[]>()
    for (let f = 0; f <= frames; f++) {
      const u = (f % frames) / frames // last frame == first frame => seamless loop
      times.push((f / frames) * duration)
      const pose = out()
      fn(pose, { u })
      for (const b of bones.keys()) {
        const r = pose.rot[b]
        e.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, 'ZYX')
        q.setFromEuler(e)
        const arr = rotVals.get(b) ?? []
        arr.push(q.x, q.y, q.z, q.w)
        rotVals.set(b, arr)
        const t = pose.pos[b]
        if (t) {
          const rest = bones.get(b)!.position
          const pa = posVals.get(b) ?? []
          pa.push(rest.x + t[0], rest.y + t[1], rest.z + t[2])
          posVals.set(b, pa)
        }
      }
    }
    const tracks = [] as (QuaternionKeyframeTrack | VectorKeyframeTrack)[]
    for (const [b, v] of rotVals) tracks.push(new QuaternionKeyframeTrack(`${b}.quaternion`, times, v))
    for (const [b, v] of posVals) {
      if (v.length === times.length * 3) tracks.push(new VectorKeyframeTrack(`${b}.position`, times, v))
    }
    // Bones that gain a position track in some frames only would need padding; pose fns are static in which bones they move.
    return new AnimationClip(name, duration, tracks)
  })
}

export const deg = MathUtils.degToRad
