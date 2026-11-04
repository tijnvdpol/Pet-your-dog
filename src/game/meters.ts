export type MeterId = 'hunger' | 'energy' | 'happiness'

/** A meter is stored as its last known value plus the time of that value. */
export interface Meter {
  value: number
  updatedAt: number
}

export const METER_IDS: MeterId[] = ['hunger', 'energy', 'happiness']

/** Points lost per hour. Hunger is empty after ~10 h. */
/** @deprecated use decayRates(character) */
export const DECAY_PER_HOUR: Record<MeterId, number> = {
  hunger: 10,
  energy: 4,
  happiness: 6,
}

const HOUR_MS = 3_600_000

export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v))

/** Current value, computed from the stored value and elapsed time. No timers needed. */
export function currentValue(meter: Meter, ratePerHour: number, now: number): number {
  // Guard against clock changes: never "gain" points from negative elapsed time.
  const hours = Math.max(0, now - meter.updatedAt) / HOUR_MS
  return clamp(meter.value - ratePerHour * hours)
}

/** Returns a new meter with `delta` applied on top of the current value. */
export function applyDelta(
  meter: Meter,
  ratePerHour: number,
  now: number,
  delta: number,
): Meter {
  return { value: clamp(currentValue(meter, ratePerHour, now) + delta), updatedAt: now }
}

export const freshMeter = (value: number, now: number): Meter => ({
  value,
  updatedAt: now,
})

export type Mood = 'happy' | 'neutral' | 'sulking'

/** Neglect is funny, never punishing: low meters only change behaviour. */
export function moodFrom(values: Record<MeterId, number>): Mood {
  const lowest = Math.min(values.hunger, values.energy, values.happiness)
  if (lowest < 20) return 'sulking'
  if (lowest > 60) return 'happy'
  return 'neutral'
}
