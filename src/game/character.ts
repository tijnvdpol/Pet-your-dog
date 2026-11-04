import type { MeterId } from './meters'
import type { PetZone } from './store'

/** Personality of the dog, from the owner's questionnaire. Scales are 1 (low) to 5 (high). */
export interface Character {
  energy: number
  playfulness: number
  cuddliness: number
  stubbornness: number
  favoriteToy: 'ball' | 'rope' | 'squeaky' | 'stick'
  favoriteSpot: PetZone
}

export const DEFAULT_CHARACTER: Character = {
  energy: 3,
  playfulness: 3,
  cuddliness: 3,
  stubbornness: 3,
  favoriteToy: 'ball',
  favoriteSpot: 'belly',
}

const TOYS = ['ball', 'rope', 'squeaky', 'stick'] as const
const SPOTS = ['head', 'back', 'belly'] as const
const clampScale = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(5, Math.max(1, Math.round(v)))
    : fallback

/** Defensive parse of data from the server (any gaps fall back to the defaults). */
export function parseCharacter(v: unknown): Character {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const d = DEFAULT_CHARACTER
  return {
    energy: clampScale(o.energy, d.energy),
    playfulness: clampScale(o.playfulness, d.playfulness),
    cuddliness: clampScale(o.cuddliness, d.cuddliness),
    stubbornness: clampScale(o.stubbornness, d.stubbornness),
    favoriteToy: (TOYS as readonly unknown[]).includes(o.favoriteToy)
      ? (o.favoriteToy as Character['favoriteToy'])
      : d.favoriteToy,
    favoriteSpot: (SPOTS as readonly unknown[]).includes(o.favoriteSpot)
      ? (o.favoriteSpot as PetZone)
      : d.favoriteSpot,
  }
}

/** Points lost per hour with an average personality. Hunger is empty after ~10 h. */
export const BASE_DECAY_PER_HOUR: Record<MeterId, number> = {
  hunger: 10,
  energy: 4,
  happiness: 6,
}

/**
 * A busy dog loses energy faster and a lazy one slowly; a cuddly dog misses attention sooner.
 * Multipliers stay within 0.6x–1.4x so nobody gets a dog that is hopeless to look after.
 */
export function decayRates(c: Character): Record<MeterId, number> {
  const lerp = (level: number, lo: number, hi: number) =>
    lo + ((level - 1) / 4) * (hi - lo)
  return {
    hunger: BASE_DECAY_PER_HOUR.hunger,
    energy: BASE_DECAY_PER_HOUR.energy * lerp(c.energy, 0.6, 1.4),
    happiness: BASE_DECAY_PER_HOUR.happiness * lerp(c.cuddliness, 0.8, 1.2),
  }
}
