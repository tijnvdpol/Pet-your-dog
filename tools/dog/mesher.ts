/**
 * SDF -> triangle mesh.
 *
 * Surface nets on a grid that is symmetric around x = 0. Only the x >= 0 half is meshed; the
 * vertices on the centre line get x = 0 exactly, so the half can be smoothed and simplified
 * with that border locked and then mirrored into a perfectly symmetric, watertight mesh.
 */
import { MeshoptSimplifier } from 'meshoptimizer'
import { type V3 } from './math'
import { type DistFn, project } from './sdf'

export interface Mesh {
  positions: Float32Array
  indices: Uint32Array
}

export interface HalfMesh extends Mesh {
  /** 1 for vertices on the symmetry plane (x = 0). */
  central: Uint8Array
}

export interface GridSpec {
  /** Half-width in x (the grid covers -xMax..xMax). */
  xMax: number
  y: [number, number]
  z: [number, number]
  h: number
}

/**
 * Samples f on the symmetric grid. Uses a coarse pass to skip blocks far from the surface,
 * and only evaluates the x > 0 half (mirroring the rest).
 */
function sampleGrid(f: DistFn, g: GridSpec) {
  const { h } = g
  const half = Math.ceil(g.xMax / h)
  const nx = half * 2
  const ny = Math.ceil((g.y[1] - g.y[0]) / h) + 1
  const nz = Math.ceil((g.z[1] - g.z[0]) / h) + 1
  const xs = new Float64Array(nx)
  for (let i = 0; i < nx; i++) xs[i] = (i - half + 0.5) * h
  const v = new Float32Array(nx * ny * nz)
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  const B = 4
  const reach = B * h * Math.sqrt(3) * 1.6
  let evaluated = 0
  for (let bi = half; bi < nx; bi += B)
    for (let bj = 0; bj < ny; bj += B)
      for (let bk = 0; bk < nz; bk += B) {
        const i1 = Math.min(bi + B, nx - 1)
        const j1 = Math.min(bj + B, ny - 1)
        const k1 = Math.min(bk + B, nz - 1)
        // probe the block centre: if far from the surface, the whole block has one sign
        const cx = (xs[bi] + xs[i1]) / 2
        const cy = g.y[0] + ((bj + j1) / 2) * h
        const cz = g.z[0] + ((bk + k1) / 2) * h
        const dc = f(cx, cy, cz)
        evaluated++
        const near = Math.abs(dc) < reach
        for (let i = bi; i <= i1; i++)
          for (let j = bj; j <= j1; j++)
            for (let k = bk; k <= k1; k++) {
              let d: number
              if (near) {
                d = f(xs[i], g.y[0] + j * h, g.z[0] + k * h)
                evaluated++
              } else d = dc
              v[idx(i, j, k)] = d
              v[idx(nx - 1 - i, j, k)] = d
            }
      }
  return { v, nx, ny, nz, xs, idx, half, evaluated }
}

