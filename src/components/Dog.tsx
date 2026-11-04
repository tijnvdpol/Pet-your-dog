import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  LoopRepeat,
  MathUtils,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Mesh,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  createCoatMaterial,
  createEyeMaterial,
  createNoseMaterial,
  createToonMaterial,
  MARKINGS,
  type Marking,
} from './dogMaterials'
import {
  Blinker,
  FACE_BY_ANIMATION,
  FACE_MORPHS,
  LookAt,
  SecondaryMotion,
  type DogAnimation,
  type Face,
} from './dogMotion'

export const DOG_MODEL_URL = '/models/dog_large.glb'

export type EarShape = 'floppy' | 'half' | 'upright'

export interface DogProps extends Omit<ThreeElements['group'], 'ref'> {
  /** Main coat colour. */
  coatBase?: string
  /** Chest, muzzle and paws. */
  coatSecondary?: string
  earShape?: EarShape
  /** 0 = short snout, 0.5 = default, 1 = long. */
  snoutLength?: number
  /** 0 = slim, 0.5 = default, 1 = chunky. */
  bodyType?: number
  /** 0 = short tail, 0.5 = default, 1 = long. */
  tailLength?: number
  marking?: Marking
  markingColor?: string
  animation?: DogAnimation
  /** Crossfade duration between animations (s). */
  fade?: number
  /** Face morph overrides (0..1); unset = automatic per animation. */
  face?: Partial<Face>
  /** Raw morph overrides by name (dev tooling). */
  morphs?: Record<string, number>
  /** Ears/tail follow-through. */
  secondary?: boolean
  /** Deterministic preview: simulate the clip up to this time (s) and freeze. */
  frozenTime?: number
  /** Model file (dev tooling). */
  url?: string
  /** Turn the head towards the camera in calm animations. */
  lookAtCamera?: boolean
}

/** Maps a 0..1 slider with 0.5 = neutral onto a pair of opposite morph targets. */
const split = (v: number): [number, number] => [
  MathUtils.clamp((0.5 - v) * 2, 0, 1),
  MathUtils.clamp((v - 0.5) * 2, 0, 1),
]

function shapeMorphs(
  p: Required<Pick<DogProps, 'earShape' | 'snoutLength' | 'bodyType' | 'tailLength'>>,
) {
  const [snoutShort, snoutLong] = split(p.snoutLength)
  const [slim, chunky] = split(p.bodyType)
  const [tailShort, tailLong] = split(p.tailLength)
  return {
    ears_up: p.earShape === 'upright' ? 1 : 0,
    ears_half: p.earShape === 'half' ? 1 : 0,
    snout_short: snoutShort,
    snout_long: snoutLong,
    body_slim: slim,
    body_chunky: chunky,
    tail_short: tailShort,
    tail_long: tailLong,
  } as Record<string, number>
}

