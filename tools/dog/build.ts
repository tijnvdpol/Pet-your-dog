/**
 * Builds public/models/dog_large.glb entirely in code:
 *   SDF  ->  surface nets  ->  decimate  ->  project/relax  ->  skin + zones + morphs  ->  GLB
 * Run: npx tsx tools/dog/build.ts
 */
import { Document, NodeIO, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { MeshoptSimplifier } from 'meshoptimizer'
import { mkdirSync, statSync } from 'node:fs'
import { adjacency, compact, faceNormals, largestComponent, uvSphere } from './geometry.ts'
import {
  BOUNDS_MAX,
  BOUNDS_MIN,
  dogSdf,
  ears,
  skeleton,
  skinWeights,
  zonesAt,
  type BoneDef,
} from './model.ts'
import { smoothstep, type Sdf, type V3 } from './sdf.ts'
import { surfaceNets } from './surfaceNets.ts'

const OUT = 'public/models/dog_large.glb'
const CELL = Number(process.env.DOG_CELL ?? 0.008)
const TARGET_TRIS = Number(process.env.DOG_TRIS ?? 3200)
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

const sdf: Sdf = dogSdf()
const grad = (x: number, y: number, z: number): V3 => {
  const e = 0.002
  const g: V3 = [
    sdf(x + e, y, z) - sdf(x - e, y, z),
    sdf(x, y + e, z) - sdf(x, y - e, z),
    sdf(x, y, z + e) - sdf(x, y, z - e),
  ]
  const l = Math.hypot(...g) || 1
  return [g[0] / l, g[1] / l, g[2] / l]
}
/** Newton steps onto the isosurface. */
function project(p: V3, steps = 3): V3 {
  let [x, y, z] = p
  for (let i = 0; i < steps; i++) {
    const d = sdf(x, y, z)
    const g = grad(x, y, z)
    x -= g[0] * d
    y -= g[1] * d
    z -= g[2] * d
  }
  return [x, y, z]
}

async function main() {
  await MeshoptSimplifier.ready
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready

  /* ---- 1. mesh the SDF ---- */
  const raw = surfaceNets(sdf, BOUNDS_MIN, BOUNDS_MAX, CELL)
  log(`surface nets: ${raw.positions.length / 3} verts, ${raw.indices.length / 3} tris`)
  let indices = largestComponent(raw.positions, raw.indices)

  // orientation check: face normal should agree with the SDF gradient
  {
    let agree = 0
    for (let i = 0; i < Math.min(indices.length, 3000); i += 3) {
      const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
      const P = raw.positions
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
      const n: V3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
      const g = grad((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)
      agree += Math.sign(n[0] * g[0] + n[1] * g[1] + n[2] * g[2])
    }
    if (agree < 0) {
      log('flipping winding')
      for (let i = 0; i < indices.length; i += 3) {
        const t = indices[i + 1]
        indices[i + 1] = indices[i + 2]
        indices[i + 2] = t
      }
    }
  }

  /* ---- 2. decimate ---- */
  const [simp] = MeshoptSimplifier.simplify(indices, raw.positions, 3, TARGET_TRIS * 3, 1, ['ErrorAbsolute', 'Regularize'])
  let { positions, indices: idx } = compact(raw.positions, simp)
  log(`decimated: ${positions.length / 3} verts, ${idx.length / 3} tris`)

  /* ---- 3. relax tangentially + project back to the exact surface ---- */
  const adj = adjacency(positions.length / 3, idx)
  for (let it = 0; it < 3; it++) {
    const next = new Float32Array(positions)
    for (let v = 0; v < adj.length; v++) {
      const nb = adj[v]
      if (!nb.length) continue
      let cx = 0, cy = 0, cz = 0
      for (const u of nb) {
        cx += positions[u * 3]
        cy += positions[u * 3 + 1]
        cz += positions[u * 3 + 2]
      }
      const k = 0.35
      const px = positions[v * 3] + (cx / nb.length - positions[v * 3]) * k
      const py = positions[v * 3 + 1] + (cy / nb.length - positions[v * 3 + 1]) * k
      const pz = positions[v * 3 + 2] + (cz / nb.length - positions[v * 3 + 2]) * k
      const q = project([px, py, pz], 2)
      next[v * 3] = q[0]
      next[v * 3 + 1] = q[1]
      next[v * 3 + 2] = q[2]
    }
    positions = next
  }
  const nVerts = positions.length / 3
  log('relaxed + projected')

  /* ---- 4. normals from the SDF gradient ---- */
  const normals = new Float32Array(nVerts * 3)
  for (let v = 0; v < nVerts; v++) {
    const g = grad(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
    normals.set(g, v * 3)
  }

  /* ---- 5. skeleton, skin weights, colour zones ---- */
  const bones = skeleton()
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]))
  const skin = skinWeights(positions, bones)
  const sumWeight = (v: number, pred: (b: BoneDef) => boolean) => {
    let s = 0
    for (let k = 0; k < 4; k++) if (pred(bones[skin.joints[v * 4 + k]])) s += skin.weights[v * 4 + k]
    return s
  }
  const earW = new Float32Array(nVerts)
  const tailW = new Float32Array(nVerts)
  const bodyW = new Float32Array(nVerts)
  for (let v = 0; v < nVerts; v++) {
    earW[v] = sumWeight(v, (b) => b.name.startsWith('ear_'))
    tailW[v] = sumWeight(v, (b) => b.name.startsWith('tail_'))
    bodyW[v] = sumWeight(v, (b) => ['pelvis', 'spine1', 'spine2'].includes(b.name))
  }
  log('skin + zones done')

  /* ---- 6. shape morph targets (same topology, geometric warps weighted by region) ---- */
  const baseFn = faceNormals(positions, idx)
  type Warp = (p: V3, v: number) => V3
  const warps: Record<string, Warp> = {
    ears_up: ([x, y, z], v) => {
      const m = earW[v]
      if (m <= 0.001) return [x, y, z]
      const ry = 0.84 // root height: mirror the ear about this plane so the tip points up
      return [x + Math.sign(x) * 0.015 * m, y + (2 * ry - 2 * y) * m * 0.9, z]
    },
    ears_half: ([x, y, z], v) => {
      const m = earW[v]
      if (m <= 0.001) return [x, y, z]
      const fold = 0.76 // fold the lower half up/outward
      const below = smoothstep(fold + 0.02, fold - 0.06, y)
      return [x + Math.sign(x) * 0.04 * below * m, y + (2 * (fold + 0.03) - 2 * y) * below * m * 0.55, z]
    },
    snout_long: ([x, y, z]) => {
      const m = smoothstep(0.46, 0.56, z) * smoothstep(0.79, 0.74, y)
      return [x, y, z + 0.06 * m]
    },
    snout_short: ([x, y, z]) => {
      const m = smoothstep(0.46, 0.56, z) * smoothstep(0.79, 0.74, y)
      return [x, y, z - 0.045 * m]
    },
    body_slim: ([x, y, z], v) => [x * (1 - 0.14 * bodyW[v]), 0.46 + (y - 0.46) * (1 - 0.08 * bodyW[v]), z],
    body_chunky: ([x, y, z], v) => [x * (1 + 0.15 * bodyW[v]), 0.46 + (y - 0.46) * (1 + 0.1 * bodyW[v]), z],
    tail_long: ([x, y, z], v) => [x, 0.5 + (y - 0.5) * (1 + 0.3 * tailW[v]), -0.3 + (z + 0.3) * (1 + 0.35 * tailW[v])],
    tail_short: ([x, y, z], v) => [x, 0.5 + (y - 0.5) * (1 - 0.25 * tailW[v]), -0.3 + (z + 0.3) * (1 - 0.3 * tailW[v])],
  }
  const morphs = Object.entries(warps).map(([name, fn]) => {
    const pos = new Float32Array(nVerts * 3)
    for (let v = 0; v < nVerts; v++) {
      const q = fn([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], v)
      pos.set(q, v * 3)
    }
    const fn2 = faceNormals(pos, idx)
    const dp = new Float32Array(nVerts * 3)
    const dn = new Float32Array(nVerts * 3)
    for (let i = 0; i < dp.length; i++) {
      dp[i] = pos[i] - positions[i]
      dn[i] = fn2[i] - baseFn[i]
    }
    return { name, dp, dn }
  })
  log(`morphs: ${morphs.map((m) => m.name).join(', ')}`)

  /* ---- 6b. unweld: every triangle gets its own vertices, so colour zones are hard-edged blocks ---- */
  const nTri = idx.length / 3
  const seq = new Uint32Array(nTri * 3).map((_, i) => i)
  const expand = <T extends Float32Array | Uint16Array>(src: T, size: number): T => {
    const out = new (src.constructor as new (n: number) => T)(nTri * 3 * size)
    for (let t = 0; t < nTri; t++)
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k]
        for (let c = 0; c < size; c++) out[(t * 3 + k) * size + c] = src[v * size + c]
      }
    return out
  }
  const positionsU = expand(positions, 3)
  const normalsU = faceNormals(positionsU, seq)
  const jointsU = expand(skin.joints, 4)
  const weightsU = expand(skin.weights, 4)
  const colors = new Float32Array(nTri * 3 * 4)
  const uv = new Float32Array(nTri * 3 * 2)
  const ZN = 5
  const zoneT = new Float32Array(nTri * ZN)
  for (let t = 0; t < nTri; t++) {
    const [a, b, c] = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]
    const cen: V3 = [0, 0, 0]
    const nrm: V3 = [normalsU[t * 9], normalsU[t * 9 + 1], normalsU[t * 9 + 2]]
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) cen[k] += positions[v * 3 + k] / 3
    const z = zonesAt(cen, nrm, (earW[a] + earW[b] + earW[c]) / 3)
    zoneT.set([z.secondary, z.nose, z.innerEar, z.tongue, z.mouth], t * ZN)
  }
  // majority filter over edge neighbours: straightens ragged colour borders (the thin mouth line is kept)
  {
    const edgeTris = new Map<string, number[]>()
    for (let t = 0; t < nTri; t++)
      for (let k = 0; k < 3; k++) {
        const a = idx[t * 3 + k]
        const b = idx[t * 3 + ((k + 1) % 3)]
        const key = a < b ? `${a}_${b}` : `${b}_${a}`
        ;(edgeTris.get(key) ?? edgeTris.set(key, []).get(key)!).push(t)
      }
    const nbrs: number[][] = Array.from({ length: nTri }, () => [])
    for (const ts of edgeTris.values()) if (ts.length === 2) (nbrs[ts[0]].push(ts[1]), nbrs[ts[1]].push(ts[0]))
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(zoneT)
      for (let t = 0; t < nTri; t++)
        for (const ch of [0, 2]) {
          // only the big blocks: cream and inner ear
          let sum = zoneT[t * ZN + ch]
          for (const u of nbrs[t]) sum += zoneT[u * ZN + ch]
          next[t * ZN + ch] = sum / (nbrs[t].length + 1) > 0.5 ? 1 : 0
        }
      zoneT.set(next)
    }
  }
  for (let t = 0; t < nTri; t++)
    for (let k = 0; k < 3; k++) {
      colors.set([zoneT[t * ZN], zoneT[t * ZN + 1], zoneT[t * ZN + 2], zoneT[t * ZN + 3]], (t * 3 + k) * 4)
      uv[(t * 3 + k) * 2] = zoneT[t * ZN + 4]
    }
  const morphsU = morphs.map((m) => {
    const pos = new Float32Array(positionsU.length)
    const dpU = expand(m.dp, 3)
    for (let i = 0; i < pos.length; i++) pos[i] = positionsU[i] + dpU[i]
    const fnU = faceNormals(pos, seq)
    const dnU = new Float32Array(fnU.length)
    for (let i = 0; i < dnU.length; i++) dnU[i] = fnU[i] - normalsU[i]
    return { name: m.name, dp: dpU, dn: dnU }
  })

  /* ---- 7. face parts: eyes (+ highlights), lids, brows ---- */
  const head = bones.find((b) => b.name === 'head')!
  const face = buildFace(head.at)
  log('face parts built')

  /* ---- 8. glTF document ---- */
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Dog')
  const byName = new Map<string, Node>()
  for (const b of bones) {
    const parent = bones.find((p) => p.name === b.parent)
    const local: V3 = parent ? [b.at[0] - parent.at[0], b.at[1] - parent.at[1], b.at[2] - parent.at[2]] : b.at
    byName.set(b.name, doc.createNode(b.name).setTranslation(local))
  }
  for (const b of bones) {
    if (b.parent) byName.get(b.parent)!.addChild(byName.get(b.name)!)
    else scene.addChild(byName.get(b.name)!)
  }
  const ibm = new Float32Array(bones.length * 16)
  bones.forEach((b, i) => {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.at[0], -b.at[1], -b.at[2], 1], i * 16)
  })
  const skinDef = doc
    .createSkin('DogSkin')
    .setSkeleton(byName.get('root')!)
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer))
  for (const b of bones) skinDef.addJoint(byName.get(b.name)!)

  const acc = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', arr: Float32Array | Uint32Array | Uint16Array) =>
    doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer)

  const coat = doc.createMaterial('coat').setBaseColorFactor([0.35, 0.22, 0.15, 1]).setRoughnessFactor(0.9).setMetallicFactor(0)
  const eyeMat = doc.createMaterial('eye').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.12).setMetallicFactor(0)
  const hiMat = doc.createMaterial('highlight').setBaseColorFactor([1, 1, 1, 1]).setEmissiveFactor([1, 1, 1]).setRoughnessFactor(1)

  // body
  const bodyPrim = doc
    .createPrimitive()
    .setMaterial(coat)
    .setIndices(acc('SCALAR', seq))
    .setAttribute('POSITION', acc('VEC3', positionsU))
    .setAttribute('NORMAL', acc('VEC3', normalsU))
    .setAttribute('COLOR_0', acc('VEC4', colors))
    .setAttribute('TEXCOORD_0', acc('VEC2', uv))
    .setAttribute('JOINTS_0', acc('VEC4', jointsU))
    .setAttribute('WEIGHTS_0', acc('VEC4', weightsU))
  for (const m of morphsU) {
    bodyPrim.addTarget(
      doc.createPrimitiveTarget(m.name).setAttribute('POSITION', acc('VEC3', m.dp)).setAttribute('NORMAL', acc('VEC3', m.dn)),
    )
  }
  const bodyMesh = doc.createMesh('Body').addPrimitive(bodyPrim).setExtras({ targetNames: morphsU.map((m) => m.name) })
  scene.addChild(doc.createNode('Body').setMesh(bodyMesh).setSkin(skinDef))

  // face parts hang off the head bone
  const headNode = byName.get('head')!
  const addPart = (name: string, g: FacePart, material: typeof coat, extra: Record<string, Float32Array> = {}) => {
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setIndices(acc('SCALAR', new Uint32Array(g.indices)))
      .setAttribute('POSITION', acc('VEC3', new Float32Array(g.positions)))
      .setAttribute('NORMAL', acc('VEC3', faceNormals(g.positions, g.indices)))
      .setAttribute('COLOR_0', acc('VEC4', new Float32Array(g.colors)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array((g.positions.length / 3) * 2)))
    const names: string[] = []
    for (const [mn, pos] of Object.entries(g.morphs ?? {})) {
      const dp = new Float32Array(pos.length)
      for (let i = 0; i < dp.length; i++) dp[i] = pos[i] - g.positions[i]
      prim.addTarget(doc.createPrimitiveTarget(mn).setAttribute('POSITION', acc('VEC3', dp)))
      names.push(mn)
    }
    void extra
    const mesh = doc.createMesh(name).addPrimitive(prim)
    if (names.length) mesh.setExtras({ targetNames: names })
    headNode.addChild(doc.createNode(name).setMesh(mesh))
  }
  addPart('Eyes', face.eyes, eyeMat)
  addPart('Highlights', face.highlights, hiMat)
  addPart('Lids', face.lids, coat)
  addPart('Brows', face.brows, coat)

  /* ---- 9. write (meshopt-compressed) ---- */
  mkdirSync('public/models', { recursive: true })
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  await io.write(OUT, doc)
  const kb = statSync(OUT).size / 1024
  log(`wrote ${OUT}: ${kb.toFixed(0)} KB, ${nTri} body tris, ${bones.length} bones, ${morphs.length} shape morphs`)
  if (kb > 3072) throw new Error('GLB larger than 3 MB')
  void ears
  void boneIndex
}