/** Surface nets on the x >= 0 half. */
export function surfaceNetsHalf(f: DistFn, g: GridSpec): HalfMesh {
  const { v, nx, ny, nz, xs, idx, half } = sampleGrid(f, g)
  const { h } = g
  const ic = half - 1 // the cell column straddling x = 0
  const cnx = nx - 1
  const cny = ny - 1
  const cellIdx = (i: number, j: number, k: number) => (k * cny + j) * cnx + i
  const cellVert = new Int32Array(cnx * cny * (nz - 1)).fill(-1)
  const pos: number[] = []
  const central: number[] = []
  const corners: Array<[number, number, number]> = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ]
  const edges: Array<[number, number]> = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const cv = new Float64Array(8)
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = ic; i < nx - 1; i++) {
        let neg = 0
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = corners[c]
          cv[c] = v[idx(i + di, j + dj, k + dk)]
          if (cv[c] < 0) neg++
        }
        if (neg === 0 || neg === 8) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue
          const t = cv[a] / (cv[a] - cv[b])
          const [ai, aj, ak] = corners[a]
          const [bi, bj, bk] = corners[b]
          sx += xs[i + ai] + (xs[i + bi] - xs[i + ai]) * t
          sy += g.y[0] + (j + aj + (bj - aj) * t) * h
          sz += g.z[0] + (k + ak + (bk - ak) * t) * h
          n++
        }
        cellVert[cellIdx(i, j, k)] = pos.length / 3
        const isCentral = i === ic
        pos.push(isCentral ? 0 : sx / n, sy / n, sz / n)
        central.push(isCentral ? 1 : 0)
      }

  const tris: number[] = []
  const P = (vi: number): V3 => [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]
  const d2 = (a: number, b: number) => {
    const pa = P(a)
    const pb = P(b)
    return (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2
  }
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) [b, d] = [d, b]
    // split along the shorter diagonal
    if (d2(a, c) <= d2(b, d)) tris.push(a, b, c, a, c, d)
    else tris.push(a, b, d, b, c, d)
  }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = half; i < nx - 1; i++) {
        const s0 = v[idx(i, j, k)] < 0
        // x-edge (i,j,k)-(i+1,j,k); x-edges in the central column never cross (symmetry)
        if (s0 !== v[idx(i + 1, j, k)] < 0)
          quad(
            cellVert[cellIdx(i, j - 1, k - 1)],
            cellVert[cellIdx(i, j, k - 1)],
            cellVert[cellIdx(i, j, k)],
            cellVert[cellIdx(i, j - 1, k)],
            !s0,
          )
        // y-edge
        if (s0 !== v[idx(i, j + 1, k)] < 0)
          quad(
            cellVert[cellIdx(i - 1, j, k - 1)],
            cellVert[cellIdx(i - 1, j, k)],
            cellVert[cellIdx(i, j, k)],
            cellVert[cellIdx(i, j, k - 1)],
            !s0,
          )
        // z-edge
        if (s0 !== v[idx(i, j, k + 1)] < 0)
          quad(
            cellVert[cellIdx(i - 1, j - 1, k)],
            cellVert[cellIdx(i, j - 1, k)],
            cellVert[cellIdx(i, j, k)],
            cellVert[cellIdx(i - 1, j, k)],
            !s0,
          )
      }
  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(tris),
    central: new Uint8Array(central),
  }
}

export function neighbours(indices: Uint32Array, nv: number): number[][] {
  const sets = Array.from({ length: nv }, () => new Set<number>())
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    sets[a].add(b).add(c)
    sets[b].add(a).add(c)
    sets[c].add(a).add(b)
  }
  return sets.map((s) => [...s])
}

/** Laplacian relaxation followed by re-projection onto the surface (keeps the exact shape). */
export function relax(m: HalfMesh, f: DistFn, iterations: number, amount = 0.5) {
  const nv = m.positions.length / 3
  const nb = neighbours(m.indices, nv)
  const p = m.positions
  for (let it = 0; it < iterations; it++) {
    const next = new Float32Array(p.length)
    for (let i = 0; i < nv; i++) {
      const n = nb[i]
      let ax = 0
      let ay = 0
      let az = 0
      for (const j of n) {
        ax += p[j * 3]
        ay += p[j * 3 + 1]
        az += p[j * 3 + 2]
      }
      const k = n.length || 1
      let q: V3 = [
        p[i * 3] + (ax / k - p[i * 3]) * amount,
        p[i * 3 + 1] + (ay / k - p[i * 3 + 1]) * amount,
        p[i * 3 + 2] + (az / k - p[i * 3 + 2]) * amount,
      ]
      if (m.central[i]) q[0] = 0
      q = project(f, q, 4, 0.02)
      if (m.central[i]) q[0] = 0
      next.set(q, i * 3)
    }
    p.set(next)
  }
}

