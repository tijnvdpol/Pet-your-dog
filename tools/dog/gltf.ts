/** GLB export with @gltf-transform: skinned body + morph targets, bone-attached parts, clips. */
import { Document, NodeIO, type Node } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import type { BoneDef } from './dogModel'
import { sub } from './math'
import type { Part } from './parts'

export interface BodyData {
  positions: Float32Array
  indices: Uint32Array
  normals: Float32Array
  /** RGBA zone fields 0..1 */
  zones: Float32Array
  /** RGBA marking fields 0..1 */
  marks: Float32Array
  /** x = baked ambient occlusion (1 = open), yzw reserved */
  shade: Float32Array
  joints: Uint8Array
  weights: Float32Array
  morphs: Array<{ name: string; dp: Float32Array; dn: Float32Array }>
}

export interface Track {
  bone: string
  path: 'rotation' | 'translation'
  times: Float32Array
  values: Float32Array
}
export interface Clip {
  name: string
  tracks: Track[]
}

const toU8 = (a: Float32Array) =>
  Uint8Array.from(a, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255))

export async function writeGlb(
  path: string,
  body: BodyData,
  bones: BoneDef[],
  parts: Part[],
  clips: Clip[],
): Promise<Uint8Array> {
  const doc = new Document()
  doc.createExtension(KHRMeshQuantization).setRequired(true)
  const buffer = doc.createBuffer()
  const acc = (
    type: 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4',
    array: ArrayLike<number> & { BYTES_PER_ELEMENT: number },
  ) =>
    doc
      .createAccessor()
      .setType(type)
      .setArray(array as unknown as Float32Array<ArrayBuffer>)
      .setBuffer(buffer)

  const mat = (name: string, color: [number, number, number, number], rough: number) =>
    doc
      .createMaterial(name)
      .setBaseColorFactor(color)
      .setRoughnessFactor(rough)
      .setMetallicFactor(0)
  const materials = {
    coat: mat('coat', [0.32, 0.19, 0.12, 1], 0.9),
    eye: mat('eye', [0.08, 0.05, 0.03, 1], 0.2),
    nose: mat('nose', [0.18, 0.1, 0.08, 1], 0.4),
    tongue: mat('tongue', [0.9, 0.42, 0.48, 1], 0.5),
  }

  // ---- skeleton ----
  const scene = doc.createScene('Dog')
  const rootNode = doc.createNode('Dog')
  scene.addChild(rootNode)
  const boneNodes = new Map<string, Node>()
  const byName = new Map(bones.map((b) => [b.name, b]))
  for (const b of bones) {
    const parent = b.parent ? byName.get(b.parent)! : null
    const node = doc
      .createNode(b.name)
      .setTranslation(parent ? sub(b.head, parent.head) : b.head)
    boneNodes.set(b.name, node)
    if (parent) boneNodes.get(parent.name)!.addChild(node)
    else rootNode.addChild(node)
  }
  const ibm = new Float32Array(bones.length * 16)
  bones.forEach((b, i) => {
    ibm.set(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1],
      i * 16,
    )
  })
  const skin = doc
    .createSkin('dog_skin')
    .setSkeleton(boneNodes.get('root')!)
    .setInverseBindMatrices(acc('MAT4', ibm))
  for (const b of bones) skin.addJoint(boneNodes.get(b.name)!)

  // ---- body ----
  const prim = doc
    .createPrimitive()
    .setMaterial(materials.coat)
    .setIndices(acc('SCALAR', body.indices))
    .setAttribute('POSITION', acc('VEC3', body.positions))
    .setAttribute('NORMAL', acc('VEC3', body.normals))
    .setAttribute('COLOR_0', acc('VEC4', toU8(body.zones)).setNormalized(true))
    .setAttribute('_MARKINGS', acc('VEC4', toU8(body.marks)).setNormalized(true))
    .setAttribute('_SHADE', acc('VEC4', toU8(body.shade)).setNormalized(true))
    .setAttribute('JOINTS_0', acc('VEC4', body.joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', body.weights))
  for (const m of body.morphs)
    prim.addTarget(
      doc
        .createPrimitiveTarget(m.name)
        .setAttribute('POSITION', acc('VEC3', m.dp))
        .setAttribute('NORMAL', acc('VEC3', m.dn)),
    )
  const bodyMesh = doc
    .createMesh('dog_body')
    .addPrimitive(prim)
    .setWeights(body.morphs.map(() => 0))
    .setExtras({ targetNames: body.morphs.map((m) => m.name) })
  rootNode.addChild(doc.createNode('dog_body').setMesh(bodyMesh).setSkin(skin))

  // ---- parts ----
  for (const p of parts) {
    const pr = doc
      .createPrimitive()
      .setMaterial(materials[p.material])
      .setIndices(acc('SCALAR', p.mesh.indices))
      .setAttribute('POSITION', acc('VEC3', p.mesh.positions))
      .setAttribute('NORMAL', acc('VEC3', p.mesh.normals))
    if (p.mesh.colors)
      pr.setAttribute('COLOR_0', acc('VEC4', toU8(p.mesh.colors)).setNormalized(true))
    const names = Object.keys(p.mesh.morphs)
    for (const n of names) {
      const t = doc
        .createPrimitiveTarget(n)
        .setAttribute('POSITION', acc('VEC3', p.mesh.morphs[n].dp))
      const dn = p.mesh.morphs[n].dn
      if (dn) t.setAttribute('NORMAL', acc('VEC3', dn))
      pr.addTarget(t)
    }
    const mesh = doc.createMesh(p.name).addPrimitive(pr)
    if (names.length)
      mesh.setWeights(names.map(() => 0)).setExtras({ targetNames: names })
    boneNodes
      .get(p.parentBone)!
      .addChild(doc.createNode(p.name).setMesh(mesh).setTranslation(p.t).setRotation(p.q))
  }

  // ---- animations ----
  for (const c of clips) {
    const anim = doc.createAnimation(c.name)
    for (const t of c.tracks) {
      const sampler = doc
        .createAnimationSampler()
        .setInput(acc('SCALAR', t.times))
        .setOutput(acc(t.path === 'rotation' ? 'VEC4' : 'VEC3', t.values))
        .setInterpolation('LINEAR')
      anim
        .addSampler(sampler)
        .addChannel(
          doc
            .createAnimationChannel()
            .setTargetNode(boneNodes.get(t.bone)!)
            .setTargetPath(t.path)
            .setSampler(sampler),
        )
    }
  }

  await MeshoptEncoder.ready
  await doc.transform(
    resample({ tolerance: 2e-4 }),
    prune({ keepLeaves: true, keepAttributes: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    })
  const glb = await io.writeBinary(doc)
  await io.write(path, doc)
  return glb
}
