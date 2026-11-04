/** Everything that makes one dog look different from another. Drives the procedural model. */
export type EarType = 'upright' | 'floppy' | 'half'
/** `saddle` = dark back patch plus dark muzzle (shepherd-style). */
export type Marking = 'none' | 'blaze' | 'socks' | 'mask' | 'spots' | 'saddle'

export type BaseModel = 'large' | 'medium' | 'small'

export interface Appearance {
  /** Body template the other numbers started from. */
  baseModel: BaseModel
  /** Overall scale, ~0.7 (small) to 1.15 (large). */
  size: number
  /** 0 = slim, 1 = sturdy. */
  build: number
  /** Body length multiplier, ~0.85–1.2. */
  bodyLength: number
  /** Leg length in model units, ~0.4 (dachshund-ish) to 0.8. */
  legLength: number
  /** 0 = flat face, 1 = long snout. */
  snoutLength: number
  /** Tail length multiplier, ~0.5–1.4. */
  tailLength: number
  earType: EarType
  furColor: string
  /** Ears, tail, mask and spots. */
  secondColor: string
  marking: Marking
}

/** Proportions of the three body templates (the shape traits come from the photo or sliders). */
export const BASE_MODELS: Record<
  BaseModel,
  Pick<Appearance, 'size' | 'legLength' | 'bodyLength'>
> = {
  large: { size: 1.1, legLength: 0.75, bodyLength: 1.05 },
  medium: { size: 0.95, legLength: 0.65, bodyLength: 1 },
  small: { size: 0.8, legLength: 0.5, bodyLength: 1.05 },
}

export const BASE_MODEL_LABELS: Record<BaseModel, string> = {
  large: 'Groot',
  medium: 'Middel',
  small: 'Klein',
}

/** Switches to another body template, keeping colours, ears, markings and so on. */
export const withBaseModel = (look: Appearance, baseModel: BaseModel): Appearance => ({
  ...look,
  ...BASE_MODELS[baseModel],
  baseModel,
})

export const DEFAULT_APPEARANCE: Appearance = {
  baseModel: 'large',
  size: 1,
  build: 0.5,
  bodyLength: 1,
  legLength: 0.7,
  snoutLength: 0.5,
  tailLength: 1,
  earType: 'floppy',
  furColor: '#e0a458',
  secondColor: '#c98a3c',
  marking: 'blaze',
}

export const PRESETS: Record<string, { label: string; look: Appearance }> = {
  golden: { label: 'Golden', look: DEFAULT_APPEARANCE },
  shepherd: {
    label: 'Herder',
    look: {
      baseModel: 'large',
      size: 1.1,
      build: 0.35,
      bodyLength: 1.05,
      legLength: 0.78,
      snoutLength: 0.8,
      tailLength: 1.2,
      earType: 'upright',
      furColor: '#c98f55',
      secondColor: '#3a2a20',
      marking: 'saddle',
    },
  },
  dalmatian: {
    label: 'Dalmatiër',
    look: {
      baseModel: 'large',
      size: 1.05,
      build: 0.3,
      bodyLength: 1,
      legLength: 0.78,
      snoutLength: 0.65,
      tailLength: 1.1,
      earType: 'half',
      furColor: '#f4f1ea',
      secondColor: '#2b2622',
      marking: 'spots',
    },
  },
  beagle: {
    label: 'Beagle',
    look: {
      baseModel: 'medium',
      size: 0.85,
      build: 0.75,
      bodyLength: 0.95,
      legLength: 0.5,
      snoutLength: 0.45,
      tailLength: 0.8,
      earType: 'floppy',
      furColor: '#b8743a',
      secondColor: '#7a4a24',
      marking: 'socks',
    },
  },
}