/** Removes unreferenced vertices. */
export function compact<T extends Mesh & { central?: Uint8Array }>(m: T): T {
  const nv = m.positions.length / 3
  const remap = new Int32Array(nv).fill(-1)
  let n = 0
  for (const i of m.indices) if (remap[i] < 0) remap[i] = n++
  const pos = new Float32Array(n * 3)
  const cen = new Uint8Array(n)
  for (let i = 0; i < nv; i++)
    if (remap[i] >= 0) {
      pos.set(m.positions.subarray(i * 3, i * 3 + 3), remap[i] * 3)
      if (m.central) cen[remap[i]] = m.central[i]
    }
  return {
    ...m,
    positions: pos,
    indices: m.indices.map((i) => remap[i]),
    ...(m.central ? { central: cen } : {}),
  }
}

/** Simplifies the half mesh to `targetTris` triangles, keeping the symmetry-plane vertices. */
export async function simplifyHalf(m: HalfMesh, targetTris: number): Promise<HalfMesh> {
  await MeshoptSimplifier.ready
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(
    m.indices,
    m.positions,
    3,
    new Float32Array(m.positions.length / 3),
    1,
    [0],
    m.central,
    targetTris * 3,
    0.02,
    ['Regularize'],
  )
  return compact({ ...m, indices: idx })
}

/** Mirrors the x >= 0 half into a full, welded mesh. */
export function mirror(m: HalfMesh): Mesh {
  const nv = m.positions.length / 3
  const map = new Int32Array(nv)
  const pos: number[] = Array.from(m.positions)
  for (let i = 0; i < nv; i++) {
    if (m.central[i]) map[i] = i
    else {
      map[i] = pos.length / 3
      pos.push(-m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2])
    }
  }
  const idx = Array.from(m.indices)
  for (let t = 0; t < m.indices.length; t += 3)
    idx.push(map[m.indices[t]], map[m.indices[t + 2]], map[m.indices[t + 1]])
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

/** Angle-weighted vertex normals. */
export function vertexNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const n = new Float32Array(positions.length)
  const P = (i: number): V3 => [
    positions[i * 3],
    positions[i * 3 + 1],
    positions[i * 3 + 2],
  ]
  for (let t = 0; t < indices.length; t += 3) {
    const ids = [indices[t], indices[t + 1], indices[t + 2]]
    const [a, b, c] = ids.map(P)
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const fn: V3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ]
    const fl = Math.hypot(...fn) || 1
    const pts = [a, b, c]
    for (let k = 0; k < 3; k++) {
      const p0 = pts[k]
      const p1 = pts[(k + 1) % 3]
      const p2 = pts[(k + 2) % 3]
      const u: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
      const w: V3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
      const cos =
        (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) /
        (Math.hypot(...u) * Math.hypot(...w) || 1)
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)))
      for (let d = 0; d < 3; d++) n[ids[k] * 3 + d] += (fn[d] / fl) * ang
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l
    n[i + 1] /= l
    n[i + 2] /= l
  }
  return n
}

/** Full pipeline: half surface nets -> relax -> simplify -> mirror. */
export async function meshSdf(
  f: DistFn,
  grid: GridSpec,
  opts: { targetTris: number; relaxIterations?: number },
): Promise<Mesh> {
  let half = surfaceNetsHalf(f, grid)
  // initial snap onto the surface
  for (let i = 0; i < half.positions.length / 3; i++) {
    const q = project(
      f,
      [half.positions[i * 3], half.positions[i * 3 + 1], half.positions[i * 3 + 2]],
      4,
      grid.h,
    )
    if (half.central[i]) q[0] = 0
    half.positions.set(q, i * 3)
  }
  relax(half, f, opts.relaxIterations ?? 3)
  half = await simplifyHalf(half, Math.round(opts.targetTris / 2))
  return mirror(half)
}

/** Flips the winding if the mesh is inside-out (negative signed volume). */
export function ensureOutward<T extends Mesh>(m: T): T {
  let vol = 0
  const p = m.positions
  const ix = m.indices
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3
    const b = ix[t + 1] * 3
    const c = ix[t + 2] * 3
    vol +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  if (vol >= 0) return m
  const idx = new Uint32Array(ix.length)
  for (let t = 0; t < ix.length; t += 3) {
    idx[t] = ix[t]
    idx[t + 1] = ix[t + 2]
    idx[t + 2] = ix[t + 1]
  }
  return { ...m, indices: idx }
}
