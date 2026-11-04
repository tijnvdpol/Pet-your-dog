import { create } from 'zustand'
import { DEFAULT_APPEARANCE, type Appearance } from '../dog/appearance'
import { persist } from 'zustand/middleware'
import {
  applyDelta,
  currentValue,
  DECAY_PER_HOUR,
  freshMeter,
  METER_IDS,
  type Meter,
  type MeterId,
} from './meters'

export type PetZone = 'head' | 'back' | 'belly'
export type ActivityKind = 'idle' | 'pet' | 'eat' | 'sleep'

/** Transient animation state. Not persisted; derived from `until` vs. the clock. */
export interface Activity {
  kind: ActivityKind
  until: number
  zone?: PetZone
}

const EAT_MS = 2800
const SLEEP_MS = 8000
const PET_MS = 900

interface DogState {
  name: string
  meters: Record<MeterId, Meter>
  appearance: Appearance
  activity: Activity
  setAppearance: (a: Partial<Appearance>) => void
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
export const activeActivity = (a: Activity, now: number): Activity =>
  now < a.until ? a : IDLE

export const useDog = create<DogState>()(
  persist(
    (set, get) => {
      const boost = (id: MeterId, delta: number, now: number) => ({
        ...get().meters,
        [id]: applyDelta(get().meters[id], DECAY_PER_HOUR[id], now, delta),
      })
      return {
        name: 'Max',
        meters: initialMeters(Date.now()),
        appearance: DEFAULT_APPEARANCE,
        activity: IDLE,
        setAppearance: (a) => set({ appearance: { ...get().appearance, ...a } }),
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
          if (current.kind === 'sleep' || current.kind === 'eat') return
          set({
            meters: boost('happiness', zone === 'belly' ? 3 : 2, now),
            activity: { kind: 'pet', zone, until: now + PET_MS },
          })
        },
      }
    },
    {
      name: 'virtuele-hond-v1',
      partialize: (s) => ({ name: s.name, meters: s.meters, appearance: s.appearance }),
    },
  ),
)

/** Current (decayed) values for all meters. */
export function currentMeters(meters: Record<MeterId, Meter>, now: number) {
  return Object.fromEntries(
    METER_IDS.map((id) => [id, currentValue(meters[id], DECAY_PER_HOUR[id], now)]),
  ) as Record<MeterId, number>
}
