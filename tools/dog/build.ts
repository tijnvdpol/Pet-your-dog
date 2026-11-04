/**
 * Builds public/models/dog_large.glb from code: SDF -> mesh -> skin -> morphs -> clips -> GLB.
 *
 *   npx tsx tools/dog/build.ts
 */
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClips } from './anim'
import {
  BASE,
  FACE_MORPHS,
  GRID,
  SHAPE_MORPHS,
  VARIANTS,
  buildTree,
  skeleton,
  zoneFields,
} from './dogModel'
import { writeGlb } from './gltf'
import type { V3 } from './math'
import { meshSdf, vertexNormals } from './mesher'
import { buildParts } from './parts'
import { compile } from './sdf'
import { computeOwnership, morphTarget, skinWeights } from './skin'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../../public/models/dog_large.glb')
const H = Number(process.env.DOG_H ?? 0.008)
const TARGET_TRIS = Number(process.env.DOG_TRIS ?? 12500)

async function main() {
  const t0 = performance.now()
  const lap = (label: string) =>
    console.log(`${label.padEnd(16)} ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  const P = BASE
  const tree = buildTree(P)
  const f = compile(tree.root)
  const mesh = await meshSdf(
    f,
    { ...GRID, h: H },
    { targetTris: TARGET_TRIS, relaxIterations: 3 },
  )
  const normals = vertexNormals(mesh.positions, mesh.indices)
  const nv = mesh.positions.length / 3
  lap('mesh')

  const own = computeOwnership(tree.root, tree.leaves, mesh)
  const bones = skeleton(P)
  const boneIndex = new Map(bones.map((b, i) => [b.name, i]))
  const skin = skinWeights(mesh, own, tree.leaves, boneIndex)
  lap('skin')

  const zones = new Float32Array(nv * 4)
  const marks = new Float32Array(nv * 4)
  for (let i = 0; i < nv; i++) {
    const v: V3 = [
      mesh.positions[i * 3],
      mesh.positions[i * 3 + 1],
      mesh.positions[i * 3 + 2],
    ]
    const z = zoneFields(P, v, own[i], tree.leaves)
    zones.set(z.zones, i * 4)
    marks.set(z.marks, i * 4)
  }

  const morphs: Array<{ name: string; dp: Float32Array; dn: Float32Array }> = []
  for (const name of [...SHAPE_MORPHS, ...FACE_MORPHS]) {
    if (!VARIANTS[name]) continue // eye-only morphs (blink, happy_eyes) live on the eye meshes
    const m = morphTarget(mesh, normals, own, tree.leaves, buildTree(VARIANTS[name](P)))
    morphs.push({ name, dp: m.dp, dn: m.dn })
    console.log(`  morph ${name.padEnd(12)} max move ${m.maxMove.toFixed(3)}`)
  }
  lap('morphs')

  const bonePos = (n: string) => bones[boneIndex.get(n)!].head
  const parts = await buildParts(P, bonePos)
  const clips = buildClips(P, bones)
  lap('parts + clips')

  mkdirSync(dirname(OUT), { recursive: true })
  await writeGlb(
    OUT,
    {
      positions: mesh.positions,
      indices: mesh.indices,
      normals,
      zones,
      marks,
      ...skin,
      morphs,
    },
    bones,
    parts,
    clips,
  )
  lap('export')
  const partTris = parts.reduce((s, p) => s + p.mesh.indices.length / 3, 0)
  console.log(
    `body ${mesh.indices.length / 3} tris / ${nv} verts, parts ${partTris} tris, ` +
      `${bones.length} bones, ${morphs.length} body morphs, ${clips.length} clips, ` +
      `${(statSync(OUT).size / 1024).toFixed(0)} kB -> ${OUT}`,
  )
}

void main()
