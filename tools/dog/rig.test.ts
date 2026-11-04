import { describe, expect, it } from 'vitest'
import { CLIP_DURATIONS, CLIP_NAMES, poseAt } from './anim'
import { BASE, skeleton, toeTip } from './dogModel'
import { dist } from './math'
import { LEGS, Rig } from './rig'

const bones = skeleton(BASE)
const toes = {
  front_L: toeTip(BASE, true, 1),
  front_R: toeTip(BASE, true, -1),
  hind_L: toeTip(BASE, false, 1),
  hind_R: toeTip(BASE, false, -1),
}
const angle = (q: number[]) => 2 * Math.acos(Math.min(1, Math.abs(q[3])))

describe('leg IK', () => {
  it('reproduces the rest pose for rest targets', () => {
    const rig = new Rig(bones, toes)
    for (const leg of LEGS) {
      const r = rig.legRest(leg)
      rig.solveLeg(leg, { foot: r.foot, pastern: r.pastern, toe: r.toe })
    }
    for (const leg of LEGS)
      for (let k = 0; k < 4; k++)
        expect(angle(rig.q[rig.i(`${leg}_${k}`)])).toBeLessThan(0.08)
  })

  it('puts the foot on a reachable target', () => {
    const rig = new Rig(bones, toes)
    rig.hips = [0, -0.1, 0]
    rig.rot('spine_0', 0.1)
    const target: [number, number, number] = [0.16, 0.065, -0.2]
    rig.solveLeg('hind_L', { foot: target })
    expect(dist(rig.worldPos('hind_L_3'), target)).toBeLessThan(1e-3)
  })
})

describe('clips', () => {
  it.each(CLIP_NAMES)('%s loops seamlessly', (name) => {
    const a = poseAt(BASE, bones, name, 0)
    const T = CLIP_DURATIONS[name]
    const b = poseAt(BASE, bones, name, T)
    for (let i = 0; i < bones.length; i++) {
      const d = Math.abs(
        a.q[i][0] * b.q[i][0] +
          a.q[i][1] * b.q[i][1] +
          a.q[i][2] * b.q[i][2] +
          a.q[i][3] * b.q[i][3],
      )
      expect(d).toBeGreaterThan(0.9999)
    }
    expect(dist(a.hips, b.hips)).toBeLessThan(1e-6)
  })

  it.each(['Idle', 'Sit', 'Lie', 'Eat'])('%s keeps the paws on the ground', (name) => {
    for (const t of [0, 0.37, 0.8]) {
      const rig = poseAt(BASE, bones, name, t)
      for (const leg of LEGS) {
        const y = rig.worldPos(`${leg}_3`)[1]
        expect(y).toBeGreaterThan(0.03)
        expect(y).toBeLessThan(0.1)
      }
    }
  })
})
