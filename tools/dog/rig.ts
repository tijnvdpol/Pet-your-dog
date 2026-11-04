/** Forward kinematics + analytic leg IK on the dog skeleton (rest rotations are identity). */
import type { BoneDef } from './dogModel'
import {
  type Q,
  type V3,
  add,
  cross,
  dot,
  len,
  norm,
  qConj,
  qEuler,
  qFromBases,
  qIdentity,
  qMul,
  qRotate,
  scale,
  sub,
} from './math'

export type LegName = 'front_L' | 'front_R' | 'hind_L' | 'hind_R'
export const LEGS: LegName[] = ['front_L', 'front_R', 'hind_L', 'hind_R']

export interface LegTarget {
  /** World position for the foot joint (bone 3). */
  foot: V3
  /** World direction of the pastern / metatarsus (bone 2 -> bone 3). Default: rest direction. */
  pastern?: V3
  /** World direction of the paw (bone 3 -> toe tip); 'follow' keeps it aligned with the pastern. */
  toe?: V3 | 'follow'
  /** Bend direction for the elbow / knee. */
  pole?: V3
}

export class Rig {
  readonly bones: BoneDef[]
  readonly index: Map<string, number>
  readonly parent: number[]
  readonly rest: V3[]
  readonly offset: V3[]
  q: Q[]
  hips: V3 = [0, 0, 0]
  private wq: Q[] = []
  private wp: V3[] = []
  private dirty = true
  private toeTips: Record<LegName, V3>

  constructor(bones: BoneDef[], toeTips: Record<LegName, V3>) {
    this.bones = bones
    this.index = new Map(bones.map((b, i) => [b.name, i]))
    this.parent = bones.map((b) => (b.parent ? this.index.get(b.parent)! : -1))
    this.rest = bones.map((b) => b.head)
    this.offset = bones.map((b, i) =>
      this.parent[i] < 0 ? b.head : sub(b.head, this.rest[this.parent[i]]),
    )
    this.q = bones.map(() => qIdentity())
    this.toeTips = toeTips
  }

  reset() {
    this.q = this.bones.map(() => qIdentity())
    this.hips = [0, 0, 0]
    this.dirty = true
  }

  i(name: string) {
    const i = this.index.get(name)
    if (i === undefined) throw new Error(`no bone ${name}`)
    return i
  }

  /** Local rotation as Euler XYZ (radians). Rotations compose onto what is already set. */
  rot(name: string, x: number, y = 0, z = 0) {
    const i = this.i(name)
    this.q[i] = qMul(this.q[i], qEuler(x, y, z))
    this.dirty = true
  }

  setQ(name: string, q: Q) {
    this.q[this.i(name)] = q
    this.dirty = true
  }

  private fk() {
    if (!this.dirty) return
    const n = this.bones.length
    this.wq = new Array(n)
    this.wp = new Array(n)
    for (let i = 0; i < n; i++) {
      const p = this.parent[i]
      let t = this.offset[i]
      if (this.bones[i].name === 'spine_0') t = add(t, this.hips)
      if (p < 0) {
        this.wq[i] = this.q[i]
        this.wp[i] = t
      } else {
        this.wq[i] = qMul(this.wq[p], this.q[i])
        this.wp[i] = add(this.wp[p], qRotate(this.wq[p], t))
      }
    }
    this.dirty = false
  }

  worldPos(name: string): V3 {
    this.fk()
    return this.wp[this.i(name)]
  }
  worldQ(name: string): Q {
    this.fk()
    return this.wq[this.i(name)]
  }

  /** A rest-pose world point carried along with bone `name`. */
  carry(name: string, restPoint: V3): V3 {
    this.fk()
    const i = this.i(name)
    return add(this.wp[i], qRotate(this.wq[i], sub(restPoint, this.rest[i])))
  }
  /** A rest-pose world direction carried along with bone `name`. */
  carryDir(name: string, dir: V3): V3 {
    return qRotate(this.worldQ(name), dir)
  }

  restDir(a: string, b: string): V3 {
    return norm(sub(this.rest[this.i(b)], this.rest[this.i(a)]))
  }

  /** Rest pastern direction and rest foot position of a leg. */
  legRest(leg: LegName) {
    return {
      foot: this.rest[this.i(`${leg}_3`)],
      pastern: this.restDir(`${leg}_2`, `${leg}_3`),
      toe: norm(sub(this.toeTips[leg], this.rest[this.i(`${leg}_3`)])),
    }
  }

  /** Two-bone IK for bones 0/1 plus fixed directions for bones 2/3. */
  solveLeg(leg: LegName, t: LegTarget) {
    this.fk()
    const names = [0, 1, 2, 3].map((k) => `${leg}_${k}`)
    const ids = names.map((n) => this.i(n))
    const parent = this.parent[ids[0]]
    const pq = this.wq[parent]
    const side = qRotate(pq, [1, 0, 0])
    const fwd = qRotate(pq, [0, 0, 1])
    const front = leg.startsWith('front')
    const r = this.rest
    const l0 = len(sub(r[ids[1]], r[ids[0]]))
    const l1 = len(sub(r[ids[2]], r[ids[1]]))
    const l2 = len(sub(r[ids[3]], r[ids[2]]))
    const restDirs: V3[] = [
      norm(sub(r[ids[1]], r[ids[0]])),
      norm(sub(r[ids[2]], r[ids[1]])),
      norm(sub(r[ids[3]], r[ids[2]])),
      norm(sub(this.toeTips[leg], r[ids[3]])),
    ]
    const pastern = norm(t.pastern ?? qRotate(pq, restDirs[2]))
    const A = this.wp[ids[0]]
    const C = sub(t.foot, scale(pastern, l2)) // where bone 2 must start
    let D = sub(C, A)
    let d = len(D)
    const dHat = norm(D)
    d = Math.min(Math.max(d, Math.abs(l0 - l1) + 1e-4), l0 + l1 - 1e-4)
    D = scale(dHat, d)
    const pole = norm(t.pole ?? scale(fwd, front ? -1 : 1))
    let u = sub(pole, scale(dHat, dot(pole, dHat)))
    if (len(u) < 1e-6) u = cross(side, dHat)
    u = norm(u)
    const a = (l0 * l0 - l1 * l1 + d * d) / (2 * d)
    const h = Math.sqrt(Math.max(l0 * l0 - a * a, 0))
    const K = add(A, add(scale(dHat, a), scale(u, h)))
    const C2 = add(A, D)
    const dirs: V3[] = [norm(sub(K, A)), norm(sub(C2, K)), pastern]
    const toe = t.toe === 'follow' || t.toe === undefined ? null : norm(t.toe)

    const basis = (dir: V3, s: V3): [V3, V3, V3] => {
      const y = dir
      let x = sub(s, scale(y, dot(s, y)))
      if (len(x) < 1e-6) x = [0, 0, 1]
      x = norm(x)
      return [x, y, cross(x, y)]
    }
    let parentWQ = pq
    for (let k = 0; k < 4; k++) {
      let W: Q
      if (k < 3) W = qFromBases(basis(restDirs[k], [1, 0, 0]), basis(dirs[k], side))
      else if (toe) W = qFromBases(basis(restDirs[3], [1, 0, 0]), basis(toe, side))
      else W = parentWQ // follow the pastern
      this.q[ids[k]] = qMul(qConj(parentWQ), W)
      parentWQ = W
    }
    this.dirty = true
  }
}
