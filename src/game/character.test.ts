import { describe, expect, it } from 'vitest'
import {
  BASE_DECAY_PER_HOUR,
  DEFAULT_CHARACTER,
  decayRates,
  parseCharacter,
} from './character'

describe('decayRates', () => {
  it('leaves an average dog at the base rates', () => {
    expect(decayRates(DEFAULT_CHARACTER)).toEqual(BASE_DECAY_PER_HOUR)
  })
  it('makes a busy dog tire faster than a lazy one', () => {
    const busy = decayRates({ ...DEFAULT_CHARACTER, energy: 5 }).energy
    const lazy = decayRates({ ...DEFAULT_CHARACTER, energy: 1 }).energy
    expect(busy).toBeGreaterThan(lazy)
    expect(busy / BASE_DECAY_PER_HOUR.energy).toBeCloseTo(1.4)
    expect(lazy / BASE_DECAY_PER_HOUR.energy).toBeCloseTo(0.6)
  })
  it('makes a cuddly dog miss attention sooner', () => {
    expect(decayRates({ ...DEFAULT_CHARACTER, cuddliness: 5 }).happiness).toBeGreaterThan(
      decayRates({ ...DEFAULT_CHARACTER, cuddliness: 1 }).happiness,
    )
  })
})

describe('parseCharacter', () => {
  it('falls back to defaults for junk', () => {
    expect(parseCharacter(null)).toEqual(DEFAULT_CHARACTER)
    expect(parseCharacter({ energy: 'high', favoriteSpot: 'tail' })).toEqual(
      DEFAULT_CHARACTER,
    )
  })
  it('clamps out-of-range numbers and keeps valid choices', () => {
    const c = parseCharacter({
      energy: 99,
      playfulness: -3,
      favoriteToy: 'rope',
      favoriteSpot: 'head',
    })
    expect(c).toMatchObject({
      energy: 5,
      playfulness: 1,
      favoriteToy: 'rope',
      favoriteSpot: 'head',
    })
  })
})
