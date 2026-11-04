/**
 * Glue between the game state / stored appearance and the 3D dog (src/components/Dog.tsx).
 * Pure functions, so they are easy to test.
 */
import type { DogAnimation, Face } from '../components/dogMotion'
import type { EarShape } from '../components/Dog'
import type { Mood } from '../game/meters'
import type { Activity, PetZone } from '../game/store'
import type { Appearance, Marking } from './appearance'

const CREAM = '#f6ead8'
/** Appearance.size of the default (large) dog: the model's natural size. */
const NATURAL_SIZE = 1.05

export interface DogLook {
  coatBase: string
  coatSecondary: string
  earShape: EarShape
  snoutLength: number
  bodyType: number
  tailLength: number
  marking: Marking
  markingColor: string
  /** Overall scale of the model. */
  scale: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Linear blend of two #rrggbb colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

/**
 * Stored appearance -> model parameters.
 *
 * The second colour is the marking colour when there is a marking (bles, sokjes, vlekken…);
 * without a marking it colours chest, muzzle and paws.
 */
export function lookFromAppearance(a: Appearance): DogLook {
  const hasMarking = a.marking !== 'none'
  // tail length is stored as a multiplier (0.5 … 1.4, 1 = normal)
  const t = a.tailLength
  const tail = t <= 1 ? (t - 0.5) / 1 : 0.5 + (t - 1) / 0.8
  return {
    coatBase: a.furColor,
    coatSecondary: hasMarking ? mixHex(a.furColor, CREAM, 0.15) : a.secondColor,
    markingColor: hasMarking ? a.secondColor : CREAM,
    marking: a.marking,
    earShape: a.earType,
    snoutLength: clamp01(a.snoutLength),
    bodyType: clamp01(a.build),
    tailLength: clamp01(tail),
    scale: a.size / NATURAL_SIZE,
  }
}

export interface Behaviour {
  animation: DogAnimation
  face?: Partial<Face>
  /** Turn the back towards the owner (offended). */
  turnAway: boolean
  /** Food bowl in front of the dog. */
  bowl: boolean
}

/** What the dog does for the current activity and mood. Neglect is funny, never sad-sad. */
export function behaviourFor(act: Activity, mood: Mood): Behaviour {
  const b = (animation: DogAnimation, extra: Partial<Behaviour> = {}): Behaviour => ({
    animation,
    turnAway: false,
    bowl: false,
    ...extra,
  })
  switch (act.kind) {
    case 'sleep':
      return b('Sleep')
    case 'eat':
      return b('Eat', { bowl: true })
    case 'pet':
      // scratching behind the ears makes the hind leg thump
      return act.zone === 'head' ? b('PetHappy') : b('Wag')
    case 'sulk':
      return b('Sulk', { turnAway: true })
    case 'joy':
      return b('Jump')
    case 'idle':
      if (mood === 'sulking') return b('Lie', { face: { sad_brows: 1 } })
      if (mood === 'happy') return b('Idle', { face: { mouth_open: 0.22 } })
      return b('Idle')
  }
}

/** Bones that count as "head" for petting (behind the ears, chin, neck). */
const HEAD_BONES = /^(head|jaw|neck|ear_)/

/**
 * Pet zone for a touch on the dog: the bone that owns the touched surface decides head vs body,
 * and a downward-facing surface on the body is the belly.
 */
export function petZoneFor(bone: string | null, normalY: number): PetZone {
  if (bone === null || HEAD_BONES.test(bone)) return 'head'
  return normalY < -0.35 ? 'belly' : 'back'
}
