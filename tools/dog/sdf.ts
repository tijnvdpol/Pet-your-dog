/**
 * Signed distance functions as a small CSG tree.
 *
 * Every leaf carries the bone it belongs to and an id, so the same tree can be used for:
 * - meshing (compiled distance function),
 * - "ownership": how much each leaf contributes to a surface point (drives skin weights,
 *   colour zones and morph-target correspondence),
 * - per-leaf affine frames (to carry vertices from one parameter set to another).
 */
import {
  type M4,
  type Q,
  type V3,
  cross,
  dot,
  len,
  m4Compose,
  m4FromBasis,
  norm,
  qConj,
  qRotate,
  scale,
  sub,
} from './math'

export type Shape =
  | { type: 'ellipsoid'; c: V3; r: V3; q?: Q }
  | { type: 'roundCone'; a: V3; b: V3; ra: number; rb: number }
  /** Half-space; inside where dot(p - o, n) < 0. */
  | { type: 'plane'; o: V3; n: V3 }

export interface Leaf {
  kind: 'leaf'
  name: string
  shape: Shape
  /** Bone that moves this part. */
  bone: string
  /** Filled in by `indexLeaves`. */
  id: number
}

export type SdfNode =
  | Leaf
  | { kind: 'union'; k: number; s?: number; children: SdfNode[] }
  | { kind: 'intersect'; k: number; s?: number; children: SdfNode[] }
  | { kind: 'subtract'; k: number; s?: number; a: SdfNode; b: SdfNode }

export type DistFn = (x: number, y: number, z: number) => number

// ---------- builders ----------

export const leaf = (name: string, bone: string, shape: Shape): Leaf => ({
  kind: 'leaf',
  name,
  shape,
  bone,
  id: -1,
})
export const ellipsoid = (name: string, bone: string, c: V3, r: V3, q?: Q) =>
  leaf(name, bone, { type: 'ellipsoid', c, r, q })
export const roundCone = (
  name: string,
  bone: string,
  a: V3,
  b: V3,
  ra: number,
  rb = ra,
) => leaf(name, bone, { type: 'roundCone', a, b, ra, rb })
export const plane = (name: string, bone: string, o: V3, n: V3) =>
  leaf(name, bone, { type: 'plane', o, n: norm(n) })
export const union = (k: number, ...children: SdfNode[]): SdfNode => ({
  kind: 'union',
  k,
  children,
})
/** Union with an explicit ownership softness `s` (e.g. hard geometry, soft skinning). */
export const unionS = (k: number, s: number, ...children: SdfNode[]): SdfNode => ({
  kind: 'union',
  k,
  s,
  children,
})
export const intersect = (k: number, ...children: SdfNode[]): SdfNode => ({
  kind: 'intersect',
  k,
  children,
})
export const subtract = (k: number, a: SdfNode, b: SdfNode): SdfNode => ({
  kind: 'subtract',
  k,
  a,
  b,
})

/** Assigns ids in depth-first order and returns the leaves. */
export function indexLeaves(root: SdfNode): Leaf[] {
  const out: Leaf[] = []
  const walk = (n: SdfNode) => {
    if (n.kind === 'leaf') {
      n.id = out.length
      out.push(n)
    } else if (n.kind === 'subtract') {
      walk(n.a)
      walk(n.b)
    } else n.children.forEach(walk)
  }
  walk(root)
  return out
}

// ---------- smooth min / max ----------

/** Quadratic polynomial smooth minimum (k = blend radius). */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

// ---------- primitive distances ----------

function ellipsoidFn(c: V3, r: V3, q?: Q): DistFn {
  const [cx, cy, cz] = c
  const [rx, ry, rz] = r
  const irx = 1 / rx
  const iry = 1 / ry
  const irz = 1 / rz
  const irx2 = irx * irx
  const iry2 = iry * iry
  const irz2 = irz * irz
  const local = (x: number, y: number, z: number) => {
    // Approximate ellipsoid distance (Quilez): exact on the surface, good near it.
    const k0 = Math.sqrt(x * x * irx * irx + y * y * iry * iry + z * z * irz * irz)
    const k1 = Math.sqrt(x * x * irx2 * irx2 + y * y * iry2 * iry2 + z * z * irz2 * irz2)
    if (k1 === 0) return -Math.min(rx, ry, rz)
    return (k0 * (k0 - 1)) / k1
  }
  if (!q) return (x, y, z) => local(x - cx, y - cy, z - cz)
  const inv = qConj(q)
  // rotation matrix of inv (row-major)
  const ex = qRotate(inv, [1, 0, 0])
  const ey = qRotate(inv, [0, 1, 0])
  const ez = qRotate(inv, [0, 0, 1])
  return (x, y, z) => {
    const px = x - cx
    const py = y - cy
    const pz = z - cz
    return local(
      ex[0] * px + ey[0] * py + ez[0] * pz,
      ex[1] * px + ey[1] * py + ez[1] * pz,
      ex[2] * px + ey[2] * py + ez[2] * pz,
    )
  }
}

