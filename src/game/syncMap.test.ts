import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE } from '../dog/appearance'
import { fromRemote, toStatsRow, type LocalDog } from './syncMap'

const local: LocalDog = {
  name: 'Max',
  lastSeen: 1_700_000_300_000,
  meters: {
    hunger: { value: 42, updatedAt: 1_700_000_000_000 },
    energy: { value: 66, updatedAt: 1_700_000_100_000 },
    happiness: { value: 90, updatedAt: 1_700_000_200_000 },
  },
  appearance: { ...DEFAULT_APPEARANCE, furColor: '#112233' },
}

describe('sync mapping', () => {
  it('round-trips meters and timestamps', () => {
    const back = fromRemote(
      {
        id: 'x',
        name: 'Max',
        appearance: local.appearance,
        dog_stats: toStatsRow(local),
      },
      0,
    )
    expect(back).toEqual(local)
  })
  it('accepts stats as a one-element array', () => {
    const back = fromRemote(
      { id: 'x', name: 'Max', appearance: {}, dog_stats: [toStatsRow(local)] },
      0,
    )
    expect(back.meters.hunger.value).toBe(42)
  })
  it('falls back to defaults for an empty appearance and missing stats', () => {
    const back = fromRemote(
      { id: 'x', name: 'Rex', appearance: {}, dog_stats: null },
      5000,
    )
    expect(back.appearance).toEqual(DEFAULT_APPEARANCE)
    expect(back.meters.hunger).toEqual({ value: 80, updatedAt: 5000 })
    expect(back.lastSeen).toBe(5000)
  })
})
