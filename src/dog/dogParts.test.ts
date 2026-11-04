import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, PRESETS } from './appearance'
import { buildDogParts } from './dogParts'

describe('buildDogParts (low-poly)', () => {
  it('builds non-empty, painted, flat parts', async () => {
    const p = await buildDogParts(DEFAULT_APPEARANCE)
    for (const g of [p.body, p.head, p.tail, p.front, p.hind]) {
      expect(g.attributes.position.count).toBeGreaterThan(30)
      expect(g.attributes.position.count % 3).toBe(0) // independent triangles
      expect(g.attributes.color.count).toBe(g.attributes.position.count)
      expect(g.attributes.normal).toBeUndefined() // flat shading derives its own
    }
  })
  it('stays very light for phones (a real low-poly dog)', async () => {
    const p = await buildDogParts(DEFAULT_APPEARANCE)
    const tris = [p.body, p.head, p.tail, p.front, p.hind].reduce(
      (n, g) => n + g.attributes.position.count / 3,
      0,
    )
    console.log('triangles (right legs once):', Math.round(tris))
    expect(tris).toBeLessThan(4000)
  })
  it('builds quickly enough to redo on every look change', async () => {
    const t0 = performance.now()
    for (const preset of Object.values(PRESETS)) await buildDogParts(preset.look)
    const per = (performance.now() - t0) / Object.keys(PRESETS).length
    console.log('ms per full build (node):', Math.round(per))
    expect(per).toBeLessThan(1500)
  })
  it('puts part origins at their pivots', async () => {
    const p = await buildDogParts(DEFAULT_APPEARANCE)
    p.head.computeBoundingBox()
    expect(p.head.boundingBox!.min.z).toBeLessThan(0.1)
    expect(p.head.boundingBox!.max.z).toBeGreaterThan(0.5)
  })
})