function roundConeFn(a: V3, b: V3, r1: number, r2: number): DistFn {
  // Exact round cone (Quilez).
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  return (x, y, z) => {
    const pax = x - a[0]
    const pay = y - a[1]
    const paz = z - a[2]
    const yy = pax * bax + pay * bay + paz * baz
    const zz = yy - l2
    const qx = pax * l2 - bax * yy
    const qy = pay * l2 - bay * yy
    const qz = paz * l2 - baz * yy
    const x2 = qx * qx + qy * qy + qz * qz
    const y2 = yy * yy * l2
    const z2 = zz * zz * l2
    const k = Math.sign(rr) * rr * rr * x2
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1
  }
}

export function shapeFn(s: Shape): DistFn {
  switch (s.type) {
    case 'ellipsoid':
      return ellipsoidFn(s.c, s.r, s.q)
    case 'roundCone':
      return roundConeFn(s.a, s.b, s.ra, s.rb)
    case 'plane': {
      const [ox, oy, oz] = s.o
      const [nx, ny, nz] = s.n
      return (x, y, z) => (x - ox) * nx + (y - oy) * ny + (z - oz) * nz
    }
  }
}

// ---------- bounds (for fast evaluation) ----------

interface Bound {
  c: V3
  r: number
}
const INFINITE: Bound = { c: [0, 0, 0], r: Infinity }

function shapeBound(s: Shape): Bound {
  switch (s.type) {
    case 'ellipsoid':
      return { c: s.c, r: Math.max(...s.r) }
    case 'roundCone':
      return {
        c: scale([s.a[0] + s.b[0], s.a[1] + s.b[1], s.a[2] + s.b[2]], 0.5),
        r: len(sub(s.b, s.a)) / 2 + Math.max(s.ra, s.rb),
      }
    case 'plane':
      return INFINITE
  }
}

function mergeBounds(bs: Bound[], pad: number): Bound {
  if (bs.some((b) => !Number.isFinite(b.r))) return INFINITE
  // Simple (not minimal) enclosing sphere: centroid + max reach.
  const c: V3 = [0, 0, 0]
  for (const b of bs) for (let i = 0; i < 3; i++) c[i] += b.c[i] / bs.length
  let r = 0
  for (const b of bs) r = Math.max(r, len(sub(b.c, c)) + b.r)
  return { c, r: r + pad }
}

// ---------- compilation ----------

interface Compiled {
  fn: DistFn
  bound: Bound
}

const BOUND_MARGIN = 0.03

function compileNode(n: SdfNode): Compiled {
  if (n.kind === 'leaf') return { fn: shapeFn(n.shape), bound: shapeBound(n.shape) }
  if (n.kind === 'subtract') {
    const a = compileNode(n.a)
    const b = compileNode(n.b)
    const k = n.k
    return { fn: (x, y, z) => smax(a.fn(x, y, z), -b.fn(x, y, z), k), bound: a.bound }
  }
  const kids = n.children.map(compileNode)
  const k = n.k
  if (n.kind === 'intersect') {
    const finite = kids.filter((c) => Number.isFinite(c.bound.r))
    const bound = finite.length
      ? finite.reduce((m, c) => (c.bound.r < m.r ? c.bound : m), finite[0].bound)
      : INFINITE
    return {
      fn: (x, y, z) => {
        let d = kids[0].fn(x, y, z)
        for (let i = 1; i < kids.length; i++) d = smax(d, kids[i].fn(x, y, z), k)
        return d
      },
      bound,
    }
  }
  // union: skip children whose bounding sphere is too far away to matter
  const fns = kids.map((c) => c.fn)
  const bc = kids.map((c) => c.bound)
  const m = fns.length
  return {
    fn: (x, y, z) => {
      let d = Infinity
      for (let i = 0; i < m; i++) {
        const b = bc[i]
        if (d !== Infinity && Number.isFinite(b.r)) {
          const lb = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r - BOUND_MARGIN
          if (lb > d + k) continue
        }
        const di = fns[i](x, y, z)
        d = d === Infinity ? di : smin(d, di, k)
      }
      return d
    },
    bound: mergeBounds(bc, k),
  }
}

export const compile = (root: SdfNode): DistFn => compileNode(root).fn

