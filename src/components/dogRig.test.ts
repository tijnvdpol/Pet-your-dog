import { describe, expect, it } from 'vitest'
import { CLIP_NAMES, POSES, type PoseOut } from './dogRig'

const sample = (name: (typeof CLIP_NAMES)[number], u: number): PoseOut => {
  const p: PoseOut = { rot: {}, pos: {} }
  POSES[name].fn(p, { u })
  return p
}

describe('procedural clips', () => {
  for (const name of CLIP_NAMES) {
    it(`${name} loops seamlessly`, () => {
      const a = sample(name, 0)
      const b = sample(name, 1 - 1e-6)
      for (const bone of new Set([...Object.keys(a.rot), ...Object.keys(b.rot)])) {
        const ra = a.rot[bone] ?? [0, 0, 0]
        const rb = b.rot[bone] ?? [0, 0, 0]
        // angles are equal modulo a full turn (Roll ends at 2π)
        ra.forEach((v, i) => {
          expect(Math.sin(v)).toBeCloseTo(Math.sin(rb[i]), 3)
          expect(Math.cos(v)).toBeCloseTo(Math.cos(rb[i]), 3)
        })
      }
      for (const bone of new Set([...Object.keys(a.pos), ...Object.keys(b.pos)])) {
        const pa = a.pos[bone] ?? [0, 0, 0]
        const pb = b.pos[bone] ?? [0, 0, 0]
        pa.forEach((v, i) => expect(v).toBeCloseTo(pb[i], 3))
      }
    })
  }
})
