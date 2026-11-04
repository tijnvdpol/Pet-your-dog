import { OrbitControls, Stats, useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Leva, useControls } from 'leva'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { DOG_MODEL_URL, Dog, type EarShape } from '../components/Dog'
import { MARKINGS, type Marking } from '../components/dogMaterials'
import { DOG_ANIMATIONS, FACE_MORPHS, type DogAnimation } from '../components/dogMotion'

/**
 * /dev/dog: preview and tuning page for the dog model.
 * `?ui=0` hides the panel; `window.__dogLab.set({...})` drives it from screenshot scripts.
 */
const VIEWS = {
  '34': { pos: [2.1, 1.3, 2.8], target: [0, 0.6, 0.05] },
  front: { pos: [0, 0.85, 3.5], target: [0, 0.62, 0] },
  side: { pos: [3.7, 0.8, 0.0], target: [0, 0.6, 0.0] },
  sideWide: { pos: [4.6, 1.0, 0.0], target: [0, 0.78, 0.0] },
  back: { pos: [-1.3, 1.2, -3.5], target: [0, 0.64, -0.1] },
  top: { pos: [0.001, 4.6, 0.12], target: [0, 0.45, 0.0] },
  face: { pos: [0.55, 1.05, 1.75], target: [0, 0.91, 0.45] },
} as const satisfies Record<string, { pos: number[]; target: number[] }>
type View = keyof typeof VIEWS

const SHAPE_MORPHS = [
  'ears_up',
  'ears_half',
  'snout_long',
  'snout_short',
  'body_slim',
  'body_chunky',
  'tail_long',
  'tail_short',
]

function CameraRig({
  view,
  controls,
}: {
  view: View
  controls: React.RefObject<OrbitControlsImpl | null>
}) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  useEffect(() => {
    const v = VIEWS[view]
    // narrow portrait screens need the camera further back to keep the dog in frame
    const k = Math.max(1, 0.78 / aspect)
    camera.position.set(
      v.target[0] + (v.pos[0] - v.target[0]) * k,
      v.target[1] + (v.pos[1] - v.target[1]) * k,
      v.target[2] + (v.pos[2] - v.target[2]) * k,
    )
    camera.lookAt(v.target[0], v.target[1], v.target[2])
    if (controls.current) {
      controls.current.target.set(v.target[0], v.target[1], v.target[2])
      controls.current.update()
    }
  }, [view, camera, controls, aspect])
  return null
}

function useBlobTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    grad.addColorStop(0, 'rgba(40,52,30,0.55)')
    grad.addColorStop(0.6, 'rgba(40,52,30,0.25)')
    grad.addColorStop(1, 'rgba(40,52,30,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return new CanvasTexture(c)
  }, [])
}

declare global {
  interface Window {
    __dogLab?: { set: (values: Record<string, unknown>) => Promise<void>; ready: boolean }
    __dogClips?: Record<string, number>
  }
}

/** Publishes clip durations for the screenshot script once the model has loaded. */
function ClipInfo() {
  const { animations } = useGLTF(
    new URLSearchParams(location.search).get('model') ?? DOG_MODEL_URL,
  )
  useEffect(() => {
    window.__dogClips = Object.fromEntries(animations.map((a) => [a.name, a.duration]))
  }, [animations])
  return null
}