/** Central-difference gradient. */
export function gradient(f: DistFn, p: V3, e = 1e-4): V3 {
  const [x, y, z] = p
  return [
    (f(x + e, y, z) - f(x - e, y, z)) / (2 * e),
    (f(x, y + e, z) - f(x, y - e, z)) / (2 * e),
    (f(x, y, z + e) - f(x, y, z - e)) / (2 * e),
  ]
}

/** Moves `p` onto the zero level set with a few Newton steps (step length capped). */
export function project(f: DistFn, p: V3, iters = 6, maxStep = 0.05): V3 {
  let q: V3 = [p[0], p[1], p[2]]
  for (let i = 0; i < iters; i++) {
    const d = f(q[0], q[1], q[2])
    if (Math.abs(d) < 1e-6) break
    const g = gradient(f, q)
    const g2 = dot(g, g)
    if (g2 < 1e-12) break
    let s = d / g2
    const step = Math.abs(s) * Math.sqrt(g2)
    if (step > maxStep) s *= maxStep / step
    q = [q[0] - g[0] * s, q[1] - g[1] * s, q[2] - g[2] * s]
  }
  return q
}

// ---------- ownership ----------

/** Softness of the ownership blend for a node (distance units). */
const nodeSoftness = (n: { k: number; s?: number }) => n.s ?? n.k * 0.45 + 0.004

interface Own {
  d: number
  /** [leafId, weight] pairs, weights sum to 1. */
  w: Array<[number, number]>
}

function ownNode(n: SdfNode, ld: Float64Array): Own {
  if (n.kind === 'leaf') return { d: ld[n.id], w: [[n.id, 1]] }
  let parts: Own[]
  let ds: number[]
  let d: number
  let sign: 1 | -1
  if (n.kind === 'subtract') {
    const a = ownNode(n.a, ld)
    const b = ownNode(n.b, ld)
    parts = [a, b]
    ds = [a.d, -b.d]
    d = smax(a.d, -b.d, n.k)
    sign = 1
  } else {
    parts = n.children.map((c) => ownNode(c, ld))
    ds = parts.map((p) => p.d)
    sign = n.kind === 'union' ? -1 : 1
    d = ds[0]
    for (let i = 1; i < ds.length; i++)
      d = n.kind === 'union' ? smin(d, ds[i], n.k) : smax(d, ds[i], n.k)
  }
  // softmax over children: union favours the smallest distance, intersect/subtract the largest
  const s = nodeSoftness(n)
  const best = sign < 0 ? Math.min(...ds) : Math.max(...ds)
  const raw = ds.map((di) => Math.exp((sign * (di - best)) / s))
  const tot = raw.reduce((a, b) => a + b, 0)
  const acc = new Map<number, number>()
  parts.forEach((p, i) => {
    const wi = raw[i] / tot
    if (wi < 1e-4) return
    for (const [id, w] of p.w) acc.set(id, (acc.get(id) ?? 0) + w * wi)
  })
  return { d, w: [...acc.entries()] }
}

/** How much each leaf "owns" the surface at p. */
export function ownership(root: SdfNode, leaves: Leaf[], p: V3): Array<[number, number]> {
  const ld = new Float64Array(leaves.length)
  for (const l of leaves) ld[l.id] = shapeFn(l.shape)(p[0], p[1], p[2])
  return ownNode(root, ld).w
}

/** Faster repeated ownership: precompiles leaf functions. */
export function ownershipFn(root: SdfNode, leaves: Leaf[]) {
  const fns = leaves.map((l) => shapeFn(l.shape))
  const ld = new Float64Array(leaves.length)
  return (p: V3) => {
    for (let i = 0; i < fns.length; i++) ld[i] = fns[i](p[0], p[1], p[2])
    return ownNode(root, ld).w
  }
}

// ---------- frames (for carrying points between parameter sets) ----------

function perpBasis(z: V3): [V3, V3] {
  const zn = norm(z)
  const ref: V3 = Math.abs(zn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const x = norm(sub(ref, scale(zn, dot(ref, zn))))
  return [x, cross(zn, x)]
}

/** Affine frame of a leaf (unit primitive -> world). */
export function leafFrame(s: Shape): M4 {
  switch (s.type) {
    case 'ellipsoid':
      return m4Compose(s.c, s.q ?? [0, 0, 0, 1], s.r)
    case 'roundCone': {
      const z = sub(s.b, s.a)
      const [x, y] = perpBasis(z)
      const r = (s.ra + s.rb) / 2
      return m4FromBasis(scale(x, r), scale(y, r), z, s.a)
    }
    case 'plane': {
      const [x, y] = perpBasis(s.n)
      return m4FromBasis(x, y, s.n, s.o)
    }
  }
}
