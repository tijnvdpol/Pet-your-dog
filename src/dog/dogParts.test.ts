import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, PRESETS } from './appearance'
import { buildDogParts } from './dogParts'

describe('buildDogParts', () => {
  it('builds non-empty smooth meshes for every part', () => {
    const p = buildDogParts(DEFAULT_APPEARANCE)
    for (const g of [p.body, p.head, p.tail, p.front, p.hind]) {
      expect(g.attributes.position.count).toBeGreaterThan(200)
      expect(g.index!.count).toBeGreaterThan(300)
      expect(g.attributes.color.count).toBe(g.attributes.position.count)
    }
  })
  it('keeps the total triangle count phone-friendly', () => {
    const p = buildDogParts(DEFAULT_APPEARANCE)
    const tris = [p.body, p.head, p.tail, p.front, p.hind].reduce(
      (n, g) => n + g.index!.count / 3,
      0,
    )
    console.log('triangles (right legs once):', Math.round(tris))
    expect(tris).toBeLessThan(40_000)
  })
  it('builds quickly enough to redo on every look change', () => {
    const t0 = performance.now()
    for (const preset of Object.values(PRESETS)) buildDogParts(preset.look)
    const per = (performance.now() - t0) / Object.keys(PRESETS).length
    console.log('ms per full build (node):', Math.round(per))
    expect(per).toBeLessThan(1500)
  })
  it('puts part origins at their pivots (parts are centred around local 0)', () => {
    const p = buildDogParts(DEFAULT_APPEARANCE)
    p.head.computeBoundingBox()
    expect(p.head.boundingBox!.min.z).toBeLessThan(0.1)
    expect(p.head.boundingBox!.max.z).toBeGreaterThan(0.5)
  })
})
