import { BASE_MODELS, type Appearance, type EarType, type Marking } from './appearance'

/** What the `analyze-dog` edge function stores in `uploads.analysis`. */
export interface DogAnalysis {
  breed_guess: string
  fur_color: string
  second_color: string
  marking: Marking
  ear_type: EarType
  tail_length: 'short' | 'medium' | 'long'
  snout_length: 'short' | 'medium' | 'long'
  build: 'slim' | 'average' | 'sturdy'
  size_class: 'small' | 'medium' | 'large'
  leg_length: 'short' | 'normal' | 'long'
  confidence: number
}

const HEX = /^#[0-9a-f]{6}$/i
const ENUMS = {
  marking: ['none', 'blaze', 'socks', 'mask', 'spots', 'saddle'],
  ear_type: ['upright', 'floppy', 'half'],
  tail_length: ['short', 'medium', 'long'],
  snout_length: ['short', 'medium', 'long'],
  build: ['slim', 'average', 'sturdy'],
  size_class: ['small', 'medium', 'large'],
  leg_length: ['short', 'normal', 'long'],
} as const

/** Defensive check on data from the server; returns null if anything is off. */
export function parseAnalysis(v: unknown): DogAnalysis | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (!(allowed as readonly unknown[]).includes(o[k])) return null
  }
  if (typeof o.fur_color !== 'string' || !HEX.test(o.fur_color)) return null
  if (typeof o.second_color !== 'string' || !HEX.test(o.second_color)) return null
  return {
    ...(o as unknown as DogAnalysis),
    breed_guess: typeof o.breed_guess === 'string' ? o.breed_guess : '',
    confidence: typeof o.confidence === 'number' ? o.confidence : 0,
  }
}

const BUILD = { slim: 0.2, average: 0.5, sturdy: 0.8 } as const
const LEG = { short: 0.75, normal: 1, long: 1.1 } as const
const SNOUT = { short: 0.2, medium: 0.5, long: 0.85 } as const
const TAIL = { short: 0.6, medium: 1, long: 1.3 } as const

/** Translates the photo analysis into the parameters of the 3D dog. */
export function analysisToAppearance(a: DogAnalysis): Appearance {
  const base = BASE_MODELS[a.size_class] // size_class names match the base models
  return {
    baseModel: a.size_class,
    size: base.size,
    build: BUILD[a.build],
    bodyLength: a.leg_length === 'short' ? base.bodyLength * 1.1 : base.bodyLength,
    legLength: base.legLength * LEG[a.leg_length],
    snoutLength: SNOUT[a.snout_length],
    tailLength: TAIL[a.tail_length],
    earType: a.ear_type,
    furColor: a.fur_color.toLowerCase(),
    secondColor: a.second_color.toLowerCase(),
    marking: a.marking,
  }
}
