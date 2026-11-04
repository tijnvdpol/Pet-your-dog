import type { Sdf, V3 } from './sdf'

export interface RawMesh {
  positions: Float32Array
  indices: Uint32Array
}

/**
 * Naive surface nets: one vertex per cell that straddles the surface (placed at the
 * average of its edge crossings), one quad per straddling edge. Smoother than
 * marching cubes and gives well-shaped quads.
 */
export function surfaceNets(f: Sdf, min: V3, max: V3, h: number): RawMesh {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1
  const ny = Math.ceil((max[1] - min[1]) / h) + 1
  const nz = Math.ceil((max[2] - min[2]) / h) + 1
  const val = new Float32Array(nx * ny * nz)
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k)
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) val[idx(i, j, k)] = f(min[0] + i * h, min[1] + j * h, min[2] + k * h)

  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k)
  const pos: number[] = []
  const corner = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ]
  const edges = [
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
  const cv = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          cv[c] = val[idx(i + corner[c][0], j + corner[c][1], k + corner[c][2])]
          if (cv[c] < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue
          const t = cv[a] / (cv[a] - cv[b])
          sx += corner[a][0] + t * (corner[b][0] - corner[a][0])
          sy += corner[a][1] + t * (corner[b][1] - corner[a][1])
          sz += corner[a][2] + t * (corner[b][2] - corner[a][2])
          n++
        }
        cellVertex[cidx(i, j, k)] = pos.length / 3
        pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h)
      }

  const tris: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    // split along the shorter diagonal for better-shaped triangles
    const dist = (p: number, q: number) =>
      Math.hypot(pos[p * 3] - pos[q * 3], pos[p * 3 + 1] - pos[q * 3 + 1], pos[p * 3 + 2] - pos[q * 3 + 2])
    const q = flip ? [a, d, c, b] : [a, b, c, d]
    if (dist(q[0], q[2]) <= dist(q[1], q[3])) tris.push(q[0], q[1], q[2], q[0], q[2], q[3])
    else tris.push(q[0], q[1], q[3], q[1], q[2], q[3])
  }
  // for every grid edge with a sign change, connect the four cells around it
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = val[idx(i, j, k)] < 0
        // x edge (i,j,k)-(i+1,j,k)
        if (v0 !== val[idx(i + 1, j, k)] < 0)
          quad(cellVertex[cidx(i, j - 1, k - 1)], cellVertex[cidx(i, j, k - 1)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i, j - 1, k)], !v0)
        // y edge
        if (v0 !== val[idx(i, j + 1, k)] < 0)
          quad(cellVertex[cidx(i - 1, j, k - 1)], cellVertex[cidx(i - 1, j, k)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i, j, k - 1)], !v0)
        // z edge
        if (v0 !== val[idx(i, j, k + 1)] < 0)
          quad(cellVertex[cidx(i - 1, j - 1, k)], cellVertex[cidx(i, j - 1, k)], cellVertex[cidx(i, j, k)], cellVertex[cidx(i - 1, j, k)], !v0)
      }
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) }
}