/** Stylized labrador built in code (tools/dog/build.ts), animated with baked clips. */
export function Dog({
  coatBase = '#6a4632',
  coatSecondary = '#7a5540',
  earShape = 'floppy',
  snoutLength = 0.5,
  bodyType = 0.5,
  tailLength = 0.5,
  marking = 'none',
  markingColor = '#f6ead8',
  animation = 'Idle',
  fade = 0.25,
  face,
  morphs,
  secondary = true,
  frozenTime,
  url = DOG_MODEL_URL,
  lookAtCamera = true,
  ...group
}: DogProps) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene])
  const { actions, mixer } = useAnimations(gltf.animations, scene)

  const mats = useMemo(() => {
    const m = {
      coat: createCoatMaterial(),
      eye: createEyeMaterial(),
      nose: createNoseMaterial('#3d2219'),
      tongue: createToonMaterial('#e8737d'),
    }
    // the tongue lies on the mouth floor: win near-coplanar depth ties against it
    m.tongue.polygonOffset = true
    m.tongue.polygonOffsetFactor = -1
    m.tongue.polygonOffsetUnits = -4
    // keep the glTF material names so re-running the assignment below is idempotent
    for (const [name, mat] of Object.entries(m)) mat.name = name
    return m
  }, [])
  const meshes = useMemo(() => {
    const list: Mesh[] = []
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const name = (Array.isArray(m.material) ? m.material[0] : m.material).name
      m.material =
        name === 'eye'
          ? mats.eye
          : name === 'nose'
            ? mats.nose
            : name === 'tongue'
              ? mats.tongue
              : mats.coat
      m.castShadow = false
      m.frustumCulled = false // skinned bounds do not follow the animation
      list.push(m)
    })
    return list
  }, [scene, mats])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  // colours
  useEffect(() => {
    const u = mats.coat.userData.uniforms
    u.uCoatBase.value.set(coatBase)
    u.uCoatSecondary.value.set(coatSecondary)
    u.uMarkColor.value.set(markingColor)
    u.uMarking.value = MARKINGS.indexOf(marking)
    // floppy ears barely show their inside; upright ones show a warm pink
    const pink = earShape === 'upright' ? 0.45 : earShape === 'half' ? 0.3 : 0
    u.uInnerEar.value.set(coatBase).lerp(new Color('#d79a8c'), pink)
  }, [mats, coatBase, coatSecondary, marking, markingColor, earShape])

  const motion = useMemo(() => new SecondaryMotion(scene), [scene])
  const look = useMemo(() => new LookAt(scene), [scene])
  const camera = useThree((s) => s.camera)
  const blinker = useMemo(() => new Blinker(), [])
  const faceNow = useRef<Face>({ blink: 0, mouth_open: 0, happy_eyes: 0, sad_brows: 0 })
  const shapeNow = useRef<Record<string, number> | null>(null)
  useEffect(() => {
    motion.enabled = secondary
    motion.earStiffness = earShape === 'upright' ? 1 : earShape === 'half' ? 0.5 : 0
  }, [motion, secondary, earShape])

  const shapeTarget = useMemo(
    () => ({
      ...shapeMorphs({ earShape, snoutLength, bodyType, tailLength }),
      ...morphs,
    }),
    [earShape, snoutLength, bodyType, tailLength, morphs],
  )

  const applyMorphsNow = (dt: number, instant: boolean) => {
    // shape morphs ease to their new values
    const target = shapeTarget
    if (!shapeNow.current || instant) shapeNow.current = { ...target }
    const now = shapeNow.current
    for (const k of Object.keys(target))
      now[k] = instant ? target[k] : MathUtils.damp(now[k] ?? 0, target[k], 8, dt)

    // face: animation preset + automatic blink + overrides
    const preset = FACE_BY_ANIMATION[animation]
    const f = faceNow.current
    const blink = instant ? 0 : blinker.value(dt)
    for (const k of FACE_MORPHS) {
      let t = face?.[k] ?? preset[k] ?? 0
      if (k === 'blink' && face?.blink === undefined) t = Math.max(t, blink)
      if (morphs?.[k] !== undefined) t = morphs[k]
      f[k] = instant || k === 'blink' ? t : MathUtils.damp(f[k], t, 10, dt)
    }
    const all: Record<string, number> = { ...now, ...f }
    for (const m of meshes) {
      const dict = m.morphTargetDictionary
      const inf = m.morphTargetInfluences
      if (!dict || !inf) continue
      for (const [name, i] of Object.entries(dict)) inf[i] = all[name] ?? 0
    }
    mats.eye.userData.uniforms.uClosed.value = Math.min(
      1,
      f.blink * 1.5 + f.happy_eyes * 1.5,
    )
  }
  // always call the latest closure from effects and the frame loop
  const applyMorphs = useRef(applyMorphsNow)
  useLayoutEffect(() => {
    applyMorphs.current = applyMorphsNow
  })

  // animation switching with crossfade
  const current = useRef<AnimationAction | null>(null)
  useEffect(() => {
    const next = actions[animation]
    if (!next) return
    next.setLoop(LoopRepeat, Infinity)
    if (frozenTime !== undefined) return // handled by the frozen-time effect
    const prev = current.current
    if (prev === next) return
    next
      .reset()
      .setEffectiveWeight(1)
      .fadeIn(prev ? fade : 0)
      .play()
    if (prev) prev.fadeOut(fade)
    current.current = next
  }, [actions, animation, fade, frozenTime])

  // deterministic preview: simulate from t = 0 at 60 Hz, then freeze
  const frozenPose = useRef<Array<[Object3D, Quaternion, Vector3]> | null>(null)
  useLayoutEffect(() => {
    if (frozenTime === undefined) {
      mixer.timeScale = 1
      return
    }
    const next = actions[animation]
    if (!next) return
    mixer.stopAllAction()
    mixer.timeScale = 1
    next.reset().setEffectiveWeight(1).play()
    current.current = next
    motion.reset()
    mixer.update(0)
    const steps = Math.round(frozenTime * 60)
    for (let i = 0; i < steps; i++) {
      mixer.update(1 / 60)
      scene.updateMatrixWorld(true)
      motion.update(1 / 60)
    }
    applyMorphs.current(0, true)
    mixer.timeScale = 0
    // the mixer re-applies the clip pose every frame; keep the simulated pose (with follow-through)
    const pose: Array<[Object3D, Quaternion, Vector3]> = []
    scene.traverse((o) => pose.push([o, o.quaternion.clone(), o.position.clone()]))
    frozenPose.current = pose
  }, [frozenTime, animation, actions, mixer, scene, motion, shapeTarget, face])

  useFrame((_, dt) => {
    if (frozenTime !== undefined) {
      for (const [o, q, p] of frozenPose.current ?? []) {
        o.quaternion.copy(q)
        o.position.copy(p)
      }
      if (lookAtCamera) look.update(camera.position, animation, 0, true)
      return
    }
    scene.updateMatrixWorld(true)
    motion.update(dt)
    if (lookAtCamera) look.update(camera.position, animation, dt)
    applyMorphs.current(dt, false)
  })

  return (
    <group {...group}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(DOG_MODEL_URL)
