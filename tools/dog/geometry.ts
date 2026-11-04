import type { V3 } from './sdf.ts'

export interface Mesh {
  positions: number[]
  indices: number[]
  /** Per-vertex scalar tags/colours, filled by the generators. */
  colors: number[]
}

/** Vertex normals from faces (area weighted). */
export function faceNormals(positions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const n = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3
    const b = indices[i + 1] * 3
    const c = indices[i + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const o of [a, b, c]) {
      n[o] += nx
      n[o + 1] += ny
      n[o + 2] += nz
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

export function adjacency(vertexCount: number, indices: ArrayLike<number>): number[][] {
  const adj: Set<number>[] = Array.from({ length: vertexCount }, () => new Set())
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]
      const b = indices[i + ((k + 1) % 3)]
      adj[a].add(b)
      adj[b].add(a)
    }
  }
  return adj.map((s) => [...s])
}

/** Keeps only vertices referenced by `indices`, renumbering them. */
export function compact(positions: Float32Array, indices: Uint32Array): { positions: Float32Array; indices: Uint32Array } {
  const map = new Int32Array(positions.length / 3).fill(-1)
  const out: number[] = []
  const idx = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]
    if (map[v] < 0) {
      map[v] = out.length / 3
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
    }
    idx[i] = map[v]
  }
  return { positions: new Float32Array(out), indices: idx }
}

/** Largest connected component only (drops floating specks). */
export function largestComponent(positions: Float32Array, indices: Uint32Array): Uint32Array {
  const n = positions.length / 3
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]]
    return a
  }
  for (let i = 0; i < indices.length; i += 3) {
    parent[find(indices[i])] = find(indices[i + 1])
    parent[find(indices[i + 1])] = find(indices[i + 2])
  }
  const count = new Map<number, number>()
  for (let i = 0; i < indices.length; i += 3) {
    const r = find(indices[i])
    count.set(r, (count.get(r) ?? 0) + 1)
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const out: number[] = []
  for (let i = 0; i < indices.length; i += 3) if (find(indices[i]) === best) out.push(indices[i], indices[i + 1], indices[i + 2])
  return new Uint32Array(out)
}

/** UV sphere around +Y with `rings` x `segs`; returns unit-sphere directions. */
export function uvSphere(rings: number, segs: number): { dirs: V3[]; indices: number[] } {
  const dirs: V3[] = []
  const indices: number[] = []
  for (let r = 0; r <= rings; r++) {
    const th = (r / rings) * Math.PI
    for (let s = 0; s < segs; s++) {
      const ph = (s / segs) * Math.PI * 2
      dirs.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)])
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = r * segs + s
      const b = r * segs + ((s + 1) % segs)
      const c = (r + 1) * segs + s
      const d = (r + 1) * segs + ((s + 1) % segs)
      indices.push(a, c, b, b, c, d)
    }
  return { dirs, indices }
}
