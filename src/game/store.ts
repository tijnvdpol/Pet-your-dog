import { create } from 'zustand'
import { DEFAULT_APPEARANCE, type Appearance } from '../dog/appearance'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_CHARACTER,
  decayRates,
  parseCharacter,
  type Character,
} from './character'
import {
  applyDelta,
  currentValue,
  freshMeter,
  METER_IDS,
  type Meter,
  type MeterId,
} from './meters'

export type PetZone = 'head' | 'back' | 'belly'
export type ActivityKind = 'idle' | 'pet' | 'eat' | 'sleep' | 'sulk' | 'joy'

/** Transient animation state. Not persisted; derived from `until` vs. the clock. */
export interface Activity {
  kind: ActivityKind
  until: number
  zone?: PetZone
  /** Plays right after this activity ends (e.g. offended, then overjoyed). */
  then?: Activity
}

const EAT_MS = 2800
const SLEEP_MS = 8000
const PET_MS = 900

interface DogState {
  /** Id of the matching row in Supabase `dogs` once signed in. */
  dogId: string | null
  name: string
  /** Last time the app was open; used for the welcome-back greeting. */
  lastSeen: number
  meters: Record<MeterId, Meter>
  appearance: Appearance
  character: Character
  activity: Activity
  setAppearance: (a: Partial<Appearance>) => void
  setCharacter: (c: Partial<Character>) => void
  setName: (name: string) => void
  /** Marks the dog as 'seen now'. */
  touch: () => void
  /** Replaces local state with data from the server. */
  applyRemote: (d: {
    dogId: string
    name: string
    lastSeen: number
    meters: Record<MeterId, Meter>
    appearance: Appearance
    character: Character
  }) => void
  /** Back to a fresh dog (used on sign-out so accounts never mix). */
  reset: () => void
  /** Greets the owner if they were away long enough. `awayMs` overrides the real time (testing). */
  welcome: (awayMs?: number) => void
  feed: () => void
  sleep: () => void
  pet: (zone: PetZone) => void
}

const initialMeters = (now: number): Record<MeterId, Meter> => ({
  hunger: freshMeter(80, now),
  energy: freshMeter(80, now),
  happiness: freshMeter(70, now),
})

const IDLE: Activity = { kind: 'idle', until: 0 }

/** The activity that is actually active at `now` (expired ones count as idle). */
export const activeActivity = (a: Activity, now: number): Activity => {
  if (now < a.until) return a
  return a.then ? activeActivity(a.then, now) : IDLE
}

/** Away at least this long and the dog greets you with the offended-then-happy routine. */
export const WELCOME_AWAY_MS = 3 * 3_600_000
const SULK_MS = 3500
const JOY_MS = 4500

export const useDog = create<DogState>()(
  persist(
    (set, get) => {
      const boost = (id: MeterId, delta: number, now: number) => ({
        ...get().meters,
        [id]: applyDelta(get().meters[id], decayRates(get().character)[id], now, delta),
      })
      return {
        dogId: null,
        name: 'Max',
        lastSeen: Date.now(),
        meters: initialMeters(Date.now()),
        appearance: DEFAULT_APPEARANCE,
        character: DEFAULT_CHARACTER,
        activity: IDLE,
        setAppearance: (a) => set({ appearance: { ...get().appearance, ...a } }),
        setCharacter: (c) => set({ character: { ...get().character, ...c } }),
        setName: (name) => set({ name: name.slice(0, 40) }),
        touch: () => set({ lastSeen: Date.now() }),
        applyRemote: (d) => set({ ...d, activity: IDLE }),
        reset: () => {
          const now = Date.now()
          set({
            dogId: null,
            name: 'Max',
            lastSeen: now,
            meters: initialMeters(now),
            appearance: DEFAULT_APPEARANCE,
            character: DEFAULT_CHARACTER,
            activity: IDLE,
          })
        },
        welcome: (awayMs) => {
          const now = Date.now()
          const away = awayMs ?? now - get().lastSeen
          set({ lastSeen: now })
          if (
            away < WELCOME_AWAY_MS ||
            activeActivity(get().activity, now).kind !== 'idle'
          )
            return
          set({
            meters: boost('happiness', 15, now),
            activity: {
              kind: 'sulk',
              until: now + SULK_MS,
              then: { kind: 'joy', until: now + SULK_MS + JOY_MS },
            },
          })
        },
        feed: () => {
          const now = Date.now()
          if (activeActivity(get().activity, now).kind === 'sleep') return
          set({
            meters: boost('hunger', 35, now),
            activity: { kind: 'eat', until: now + EAT_MS },
          })
        },
        sleep: () => {
          const now = Date.now()
          if (activeActivity(get().activity, now).kind === 'sleep') return
          set({
            meters: boost('energy', 40, now),
            activity: { kind: 'sleep', until: now + SLEEP_MS },
          })
        },
        pet: (zone) => {
          const now = Date.now()
          const current = activeActivity(get().activity, now)
          if (
            current.kind === 'sleep' ||
            current.kind === 'eat' ||
            current.kind === 'sulk'
          )
            return
          set({
            meters: boost(
              'happiness',
              (zone === 'belly' ? 3 : 2) +
                (zone === get().character.favoriteSpot ? 2 : 0),
              now,
            ),
            activity: { kind: 'pet', zone, until: now + PET_MS },
          })
        },
      }
    },
    {
      name: 'virtuele-hond-v1',
      partialize: (s) => ({
        dogId: s.dogId,
        name: s.name,
        lastSeen: s.lastSeen,
        meters: s.meters,
        appearance: s.appearance,
        character: s.character,
      }),
      // Older saves lack newer fields: fill the gaps from the defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DogState>
        return {
          ...current,
          ...p,
          appearance: { ...DEFAULT_APPEARANCE, ...(p.appearance ?? {}) },
          character: parseCharacter(p.character),
        }
      },
    },
  ),
)

/** Current (decayed) values for all meters. */
export function currentMeters(
  meters: Record<MeterId, Meter>,
  now: number,
  character: Character = DEFAULT_CHARACTER,
) {
  const rates = decayRates(character)
  return Object.fromEntries(
    METER_IDS.map((id) => [id, currentValue(meters[id], rates[id], now)]),
  ) as Record<MeterId, number>
}
