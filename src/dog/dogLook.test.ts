import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, PRESETS } from './appearance'
import { behaviourFor, lookFromAppearance, mixHex, petZoneFor } from './dogLook'

describe('lookFromAppearance', () => {
  it('maps the stored tail multiplier onto the 0..1 morph slider', () => {
    const at = (tailLength: number) =>
      lookFromAppearance({ ...DEFAULT_APPEARANCE, tailLength }).tailLength
    expect(at(0.5)).toBeCloseTo(0)
    expect(at(1)).toBeCloseTo(0.5)
    expect(at(1.4)).toBeCloseTo(1)
  })

  it('uses the second colour for the marking when there is one', () => {
    const dal = lookFromAppearance(PRESETS.dalmatian.look)
    expect(dal.marking).toBe('spots')
    expect(dal.markingColor).toBe(PRESETS.dalmatian.look.secondColor)
    expect(dal.coatBase).toBe(PRESETS.dalmatian.look.furColor)
  })

  it('uses the second colour for chest, muzzle and paws without a marking', () => {
    const plain = lookFromAppearance({ ...DEFAULT_APPEARANCE, marking: 'none' })
    expect(plain.coatSecondary).toBe(DEFAULT_APPEARANCE.secondColor)
  })

  it('keeps the default dog at its natural size and ears as chosen', () => {
    const l = lookFromAppearance({
      ...DEFAULT_APPEARANCE,
      size: 1.05,
      earType: 'upright',
    })
    expect(l.scale).toBeCloseTo(1)
    expect(l.earShape).toBe('upright')
  })
})

describe('mixHex', () => {
  it('blends colours', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030')
  })
})

describe('behaviourFor', () => {
  const act = (
    kind: 'idle' | 'pet' | 'eat' | 'sleep' | 'sulk' | 'joy',
    zone?: 'head' | 'back' | 'belly',
  ) => ({
    kind,
    until: 0,
    zone,
  })
  it('thumps the hind leg when scratched behind the ears', () => {
    expect(behaviourFor(act('pet', 'head'), 'neutral').animation).toBe('PetHappy')
    expect(behaviourFor(act('pet', 'belly'), 'neutral').animation).toBe('Wag')
  })
  it('turns its back when offended and jumps for joy afterwards', () => {
    expect(behaviourFor(act('sulk'), 'neutral')).toMatchObject({
      animation: 'Sulk',
      turnAway: true,
    })
    expect(behaviourFor(act('joy'), 'happy').animation).toBe('Jump')
  })
  it('eats from a bowl and sleeps', () => {
    expect(behaviourFor(act('eat'), 'neutral')).toMatchObject({
      animation: 'Eat',
      bowl: true,
    })
    expect(behaviourFor(act('sleep'), 'neutral').animation).toBe('Sleep')
  })
  it('lies down looking sorry for itself when neglected', () => {
    expect(behaviourFor(act('idle'), 'sulking')).toMatchObject({
      animation: 'Lie',
      face: { sad_brows: 1 },
    })
  })
})

describe('petZoneFor', () => {
  it('treats head, ears, jaw and neck as the head', () => {
    for (const b of ['head', 'jaw', 'neck', 'ear_L_1'])
      expect(petZoneFor(b, 0)).toBe('head')
    expect(petZoneFor(null, -1)).toBe('head') // eyes / nose
  })
  it('splits the body into back and belly by surface direction', () => {
    expect(petZoneFor('spine_1', 0.8)).toBe('back')
    expect(petZoneFor('spine_1', -0.9)).toBe('belly')
  })
})
