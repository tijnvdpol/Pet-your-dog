/** Prints a summary of public/models/dog_large.glb (sanity check after a build). */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2] ?? 'public/models/dog_large.glb')
const root = doc.getRoot()
console.log('skins', root.listSkins().length, 'joints', root.listSkins()[0]?.listJoints().length)
for (const n of root.listNodes()) if (n.getMesh()) console.log('node', n.getName(), 'mesh', n.getMesh()!.getName(), 'skin', !!n.getSkin())
for (const m of root.listMeshes()) {
  for (const p of m.listPrimitives()) {
    const attrs = p.listSemantics().join(',')
    console.log(m.getName(), 'verts', p.getAttribute('POSITION')!.getCount(), 'tris', (p.getIndices()?.getCount() ?? 0) / 3, 'targets', p.listTargets().map((t) => t.getName()).join('|'), attrs)
  }
}
