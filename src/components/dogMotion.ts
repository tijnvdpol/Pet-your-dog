import { Euler, MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three'

export const DOG_ANIMATIONS = [
  'Idle',
  'Wag',
  'Sit',
  'Lie',
  'Sleep',
  'Eat',
  'Run',
  'Roll',
  'Jump',
  'Sulk',
  'PetHappy',
] as const
export type DogAnimation = (typeof DOG_ANIMATIONS)[number]

export const FACE_MORPHS = ['blink', 'mouth_open', 'happy_eyes', 'sad_brows'] as const
export type FaceMorph = (typeof FACE_MORPHS)[number]
export type Face = Record<FaceMorph, number>

/**
 * Facial expression per animation. Face morphs are driven here (not in the clips) so that
 * clips never overwrite the shape morphs, and expressions blend smoothly on their own.
 */
export const FACE_BY_ANIMATION: Record<DogAnimation, Partial<Face>> = {
  Idle: { mouth_open: 0.06 },
  Wag: { mouth_open: 0.55, happy_eyes: 0.35 },
  Sit: { mouth_open: 0.15 },
  Lie: { mouth_open: 0.1 },
  Sleep: { blink: 1 },
  Eat: {},
  Run: { mouth_open: 0.75 },
  Roll: { mouth_open: 0.6, happy_eyes: 0.6 },
  Jump: { mouth_open: 0.7 },
  Sulk: { sad_brows: 1 },
  PetHappy: { happy_eyes: 1, mouth_open: 0.6 },
}

/** Damped spring per angle axis. */
class Spring {
  x = 0
  v = 0
  private omega: number
  private zeta: number
  constructor(omega: number, zeta: number) {
    this.omega = omega
    this.zeta = zeta
  }
  step(target: number, dt: number) {
    const a =
      this.omega * this.omega * (target - this.x) - 2 * this.zeta * this.omega * this.v
    this.v += a * dt
    this.x += this.v * dt
    return this.x
  }
  reset() {
    this.x = 0
    this.v = 0
  }
}

const tmpQ = new Quaternion()
const tmpQ2 = new Quaternion()
const tmpV = new Vector3()
const X = new Vector3(1, 0, 0)
const Z = new Vector3(0, 0, 1)

interface EarState {
  root: Bone
  tip: Bone
  side: 1 | -1
  prev: Vector3 | null
  vel: Vector3
  acc: Vector3
  swing: [Spring, Spring]
  flap: [Spring, Spring]
}

/**
 * Secondary motion applied after the animation mixer: ears lag and wobble behind head
 * movement, and the tail follows its animated pose with increasing delay towards the tip.
 */
export class SecondaryMotion {
  private ears: EarState[] = []
  private tail: Bone[] = []
  private tailQ: Quaternion[] = []
  private head: Bone | null = null
  enabled = true
  /** 1 = upright ears (stiffer, less floppy). */
  earStiffness = 0

  constructor(root: Object3D) {
    const bone = (n: string) => root.getObjectByName(n) as Bone | undefined
    this.head = bone('head') ?? null
    for (const [s, n] of [
      [1, 'L'],
      [-1, 'R'],
    ] as const) {
      const r = bone(`ear_${n}_0`)
      const t = bone(`ear_${n}_1`)
      if (r && t)
        this.ears.push({
          root: r,
          tip: t,
          side: s,
          prev: null,
          vel: new Vector3(),
          acc: new Vector3(),
          swing: [new Spring(15, 0.35), new Spring(19, 0.3)],
          flap: [new Spring(14, 0.38), new Spring(18, 0.32)],
        })
    }
    for (let i = 0; i < 5; i++) {
      const b = bone(`tail_${i}`)
      if (b) {
        this.tail.push(b)
        this.tailQ.push(b.quaternion.clone())
      }
    }
  }

  reset() {
    for (const e of this.ears) {
      e.prev = null
      e.vel.set(0, 0, 0)
      e.acc.set(0, 0, 0)
      for (const s of [...e.swing, ...e.flap]) s.reset()
    }
    this.tail.forEach((b, i) => this.tailQ[i].copy(b.quaternion))
  }

  /** Call after mixer.update(); `root` must have up-to-date world matrices. */
  update(dt: number) {
    if (!this.enabled || dt <= 0) return
    dt = Math.min(dt, 1 / 20)

    // tail: each bone eases towards its animated rotation, slower towards the tip
    const rates = [60, 34, 24, 18, 14]
    this.tail.forEach((b, i) => {
      const k = 1 - Math.exp(-rates[i] * dt)
      this.tailQ[i].slerp(b.quaternion, k)
      b.quaternion.copy(this.tailQ[i])
    })

    // ears: driven by the acceleration of the ear root in head space
    const loose = 1 - 0.7 * this.earStiffness
    for (const e of this.ears) {
      e.root.updateWorldMatrix(true, false)
      const p = e.root.getWorldPosition(tmpV)
      if (!e.prev) {
        e.prev = p.clone()
        continue
      }
      const v = p.clone().sub(e.prev).divideScalar(dt)
      const a = v.clone().sub(e.vel).divideScalar(dt)
      e.vel.copy(v)
      e.acc.lerp(a, 0.5)
      e.prev.copy(p)
      // into head space
      const hq = (this.head ?? e.root).getWorldQuaternion(tmpQ).invert()
      const al = e.acc.clone().applyQuaternion(hq).clampLength(0, 40)
      // forward/back swing (about x) and outward flap (about z), both lagging the head
      const k = 0.005 * loose
      const swingT = MathUtils.clamp(al.z * k, -0.3, 0.3)
      const flapT = MathUtils.clamp((-al.y - e.side * al.x) * k, -0.3, 0.3)
      const s0 = e.swing[0].step(swingT, dt)
      const s1 = e.swing[1].step(s0 * 1.15, dt)
      const f0 = e.flap[0].step(flapT, dt)
      const f1 = e.flap[1].step(f0 * 1.15, dt)
      e.root.quaternion
        .multiply(tmpQ2.setFromAxisAngle(X, s0))
        .multiply(tmpQ.setFromAxisAngle(Z, e.side * f0))
      e.tip.quaternion
        .multiply(tmpQ2.setFromAxisAngle(X, s1 - s0))
        .multiply(tmpQ.setFromAxisAngle(Z, e.side * (f1 - f0)))
    }
  }
}

/** Natural blinking: random intervals, quick close-open. */
export class Blinker {
  private next = 1.5 + Math.random() * 2
  private t = 0
  value(dt: number) {
    this.t += dt
    if (this.t > this.next + 0.18) {
      this.t = 0
      this.next = 2.2 + Math.random() * 3.5
    }
    const u = (this.t - this.next) / 0.18
    return u < 0 || u > 1 ? 0 : Math.sin(u * Math.PI)
  }
}

/** Animations in which the dog turns its head towards the viewer. */
const LOOK_ANIMS = new Set<DogAnimation>(['Idle', 'Wag', 'Sit', 'Lie', 'PetHappy'])

const qa = new Quaternion()
const qb = new Quaternion()
const va = new Vector3()
const vb = new Vector3()

/**
 * Turns neck and head towards a target (the camera), on top of the clip. Limited angles and
 * smoothing keep it natural; the clip's own head motion stays visible underneath.
 */
export class LookAt {
  private neck: Bone | null
  private head: Bone | null
  private weight = 0
  private yaw = 0
  private pitch = 0

  constructor(root: Object3D) {
    this.neck = (root.getObjectByName('neck') as Bone) ?? null
    this.head = (root.getObjectByName('head') as Bone) ?? null
  }

  /** Yaw / pitch (radians) that would point the head's +z at `target`. */
  private aim(target: Vector3): [number, number] {
    const head = this.head!
    head.updateWorldMatrix(true, false)
    head.getWorldPosition(va)
    head.getWorldQuaternion(qa)
    const d = vb.copy(target).sub(va).applyQuaternion(qa.invert())
    const yaw = Math.atan2(d.x, d.z)
    const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z))
    return [MathUtils.clamp(yaw, -0.75, 0.75), MathUtils.clamp(pitch, -0.4, 0.35)]
  }

  update(target: Vector3, animation: DogAnimation, dt: number, instant = false) {
    if (!this.neck || !this.head) return
    const want = LOOK_ANIMS.has(animation) ? 1 : 0
    this.weight = instant ? want : MathUtils.damp(this.weight, want, 3, dt)
    if (this.weight < 0.001) return
    const [y, p] = this.aim(target)
    this.yaw = instant ? y : MathUtils.damp(this.yaw, y, 5, dt)
    this.pitch = instant ? p : MathUtils.damp(this.pitch, p, 5, dt)
    // a third in the neck, the rest in the head (re-aimed after the neck moved)
    const w = this.weight * 0.85
    this.neck.quaternion.multiply(
      qb.setFromEuler(eul.set(this.pitch * 0.35 * w, this.yaw * 0.35 * w, 0)),
    )
    const [y2, p2] = this.aim(target)
    this.head.quaternion.multiply(qb.setFromEuler(eul.set(p2 * w * 0.9, y2 * w * 0.9, 0)))
  }
}
const eul = new Euler()