export default function DogLab() {
  const params = new URLSearchParams(location.search)
  const showUi = params.get('ui') !== '0'

  const [v, set] = useControls(() => ({
    animation: {
      value: (params.get('anim') ?? 'Idle') as DogAnimation,
      options: [...DOG_ANIMATIONS],
    },
    fade: { value: 0.25, min: 0.1, max: 0.6, step: 0.05 },
    frozen: params.has('t'),
    time: { value: Number(params.get('t') ?? 0), min: 0, max: 4, step: 1 / 60 },
    view: {
      value: (params.get('view') ?? '34') as View,
      options: Object.keys(VIEWS) as View[],
    },
    coatBase: '#6a4632',
    coatSecondary: '#7a5540',
    marking: { value: 'none' as Marking, options: MARKINGS },
    markingColor: '#f6ead8',
    earShape: {
      value: 'floppy' as EarShape,
      options: ['floppy', 'half', 'upright'] as EarShape[],
    },
    snoutLength: { value: 0.5, min: 0, max: 1, step: 0.01 },
    bodyType: { value: 0.5, min: 0, max: 1, step: 0.01 },
    tailLength: { value: 0.5, min: 0, max: 1, step: 0.01 },
    overrideMorphs: false,
    ...Object.fromEntries(
      [...SHAPE_MORPHS, ...FACE_MORPHS].map((m) => [
        `m_${m}`,
        { value: 0, min: 0, max: 1, step: 0.01 },
      ]),
    ),
    secondary: true,
    stats: false,
  }))

  // scripting API for the screenshot tool
  const pending = useRef<Array<() => void>>([])
  const [, bump] = useState(0)
  useEffect(() => {
    window.__dogLab = {
      ready: true,
      set: (values) =>
        new Promise<void>((resolve) => {
          pending.current.push(resolve)
          set(values as Parameters<typeof set>[0])
          bump((n) => n + 1) // always re-render, even if nothing changed
        }),
    }
  }, [set])
  useEffect(() => {
    if (!pending.current.length) return
    const done = pending.current.splice(0)
    // two frames: one to apply, one to present
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => done.forEach((r) => r()))),
    )
  })

  const record = v as unknown as Record<string, number>
  const morphs = v.overrideMorphs
    ? Object.fromEntries(
        [...SHAPE_MORPHS, ...FACE_MORPHS].map((m) => [m, record[`m_${m}`]]),
      )
    : undefined
  const controls = useRef<OrbitControlsImpl>(null)
  const blob = useBlobTexture()

  return (
    <div className="h-dvh w-full bg-gradient-to-b from-[#f6d6a8] to-[#bfe0ee]">
      <Leva hidden={!showUi} collapsed={false} titleBar={{ title: 'Hond' }} />
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 32, near: 0.05, far: 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <CameraRig view={v.view} controls={controls} />
        <OrbitControls ref={controls} enabled={showUi} makeDefault />
        <hemisphereLight args={['#fff4e2', '#b9c99a', 1.1]} />
        <directionalLight position={[2.5, 4.5, 3.5]} intensity={2.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#cfe2ff" />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
          <circleGeometry args={[3.2, 64]} />
          <meshToonMaterial color="#b6d99c" />
        </mesh>
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.002, -0.05]}
          scale={[1.05, 1.9, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={blob} transparent depthWrite={false} />
        </mesh>
        {v.animation === 'Eat' && (
          <group position={[0, 0, 0.56]}>
            <mesh position={[0, 0.05, 0]}>
              <cylinderGeometry args={[0.16, 0.12, 0.1, 32, 1, true]} />
              <meshToonMaterial color="#d95f5f" side={2} />
            </mesh>
            <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.15, 32]} />
              <meshToonMaterial color="#8a5a35" />
            </mesh>
          </group>
        )}
        <Suspense fallback={null}>
          <ClipInfo />
          <Dog
            url={params.get('model') ?? undefined}
            animation={v.animation}
            fade={v.fade}
            frozenTime={v.frozen ? v.time : undefined}
            coatBase={v.coatBase}
            coatSecondary={v.coatSecondary}
            marking={v.marking}
            markingColor={v.markingColor}
            earShape={v.earShape}
            snoutLength={v.snoutLength}
            bodyType={v.bodyType}
            tailLength={v.tailLength}
            morphs={morphs}
            secondary={v.secondary}
          />
        </Suspense>
        {v.stats && <Stats />}
      </Canvas>
    </div>
  )
}
