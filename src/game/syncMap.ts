import { DEFAULT_APPEARANCE, type Appearance } from '../dog/appearance'
import { DEFAULT_CHARACTER, parseCharacter, type Character } from './character'
import { freshMeter, type Meter, type MeterId } from './meters'

/** Shape of a `dogs` row joined with its `dog_stats` row. */
export interface RemoteDog {
  id: string
  name: string
  appearance: Partial<Appearance> | null
  character?: unknown
  dog_stats: RemoteStats | RemoteStats[] | null
}

export interface RemoteStats {
  hunger: number
  hunger_at: string
  energy: number
  energy_at: string
  happiness: number
  happiness_at: string
  last_seen_at: string
}

export interface LocalDog {
  name: string
  lastSeen: number
  meters: Record<MeterId, Meter>
  appearance: Appearance
  character: Character
}

const iso = (ms: number) => new Date(ms).toISOString()

export function toStatsRow(d: LocalDog): RemoteStats {
  return {
    hunger: d.meters.hunger.value,
    hunger_at: iso(d.meters.hunger.updatedAt),
    energy: d.meters.energy.value,
    energy_at: iso(d.meters.energy.updatedAt),
    happiness: d.meters.happiness.value,
    happiness_at: iso(d.meters.happiness.updatedAt),
    last_seen_at: iso(d.lastSeen),
  }
}

/** Remote → local. Missing appearance fields fall back to the defaults. */
export function fromRemote(r: RemoteDog, now: number): LocalDog {
  const s = Array.isArray(r.dog_stats) ? r.dog_stats[0] : r.dog_stats
  const m = (
    value: number | undefined,
    at: string | undefined,
    fallback: number,
  ): Meter =>
    value === undefined || !at
      ? freshMeter(fallback, now)
      : { value, updatedAt: Date.parse(at) }
  return {
    name: r.name,
    lastSeen: s ? Date.parse(s.last_seen_at) : now,
    meters: {
      hunger: m(s?.hunger, s?.hunger_at, 80),
      energy: m(s?.energy, s?.energy_at, 80),
      happiness: m(s?.happiness, s?.happiness_at, 70),
    },
    appearance: { ...DEFAULT_APPEARANCE, ...(r.appearance ?? {}) },
    character: r.character ? parseCharacter(r.character) : DEFAULT_CHARACTER,
  }
}