/* ------------------------------------------------------------------ *
 * Face parts (rest pose, in head-bone local space)
 * ------------------------------------------------------------------ */
interface FacePart {
  positions: number[]
  indices: number[]
  colors: number[]
  morphs?: Record<string, number[]>
}

const EYE_R = 0.027
const rotX = (p: V3, a: number): V3 => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)]
const rotZ = (p: V3, a: number): V3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]]

function orient(part: FacePart, center: V3) {
  // make triangles wind outward from `center`
  let s = 0
  const P = part.positions
  for (let i = 0; i < part.indices.length; i += 3) {
    const [a, b, c] = [part.indices[i] * 3, part.indices[i + 1] * 3, part.indices[i + 2] * 3]
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]]
    const w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    s += n[0] * (P[a] - center[0]) + n[1] * (P[a + 1] - center[1]) + n[2] * (P[a + 2] - center[2])
  }
  if (s < 0) for (let i = 0; i < part.indices.length; i += 3) [part.indices[i + 1], part.indices[i + 2]] = [part.indices[i + 2], part.indices[i + 1]]
}

function merge(parts: FacePart[]): FacePart {
  const out: FacePart = { positions: [], indices: [], colors: [], morphs: {} }
  const names = new Set(parts.flatMap((p) => Object.keys(p.morphs ?? {})))
  for (const n of names) out.morphs![n] = []
  for (const p of parts) {
    const base = out.positions.length / 3
    out.positions.push(...p.positions)
    out.colors.push(...p.colors)
    out.indices.push(...p.indices.map((i) => i + base))
    for (const n of names) out.morphs![n].push(...(p.morphs?.[n] ?? p.positions))
  }
  return out
}

