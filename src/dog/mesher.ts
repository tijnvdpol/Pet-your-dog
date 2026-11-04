import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import type { Sdf } from './sdf'

export interface Bounds {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
}

/**
 * Turns a signed-distance field into a smooth triangle mesh (naive surface nets) with
 * per-vertex colours. Runs once per appearance change, never per frame.
 */
export function meshFromSdf(
  sdf: Sdf,
  bounds: Bounds,
  cell: number,
  colorAt?: (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
  ) => Color,
): BufferGeometry {
  const nx = Math.ceil((bounds.max[0] - bounds.min[0]) / cell) + 1
  const ny = Math.ceil((bounds.max[1] - bounds.min[1]) / cell) + 1
  const nz = Math.ceil((bounds.max[2] - bounds.min[2]) / cell) + 1
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i

  // Sample the field on the grid.
  const field = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++) {
    const z = bounds.min[2] + k * cell
    for (let j = 0; j < ny; j++) {
      const y = bounds.min[1] + j * cell
      for (let i = 0; i < nx; i++) {
        field[at(i, j, k)] = sdf(bounds.min[0] + i * cell, y, z)
      }
    }
  }

  // One vertex per cell that the surface passes through.
  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cid = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i
  const positions: number[] = []
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ] as const
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
  ] as const
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = corners.map(([a, b, c]) => field[at(i + a, j + b, k + c)])
        let inside = 0
        for (const d of v) if (d < 0) inside++
        if (inside === 0 || inside === 8) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let n = 0
        for (const [e0, e1] of edges) {
          const d0 = v[e0]
          const d1 = v[e1]
          if (d0 < 0 === d1 < 0) continue
          const t = d0 / (d0 - d1)
          const c0 = corners[e0]
          const c1 = corners[e1]
          sx += c0[0] + (c1[0] - c0[0]) * t
          sy += c0[1] + (c1[1] - c0[1]) * t
          sz += c0[2] + (c1[2] - c0[2]) * t
          n++
        }
        cellVertex[cid(i, j, k)] = positions.length / 3
        positions.push(
          bounds.min[0] + (i + sx / n) * cell,
          bounds.min[1] + (j + sy / n) * cell,
          bounds.min[2] + (k + sz / n) * cell,
        )
      }
    }
  }

  // One quad for every grid edge where the sign flips.
  const indices: number[] = []
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) indices.push(a, c, b, a, d, c)
    else indices.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = field[at(i, j, k)] < 0
        const flipX = field[at(i + 1, j, k)] < 0 !== here
        const flipY = field[at(i, j + 1, k)] < 0 !== here
        const flipZ = field[at(i, j, k + 1)] < 0 !== here
        if (flipX)
          quad(
            cellVertex[cid(i, j - 1, k - 1)],
            cellVertex[cid(i, j, k - 1)],
            cellVertex[cid(i, j, k)],
            cellVertex[cid(i, j - 1, k)],
            here,
          )
        if (flipY)
          quad(
            cellVertex[cid(i - 1, j, k - 1)],
            cellVertex[cid(i - 1, j, k)],
            cellVertex[cid(i, j, k)],
            cellVertex[cid(i, j, k - 1)],
            here,
          )
        if (flipZ)
          quad(
            cellVertex[cid(i - 1, j - 1, k)],
            cellVertex[cid(i, j - 1, k)],
            cellVertex[cid(i, j, k)],
            cellVertex[cid(i - 1, j, k)],
            here,
          )
      }
    }
  }

  // Smooth normals from the field gradient; colours from the caller.
  const normals = new Float32Array(positions.length)
  const colors = new Float32Array(positions.length)
  const e = cell * 0.5
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]
    const y = positions[v + 1]
    const z = positions[v + 2]
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z)
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z)
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e)
    const l = Math.hypot(gx, gy, gz) || 1
    gx /= l
    gy /= l
    gz /= l
    normals[v] = gx
    normals[v + 1] = gy
    normals[v + 2] = gz
    if (colorAt) {
      const c = colorAt(x, y, z, gx, gy, gz)
      colors[v] = c.r
      colors[v + 1] = c.g
      colors[v + 2] = c.b
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  return geo
}
