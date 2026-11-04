import { describe, expect, it } from 'vitest'
import { applyDelta, clamp, currentValue, DECAY_PER_HOUR, moodFrom } from './meters'

const H = 3_600_000

describe('currentValue', () => {
  it('decays linearly with elapsed hours', () => {
    expect(currentValue({ value: 100, updatedAt: 0 }, 10, 3 * H)).toBeCloseTo(70)
  })
  it('never drops below 0', () => {
    expect(currentValue({ value: 20, updatedAt: 0 }, 10, 100 * H)).toBe(0)
  })
  it('ignores a clock that moved backwards', () => {
    expect(currentValue({ value: 50, updatedAt: 10 * H }, 10, 0)).toBe(50)
  })
  it('hunger is empty after ~10 hours', () => {
    expect(
      currentValue({ value: 100, updatedAt: 0 }, DECAY_PER_HOUR.hunger, 10 * H),
    ).toBe(0)
  })
})

describe('applyDelta', () => {
  it('adds on top of the decayed value and resets the timestamp', () => {
    const m = applyDelta({ value: 100, updatedAt: 0 }, 10, 5 * H, 30)
    expect(m).toEqual({ value: 80, updatedAt: 5 * H })
  })
  it('clamps to 100', () => {
    expect(applyDelta({ value: 90, updatedAt: 0 }, 10, 0, 50).value).toBe(100)
  })
})

describe('moodFrom', () => {
  it('sulks when any meter is low', () => {
    expect(moodFrom({ hunger: 10, energy: 90, happiness: 90 })).toBe('sulking')
  })
  it('is happy when all meters are high', () => {
    expect(moodFrom({ hunger: 80, energy: 90, happiness: 70 })).toBe('happy')
  })
  it('is neutral in between', () => {
    expect(moodFrom({ hunger: 50, energy: 90, happiness: 70 })).toBe('neutral')
  })
})

describe('clamp', () => {
  it('limits values', () => {
    expect(clamp(-5)).toBe(0)
    expect(clamp(105)).toBe(100)
  })
})
