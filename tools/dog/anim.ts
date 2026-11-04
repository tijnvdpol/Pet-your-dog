/**
 * Keyframe clips, authored as functions of time and baked at 30 fps.
 *
 * Every clip is periodic (pose(0) === pose(T)) so loops are seamless, and every clip keys
 * every bone so crossfades and the app's secondary motion always start from a clean pose.
 * Legs are solved with IK so paws stay planted on the ground.
 */
import { type BoneDef, type DogParams, toeTip } from './dogModel'
import type { Clip, Track } from './gltf'
import {
  type Q,
  type V3,
  add,
  clamp,
  lerp,
  mix,
  norm,
  qRotate,
  qAxisAngle,
  smoothstep,
  sub,
} from './math'
import { LEGS, type LegName, type LegTarget, Rig } from './rig'

const FPS = 30
const TAU = Math.PI * 2
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const

type ClipFn = (rig: Rig, t: number, T: number) => void

const wave = (t: number, T: number, cycles = 1, phase = 0) =>
  Math.sin(TAU * (cycles * (t / T) + phase))
const ease = smoothstep

/** Paws planted at their rest spot (world), pastern at rest direction. */
function planted(rig: Rig, leg: LegName, offset: V3 = [0, 0, 0]): LegTarget {
  const r = rig.legRest(leg)
  return { foot: add(r.foot, offset), pastern: r.pastern, toe: r.toe }
}

function solveLegs(rig: Rig, targets: Partial<Record<LegName, LegTarget>>) {
  for (const leg of LEGS) {
    const t = targets[leg]
    if (t) rig.solveLeg(leg, t)
  }
}

/** Gentle breathing on the chest. */
function breathe(rig: Rig, t: number, T: number, cycles: number, amount = 1) {
  const b = wave(t, T, cycles)
  rig.rot('spine_2', -0.012 * b * amount)
  rig.rot('spine_1', 0.006 * b * amount)
  rig.hips = add(rig.hips, [0, 0.004 * b * amount, 0])
}

function tailSway(
  rig: Rig,
  t: number,
  T: number,
  cycles: number,
  amp: number,
  lift: number,
  lag = 0.09,
) {
  for (let i = 0; i < 5; i++)
    rig.rot(
      `tail_${i}`,
      i === 0 ? lift : lift * 0.15,
      amp * (i === 0 ? 1 : 0.55) * wave(t, T, cycles, -i * lag),
    )
}

function ears(rig: Rig, back: number, flare: number, droop = 0) {
  for (const [n, s] of SIDES) {
    rig.rot(`ear_${n}_0`, back, 0, s * flare)
    rig.rot(`ear_${n}_1`, droop, 0, s * flare * 0.3)
  }
}

// ---------- shared poses ----------

/** Sitting: pelvis down and pitched, hind legs folded with the hocks on the ground. */
function sitBase(rig: Rig, lean = 0) {
  rig.hips = add(rig.hips, [0, -0.27, -0.03])
  rig.rot('spine_0', -0.72, 0, lean)
  rig.rot('spine_1', -0.04)
  rig.rot('spine_2', 0.12)
  rig.rot('neck', 0.38)
  rig.rot('head', 0.24)
  rig.rot('tail_0', 0.5)
  return {
    hind: (leg: LegName): LegTarget => {
      const s = leg.endsWith('L') ? 1 : -1
      return {
        foot: [0.175 * s, 0.07, -0.03],
        pastern: [0, -0.05, 1],
        toe: [0, -0.05, 1],
        pole: [0.15 * s, 0.4, 1],
      }
    },
    front: (leg: LegName): LegTarget => {
      const s = leg.endsWith('L') ? 1 : -1
      const r = rig.legRest(leg)
      return { foot: [0.15 * s, r.foot[1], 0.15], pastern: r.pastern, toe: r.toe }
    },
  }
}

/** Sphinx lie: belly on the ground, front legs forward, hind legs folded alongside. */
function lieBase(rig: Rig) {
  rig.hips = add(rig.hips, [0, -0.265, 0])
  rig.rot('spine_0', 0.02)
  rig.rot('spine_2', 0.02)
  rig.rot('tail_0', -0.35)
  return {
    front: (leg: LegName): LegTarget => {
      const s = leg.endsWith('L') ? 1 : -1
      return {
        foot: [0.15 * s, 0.06, 0.43],
        pastern: [0, -0.08, 1],
        toe: [0, -0.05, 1],
        pole: [0, -1, -0.4],
      }
    },
    hind: (leg: LegName): LegTarget => {
      const s = leg.endsWith('L') ? 1 : -1
      return {
        // hind paws tucked forward alongside the belly, knees out: visible from the side
        foot: [0.27 * s, 0.062, -0.0],
        pastern: [0.3 * s, -0.04, 1],
        toe: [0.25 * s, -0.04, 1],
        pole: [0.9 * s, 0.35, 0.6],
      }
    },
  }
}