function buildFace(headAt: V3): FacePart & {
  eyes: FacePart
  highlights: FacePart
  lids: FacePart
  brows: FacePart
} {
  const toLocal = (p: V3): V3 => [p[0] - headAt[0], p[1] - headAt[1], p[2] - headAt[2]]
  const eyes: FacePart[] = []
  const highs: FacePart[] = []
  const lids: FacePart[] = []
  const brows: FacePart[] = []
  const sph = uvSphere(12, 20)
  const lidSph = uvSphere(6, 20) // rings x segments, used as polar cap grid

  for (const sx of [1, -1]) {
    // sit the eye on the head surface, pushed slightly in
    const surf = project([0.075 * sx, 0.8, 0.52])
    const n = grad(surf[0], surf[1], surf[2])
    const c: V3 = [surf[0] - n[0] * 0.012, surf[1] - n[1] * 0.012, surf[2] - n[2] * 0.012]
    const gaze: V3 = [0.12 * sx, 0.02, 1]
    const gl = Math.hypot(...gaze)
    const gdir: V3 = [gaze[0] / gl, gaze[1] / gl, gaze[2] / gl]

    // eyeball with a dark-brown iris disc on a near-black base
    const eye: FacePart = { positions: [], indices: [...sph.indices], colors: [] }
    for (const d of sph.dirs) {
      eye.positions.push(c[0] + d[0] * EYE_R, c[1] + d[1] * EYE_R, c[2] + d[2] * EYE_R)
      const cosg = d[0] * gdir[0] + d[1] * gdir[1] + d[2] * gdir[2]
      const iris = smoothstep(0.9, 0.97, cosg)
      // dark base (#1a0f0b) -> warm brown iris (#4b2a17), slightly lighter on the lower half
      const lift = 0.35 * Math.max(0, -d[1]) * iris
      eye.colors.push(0.026 + (0.075 - 0.026) * iris + lift * 0.05, 0.015 + (0.023 - 0.015) * iris + lift * 0.02, 0.011 + (0.009 - 0.011) * iris, 1)
    }
    orient(eye, c)
    eyes.push({ ...eye, positions: eye.positions.flatMap((_, i, a) => (i % 3 ? [] : toLocal([a[i], a[i + 1], a[i + 2]]))) })

    // highlights: a bigger one top-outer, a small one bottom-inner
    for (const [off, rad] of [
      [[-0.45 * sx, 0.5, 0.74], 0.0085],
      [[0.35 * sx, -0.4, 0.84], 0.004],
    ] as const) {
      const l = Math.hypot(...off)
      const hc: V3 = [c[0] + (off[0] / l) * EYE_R * 0.97, c[1] + (off[1] / l) * EYE_R * 0.97, c[2] + (off[2] / l) * EYE_R * 0.97]
      const hs = uvSphere(6, 8)
      const part: FacePart = { positions: [], indices: [...hs.indices], colors: [] }
      for (const d of hs.dirs) {
        part.positions.push(...toLocal([hc[0] + d[0] * rad, hc[1] + d[1] * rad, hc[2] + d[2] * rad]))
        part.colors.push(1, 1, 1, 1)
      }
      orient(part, toLocal(hc))
      highs.push(part)
    }

    // lids: two spherical caps around axes tilted forward; angles via polar scaling
    const R = EYE_R * 1.07
    const tilt = 0.7
    const cap = (up: 1 | -1, theta: number): number[] => {
      const out: number[] = []
      for (const d of lidSph.dirs) {
        // d.y from 1 (pole) to -1; map the upper half rings to polar u in [0,1]
        const u = Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI // 0 at pole .. 1 opposite
        const polar = Math.min(1, u * 2) * theta // squeeze all rings into [0, theta]
        const dir: V3 = [Math.sin(polar) * (d[0] / (Math.hypot(d[0], d[2]) || 1)), up * Math.cos(polar), Math.sin(polar) * (d[2] / (Math.hypot(d[0], d[2]) || 1))]
        const t = rotX(dir, up * tilt)
        out.push(...toLocal([c[0] + t[0] * R, c[1] + t[1] * R, c[2] + t[2] * R]))
      }
      return out
    }
    const topOpen = 0.04
    const botOpen = 0.02
    const topPart: FacePart = { positions: cap(1, topOpen), indices: [...lidSph.indices], colors: [] }
    const botPart: FacePart = { positions: cap(-1, botOpen), indices: [...lidSph.indices], colors: [] }
    // only the first half of the rings is a cap; drop the rest by collapsing (they map to polar = theta, duplicated ring)
    for (const part of [topPart, botPart]) {
      const nv = part.positions.length / 3
      for (let v = 0; v < nv; v++) part.colors.push(0, 0, 0, 0)
    }
    orient(topPart, toLocal(c))
    orient(botPart, toLocal(c))
    topPart.morphs = {
      blink: cap(1, 2.2),
      happy_eyes: cap(1, 1.0),
    }
    botPart.morphs = {
      blink: cap(-1, botOpen),
      happy_eyes: cap(-1, 1.18),
    }
    lids.push(topPart, botPart)

    // brow: a small soft bump above the eye; sad_brows tilts it (inner end up)
    const bsurf = project([0.07 * sx, 0.86, 0.5])
    const bn = grad(bsurf[0], bsurf[1], bsurf[2])
    const bc: V3 = [bsurf[0] - bn[0] * 0.002, bsurf[1] - bn[1] * 0.002, bsurf[2] - bn[2] * 0.002]
    const bs = uvSphere(6, 10)
    const brow: FacePart = { positions: [], indices: [...bs.indices], colors: [] }
    const sad: number[] = []
    for (const d of bs.dirs) {
      const p0: V3 = [d[0] * 0.024, d[1] * 0.007, d[2] * 0.01]
      const tiltBase = rotZ(p0, -0.18 * sx)
      const tiltSad = rotZ(p0, 0.42 * sx)
      // neutral: collapsed to a point (invisible); the sad_brows morph grows them into place
      brow.positions.push(...toLocal([bc[0] + tiltBase[0] * 0.02, bc[1] + tiltBase[1] * 0.02, bc[2] + tiltBase[2] * 0.02]))
      sad.push(...toLocal([bc[0] + tiltSad[0], bc[1] + tiltSad[1] + 0.003, bc[2] + tiltSad[2]]))
      brow.colors.push(0, 0, 0, 0)
    }
    orient(brow, toLocal(bc))
    brow.morphs = { sad_brows: sad }
    brows.push(brow)
  }
  const mEyes = merge(eyes)
  return { ...mEyes, eyes: mEyes, highlights: merge(highs), lids: merge(lids), brows: merge(brows) }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
