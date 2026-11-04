import { describe, expect, it } from 'vitest'
import { meshSdf, vertexNormals } from './mesher'
import { compile, ellipsoid, roundCone, smin, union } from './sdf'

function edgeCounts(indices: Uint32Array) {
  const m = new Map<string, number>()
  for (let t = 0; t < indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k]
      const b = indices[t + ((k + 1) % 3)]
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      m.set(key, (m.get(key) ?? 0) + 1)
    }
  return m
}

describe('smin', () => {
  it('equals min far apart and is below min when close', () => {
    expect(smin(0, 1, 0.1)).toBe(0)
    expect(smin(0.5, 0.5, 0.2)).toBeLessThan(0.5)
  })
})

describe('meshSdf', () => {
  const shape = union(
    0.08,
    ellipsoid('body', 'b', [0, 0.5, 0], [0.3, 0.25, 0.4]),
    roundCone('leg', 'l', [0.15, 0.4, 0.2], [0.15, 0.05, 0.25], 0.07, 0.06),
    roundCone('leg2', 'l', [-0.15, 0.4, 0.2], [-0.15, 0.05, 0.25], 0.07, 0.06),
  )
  const f = compile(shape)
  const grid = {
    xMax: 0.45,
    y: [-0.05, 0.85] as [number, number],
    z: [-0.5, 0.5] as [number, number],
    h: 0.02,
  }

  it('is watertight, on the surface, symmetric and outward-facing', async () => {
    const m = await meshSdf(f, grid, { targetTris: 3000 })
    const tris = m.indices.length / 3
    expect(tris).toBeGreaterThan(2000)
    expect(tris).toBeLessThan(3600)
    for (const c of edgeCounts(m.indices).values()) expect(c).toBe(2)

    const nv = m.positions.length / 3
    let maxErr = 0
    for (let i = 0; i < nv; i++) {
      const d = f(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2])
      maxErr = Math.max(maxErr, Math.abs(d))
    }
    expect(maxErr).toBeLessThan(2e-3)

    // every vertex has a mirror twin
    const keys = new Set<string>()
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
    for (let i = 0; i < nv; i++)
      keys.add(key(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]))
    for (let i = 0; i < nv; i++)
      expect(
        keys.has(
          key(-m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]),
        ),
      ).toBe(true)

    // signed volume > 0 means CCW-outward winding
    let vol = 0
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [
        m.positions[i * 3],
        m.positions[i * 3 + 1],
        m.positions[i * 3 + 2],
      ])
      vol +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) -
          a[1] * (b[0] * c[2] - b[2] * c[0]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6
    }
    expect(vol).toBeGreaterThan(0.1)

    const n = vertexNormals(m.positions, m.indices)
    // top of the body points up
    let top = 0
    for (let i = 1; i < nv; i++)
      if (m.positions[i * 3 + 1] > m.positions[top * 3 + 1]) top = i
    expect(n[top * 3 + 1]).toBeGreaterThan(0.9)
  })
})