// ---------- clips ----------

const CLIPS: Record<string, { T: number; fn: ClipFn }> = {
  Idle: {
    T: 4,
    fn: (rig, t, T) => {
      breathe(rig, t, T, 2)
      rig.rot('neck', -0.03 + 0.025 * wave(t, T, 1, 0.1), 0.12 * wave(t, T, 1, 0.3))
      rig.rot('head', 0.03 * wave(t, T, 2), 0, 0.07 * wave(t, T, 1, 0.55))
      ears(rig, 0, 0.02 * wave(t, T, 2))
      tailSway(rig, t, T, 2, 0.2, 0.05)
      rig.hips = add(rig.hips, [0.008 * wave(t, T, 1), 0, 0])
      solveLegs(rig, Object.fromEntries(LEGS.map((l) => [l, planted(rig, l)])))
    },
  },

  Wag: {
    T: 1.2,
    fn: (rig, t, T) => {
      const w = wave(t, T, 4)
      rig.hips = add(rig.hips, [0, 0.012 * Math.abs(wave(t, T, 2)), 0])
      rig.rot('spine_0', 0, -0.09 * w, 0.03 * w)
      rig.rot('spine_1', 0, 0.04 * w)
      rig.rot('neck', -0.1, 0.05 * wave(t, T, 1))
      rig.rot('head', -0.02, 0, 0.13 * wave(t, T, 1, 0.25))
      ears(rig, -0.12, 0.05)
      for (let i = 0; i < 5; i++)
        rig.rot(
          `tail_${i}`,
          i === 0 ? 0.35 : 0.05,
          (i === 0 ? 0.6 : 0.28) * wave(t, T, 4, -i * 0.08),
        )
      solveLegs(rig, Object.fromEntries(LEGS.map((l) => [l, planted(rig, l)])))
    },
  },

  Sit: {
    T: 3,
    fn: (rig, t, T) => {
      const s = sitBase(rig)
      breathe(rig, t, T, 2)
      rig.rot('neck', 0.02 * wave(t, T, 1), 0.1 * wave(t, T, 1, 0.2))
      rig.rot('head', 0, 0, 0.06 * wave(t, T, 1, 0.6))
      tailSway(rig, t, T, 1, 0.12, 0)
      solveLegs(rig, {
        front_L: s.front('front_L'),
        front_R: s.front('front_R'),
        hind_L: s.hind('hind_L'),
        hind_R: s.hind('hind_R'),
      })
    },
  },

  Lie: {
    T: 4,
    fn: (rig, t, T) => {
      const s = lieBase(rig)
      breathe(rig, t, T, 2)
      rig.rot('neck', 0.12 + 0.02 * wave(t, T, 1), 0.1 * wave(t, T, 1, 0.3))
      rig.rot('head', -0.08, 0, 0.06 * wave(t, T, 1, 0.7))
      tailSway(rig, t, T, 1, 0.15, 0)
      solveLegs(rig, {
        front_L: s.front('front_L'),
        front_R: s.front('front_R'),
        hind_L: s.hind('hind_L'),
        hind_R: s.hind('hind_R'),
      })
    },
  },

  Sleep: {
    T: 5,
    fn: (rig, t, T) => {
      const s = lieBase(rig)
      breathe(rig, t, T, 2, 2.2)
      rig.rot('neck', 0.95 + 0.015 * wave(t, T, 2), 0.18)
      rig.rot('head', -0.42, 0.05, 0.18)
      ears(rig, 0.1, -0.08, 0.15)
      for (let i = 0; i < 5; i++)
        rig.rot(`tail_${i}`, i === 0 ? -0.1 : 0, i === 0 ? 0.55 : 0.32)
      solveLegs(rig, {
        front_L: s.front('front_L'),
        front_R: s.front('front_R'),
        hind_L: s.hind('hind_L'),
        hind_R: s.hind('hind_R'),
      })
    },
  },

  Eat: {
    T: 1.2,
    fn: (rig, t, T) => {
      const chew = Math.max(0, wave(t, T, 3))
      rig.hips = add(rig.hips, [0, -0.025, 0])
      rig.rot('spine_0', 0.12)
      rig.rot('spine_2', 0.08)
      rig.rot('neck', 1.02 + 0.05 * wave(t, T, 3, 0.15))
      rig.rot('head', 0.3)
      rig.rot('jaw', 0.06 + 0.16 * chew)
      ears(rig, -0.15, 0.05)
      tailSway(rig, t, T, 2, 0.3, 0.2)
      solveLegs(rig, Object.fromEntries(LEGS.map((l) => [l, planted(rig, l)])))
    },
  },

  Run: {
    T: 0.48,
    fn: (rig, t, T) => {
      const ph = t / T
      // one suspension per stride: the body is highest just after the hind legs push off
      const lift = wave(t, T, 1, -0.15)
      rig.hips = add(rig.hips, [0, 0.045 + 0.045 * lift, 0])
      rig.rot('spine_0', 0.16 * wave(t, T, 1, 0.05))
      // spine flexes when the legs gather under the body and extends in the stretch
      const flex = wave(t, T, 1, 0.3)
      rig.rot('spine_1', -0.12 * flex)
      rig.rot('spine_2', -0.14 * wave(t, T, 1, 0.15) + 0.06 * flex)
      // the head stays steady while the body rocks underneath it
      rig.rot('neck', -0.16 - 0.12 * wave(t, T, 1, 0.1))
      rig.rot('head', 0.1 + 0.05 * wave(t, T, 1, 0.4))
      rig.rot('jaw', 0.2)
      ears(rig, 0.45, 0.12)
      for (let i = 0; i < 5; i++)
        rig.rot(`tail_${i}`, i === 0 ? 0.25 : 0.04, 0.22 * wave(t, T, 2, -i * 0.12))
      const phases: Record<LegName, number> = {
        front_L: 0,
        front_R: 0.12,
        hind_L: 0.52,
        hind_R: 0.64,
      }
      const targets: Partial<Record<LegName, LegTarget>> = {}
      for (const leg of LEGS) {
        const r = rig.legRest(leg)
        const front = leg.startsWith('front')
        const s = (ph + phases[leg]) % 1
        const duty = 0.36
        const A = front ? 0.19 : 0.16
        let z: number
        let y: number
        let curl: number
        if (s < duty) {
          z = mix(A, -A, s / duty)
          y = 0
          curl = 0
        } else {
          const u = (s - duty) / (1 - duty)
          z = mix(-A, A, ease(0, 1, u))
          y = (front ? 0.17 : 0.13) * Math.sin(Math.PI * u)
          curl = Math.sin(Math.PI * Math.min(1, u * 1.2))
        }
        // fold the pastern / paw backwards during the swing
        const fq = qAxisAngle([1, 0, 0], front ? -1.5 * curl : 0.9 * curl)
        targets[leg] = {
          foot: add(r.foot, [0, y, z]),
          pastern: qRotate(fq, r.pastern),
          toe: qRotate(qAxisAngle([1, 0, 0], front ? -1.8 * curl : 1.1 * curl), r.toe),
        }
      }
      solveLegs(rig, targets)
    },
  },

  Roll: {
    T: 2,
    fn: (rig, t, T) => {
      const a = (TAU * t) / T
      // roll around the body's long axis while lying, legs tucked
      rig.hips = add(rig.hips, [0, -0.255 + 0.03 * Math.abs(Math.sin(a)), 0])
      rig.rot('spine_0', 0, 0, a)
      rig.rot('spine_2', 0.05)
      // head low and forward, close to the roll axis, so it never digs into the ground
      rig.rot('neck', 1.0, 0, 0)
      // on its back the head rolls a bit less than the body, looking out sideways
      rig.rot('head', -0.55, 0.15 * Math.sin(a), -0.28 * Math.sin(a))
      ears(rig, 0, 0.1 * Math.sin(a))
      for (let i = 0; i < 5; i++)
        rig.rot(`tail_${i}`, i === 0 ? -0.1 : 0, 0.25 * wave(t, T, 2, -i * 0.1))
      const tuck = (leg: LegName, p: V3, kick: number): LegTarget => {
        const front = leg.startsWith('front')
        const parent = front ? 'spine_2' : 'spine_0'
        const s = leg.endsWith('L') ? 1 : -1
        const bp = rig.carry(
          parent,
          add([p[0] * s, p[1], p[2]], [0, 0.02 * kick, 0.03 * kick]),
        )
        return {
          foot: bp,
          pastern: rig.carryDir(parent, norm([0, -0.6, front ? 1 : 0.8])),
          toe: 'follow',
          pole: rig.carryDir(parent, front ? [0, -0.3, -1] : [0, 0.3, 1]),
        }
      }
      solveLegs(rig, {
        front_L: tuck('front_L', [0.15, 0.24, 0.33], wave(t, T, 4)),
        front_R: tuck('front_R', [0.15, 0.24, 0.33], wave(t, T, 4, 0.5)),
        hind_L: tuck('hind_L', [0.17, 0.24, -0.08], wave(t, T, 4, 0.25)),
        hind_R: tuck('hind_R', [0.17, 0.24, -0.08], wave(t, T, 4, 0.75)),
      })
    },
  },

  Jump: {
    T: 1.3,
    fn: (rig, t, T) => {
      const p = t / T
      // crouch -> push off (stretch) -> tuck at the top -> reach for the ground -> land -> settle
      let y = 0
      if (p < 0.22) y = -0.1 * ease(0, 0.22, p)
      else if (p < 0.34) y = mix(-0.1, 0.1, ease(0.22, 0.34, p))
      else if (p < 0.78) {
        const u = (p - 0.34) / 0.44
        y = 0.1 + 0.34 * 4 * u * (1 - u)
      } else if (p < 0.87) y = mix(0.1, -0.09, ease(0.78, 0.87, p))
      else y = mix(-0.09, 0, ease(0.87, 1, p))
      rig.hips = add(rig.hips, [0, y, 0])
      // nose up on the push-off, level at the top, nose down towards the landing
      const pitch =
        p < 0.22
          ? -0.08 * ease(0, 0.22, p)
          : p < 0.4
            ? mix(-0.08, 0.3, ease(0.22, 0.36, p))
            : p < 0.82
              ? mix(0.3, -0.16, ease(0.4, 0.78, p))
              : mix(-0.16, 0, ease(0.82, 1, p))
      rig.rot('spine_0', -pitch * 0.6)
      rig.rot('spine_2', -pitch * 0.4)
      const air = clamp(ease(0.3, 0.38, p) - ease(0.74, 0.8, p), 0, 1)
      const tuck = clamp(ease(0.36, 0.5, p) - ease(0.6, 0.72, p), 0, 1)
      const reach = clamp(ease(0.6, 0.72, p) - ease(0.8, 0.86, p), 0, 1)
      rig.rot('neck', -0.12 * air + 0.2 * reach - 0.05)
      rig.rot('head', 0.05 - 0.1 * tuck)
      rig.rot('jaw', 0.18 * air)
      ears(rig, 0.2 * air, 0.1 * air)
      for (let i = 0; i < 5; i++)
        rig.rot(
          `tail_${i}`,
          i === 0 ? 0.25 + 0.35 * air : 0.06,
          0.15 * wave(t, T, 2, -i * 0.1),
        )
      const targets: Partial<Record<LegName, LegTarget>> = {}
      for (const leg of LEGS) {
        const front = leg.startsWith('front')
        const s = leg.endsWith('L') ? 1 : -1
        const ground = planted(rig, leg)
        const parent = front ? 'spine_2' : 'spine_0'
        // body-space poses in the air: stretched (push-off), tucked (top), reaching (landing)
        const stretch: V3 = front ? [0.15 * s, 0.17, 0.36] : [0.16 * s, 0.1, -0.44]
        const tucked: V3 = front ? [0.15 * s, 0.22, 0.28] : [0.16 * s, 0.2, -0.18]
        const reaching: V3 = front ? [0.15 * s, 0.05, 0.3] : [0.16 * s, 0.08, -0.26]
        const bodyP = lerp(lerp(stretch, tucked, tuck), reaching, reach)
        const airP = rig.carry(parent, bodyP)
        const curl = rig.carryDir(parent, norm(front ? [0, -0.3, 1] : [0, -0.1, -1]))
        const down = rig.carryDir(parent, ground.pastern!)
        targets[leg] = {
          foot: lerp(ground.foot, airP, air),
          pastern: norm(lerp(ground.pastern!, lerp(curl, down, reach), air)),
          toe: air > 0.5 ? 'follow' : ground.toe,
        }
      }
      solveLegs(rig, targets)
    },
  },

  Sulk: {
    T: 4,
    fn: (rig, t, T) => {
      const s = sitBase(rig)
      // a sigh around 60-80% of the loop
      const sigh = Math.sin(Math.PI * clamp((t / T - 0.55) / 0.3, 0, 1)) ** 2
      rig.rot('spine_2', -0.05 * sigh)
      rig.hips = add(rig.hips, [0, 0.01 * sigh, 0])
      rig.rot('neck', 0.3 - 0.12 * sigh, -0.5)
      rig.rot('head', 0.2 - 0.05 * sigh, -0.1, -0.12)
      ears(rig, 0.3, -0.2, 0.1)
      for (let i = 0; i < 5; i++)
        rig.rot(`tail_${i}`, i === 0 ? -0.25 : 0, i === 0 ? 0.35 : 0.1)
      breathe(rig, t, T, 2)
      solveLegs(rig, {
        front_L: s.front('front_L'),
        front_R: s.front('front_R'),
        hind_L: s.hind('hind_L'),
        hind_R: s.hind('hind_R'),
      })
    },
  },

  PetHappy: {
    T: 1.0,
    fn: (rig, t, T) => {
      const s = sitBase(rig, 0.1)
      rig.rot('neck', -0.12, 0.15)
      rig.rot('head', -0.12, 0, 0.32 + 0.04 * wave(t, T, 2))
      ears(rig, -0.1, 0.12)
      for (let i = 0; i < 5; i++)
        rig.rot(
          `tail_${i}`,
          i === 0 ? 0.1 : 0.05,
          (i === 0 ? 0.5 : 0.25) * wave(t, T, 4, -i * 0.08),
        )
      // left hind leg (camera side) thumps in the air: the scratch reflex
      const k = wave(t, T, 6)
      const kickP = rig.carry('spine_0', [0.25, 0.22 + 0.04 * k, -0.04 + 0.07 * k])
      solveLegs(rig, {
        front_L: s.front('front_L'),
        front_R: s.front('front_R'),
        hind_L: {
          foot: kickP,
          pastern: norm([0, -0.2 + 0.2 * k, 1]),
          toe: 'follow',
          pole: [0.3, 0.6, 1],
        },
        hind_R: s.hind('hind_R'),
      })
    },
  },
}

