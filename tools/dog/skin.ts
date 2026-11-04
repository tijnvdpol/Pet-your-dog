/**
 * Skin weights and morph targets, both derived from SDF "ownership".
 *
 * Each surface point is owned by one or more SDF leaves (soft-max over the CSG blend), and every
 * leaf belongs to a bone. That gives weights that follow the actual blend regions of the model:
 * soft where two parts melt together (knees, neck, tail base), hard where they do not
 * (left vs right leg, upper lip vs jaw).
 */
import { type V3, m4InvertAffine, m4Mul, m4Point } from './math'
import { type Mesh, neighbours, vertexNormals } from './mesher'
import { type Leaf, type SdfNode, compile, leafFrame, ownershipFn, project } from './sdf'

export type Ownership = Array<Array<[number, number]>>

export function computeOwnership(root: SdfNode, leaves: Leaf[], m: Mesh): Ownership {
  const own = ownershipFn(root, leaves)
  const out: Ownership = []
  for (let i = 0; i < m.positions.length / 3; i++)
    out.push(own([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]))
  return out
}

export interface Skin {
  joints: Uint8Array
  weights: Float32Array
}

export function skinWeights(
  m: Mesh,
  own: Ownership,
  leaves: Leaf[],
  boneIndex: Map<string, number>,
  smoothIterations = 2,
): Skin {
  const nv = m.positions.length / 3
  const nb = boneIndex.size
  let w = new Float32Array(nv * nb)
  for (let i = 0; i < nv; i++)
    for (const [id, wt] of own[i]) {
      const b = boneIndex.get(leaves[id].bone)
      if (b === undefined) throw new Error(`unknown bone ${leaves[id].bone}`)
      w[i * nb + b] += wt
    }
  // a little diffusion over the mesh for softer joints
  const nbr = neighbours(m.indices, nv)
  for (let it = 0; it < smoothIterations; it++) {
    const next = new Float32Array(w.length)
    for (let i = 0; i < nv; i++) {
      const n = nbr[i]
      for (let b = 0; b < nb; b++) {
        let s = 0
        for (const j of n) s += w[j * nb + b]
        next[i * nb + b] = w[i * nb + b] * 0.5 + (s / (n.length || 1)) * 0.5
      }
    }
    w = next
  }
  const joints = new Uint8Array(nv * 4)
  const weights = new Float32Array(nv * 4)
  for (let i = 0; i < nv; i++) {
    const row = Array.from(w.subarray(i * nb, i * nb + nb), (v, b) => [v, b] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 4)
    const tot = row.reduce((s, r) => s + r[0], 0) || 1
    row.forEach(([v, b], k) => {
      joints[i * 4 + k] = b
      weights[i * 4 + k] = v / tot
    })
  }
  return { joints, weights }
}

/**
 * Morph target with the base topology: every vertex is carried along with the leaves that own
 * it (affine frame base -> variant), then snapped onto the variant surface.
 */
export function morphTarget(
  base: Mesh,
  baseNormals: Float32Array,
  own: Ownership,
  baseLeaves: Leaf[],
  variant: { root: SdfNode; leaves: Leaf[] },
): { dp: Float32Array; dn: Float32Array; maxMove: number } {
  if (variant.leaves.length !== baseLeaves.length) throw new Error('variant tree differs')
  const maps = baseLeaves.map((l, i) => {
    const a = leafFrame(l.shape)
    const b = leafFrame(variant.leaves[i].shape)
    return m4Mul(b, m4InvertAffine(a))
  })
  const f = compile(variant.root)
  const nv = base.positions.length / 3
  const pos = new Float32Array(base.positions.length)
  let maxMove = 0
  for (let i = 0; i < nv; i++) {
    const v: V3 = [
      base.positions[i * 3],
      base.positions[i * 3 + 1],
      base.positions[i * 3 + 2],
    ]
    let moved = false
    const acc: V3 = [0, 0, 0]
    for (const [id, w] of own[i]) {
      const q = m4Point(maps[id], v)
      if (Math.abs(q[0] - v[0]) + Math.abs(q[1] - v[1]) + Math.abs(q[2] - v[2]) > 1e-7)
        moved = true
      acc[0] += q[0] * w
      acc[1] += q[1] * w
      acc[2] += q[2] * w
    }
    let p: V3 = moved ? acc : v
    // only re-project where the surface may have changed
    if (moved || Math.abs(f(v[0], v[1], v[2])) > 1e-4) p = project(f, p, 8, 0.03)
    if (Math.abs(v[0]) < 1e-6) p[0] = 0 // keep the centre line on the symmetry plane
    pos.set(p, i * 3)
    maxMove = Math.max(maxMove, Math.hypot(p[0] - v[0], p[1] - v[1], p[2] - v[2]))
  }
  const n = vertexNormals(pos, base.indices)
  const dp = new Float32Array(pos.length)
  const dn = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i++) {
    dp[i] = pos[i] - base.positions[i]
    dn[i] = n[i] - baseNormals[i]
  }
  return { dp, dn, maxMove }
}