// ---------- baking ----------

function continuous(prev: Q | null, q: Q): Q {
  if (!prev) return q
  const d = prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3]
  return d < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q
}

export function buildClips(p: DogParams, bones: BoneDef[]): Clip[] {
  const toeTips = {
    front_L: toeTip(p, true, 1),
    front_R: toeTip(p, true, -1),
    hind_L: toeTip(p, false, 1),
    hind_R: toeTip(p, false, -1),
  }
  const rig = new Rig(bones, toeTips)
  const clips: Clip[] = []
  for (const [name, { T, fn }] of Object.entries(CLIPS)) {
    const n = Math.round(T * FPS)
    const times = new Float32Array(n + 1)
    const rot = bones.map(() => new Float32Array((n + 1) * 4))
    const hips = new Float32Array((n + 1) * 3)
    const prev: Array<Q | null> = bones.map(() => null)
    for (let f = 0; f <= n; f++) {
      // the last frame re-evaluates t = 0 so the loop closes exactly
      const t = f === n ? 0 : (f / n) * T
      times[f] = (f / n) * T
      rig.reset()
      fn(rig, t, T)
      bones.forEach((_, i) => {
        const q = continuous(prev[i], rig.q[i])
        prev[i] = q
        rot[i].set(q, f * 4)
      })
      hips.set(add(sub(bones[rig.i('spine_0')].head, [0, 0, 0]), rig.hips), f * 3)
    }
    const tracks: Track[] = bones.map((b, i) => ({
      bone: b.name,
      path: 'rotation',
      times,
      values: rot[i],
    }))
    // spine_0 translation is relative to its parent (root at the origin)
    tracks.push({ bone: 'spine_0', path: 'translation', times, values: hips })
    clips.push({ name, tracks })
  }
  return clips
}

/** For tests: evaluates one clip at time t and returns the rig. */
export function poseAt(p: DogParams, bones: BoneDef[], clip: string, t: number): Rig {
  const toeTips = {
    front_L: toeTip(p, true, 1),
    front_R: toeTip(p, true, -1),
    hind_L: toeTip(p, false, 1),
    hind_R: toeTip(p, false, -1),
  }
  const rig = new Rig(bones, toeTips)
  const c = CLIPS[clip]
  c.fn(rig, t, c.T)
  return rig
}

export const CLIP_NAMES = Object.keys(CLIPS)
export const CLIP_DURATIONS: Record<string, number> = Object.fromEntries(
  Object.entries(CLIPS).map(([k, c]) => [k, c.T]),
)
