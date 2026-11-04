import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Leva, useControls } from 'leva'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SkeletonHelper, type Object3D } from 'three'
import { Dog } from '../components/Dog'
import { CLIP_NAMES, type ClipName } from '../components/dogRig'

const CAMS = {
  front: { pos: [0, 0.7, 3.0], look: [0, 0.46, 0], fov: 32 },
  '3/4': { pos: [2.1, 1.05, 2.3], look: [0, 0.44, -0.02], fov: 32 },
  side: { pos: [3.3, 0.55, 0], look: [0, 0.46, 0.0], fov: 32 },
  top: { pos: [0.01, 3.4, 0.15], look: [0, 0.3, 0.0], fov: 32 },
  face: { pos: [0.85, 0.95, 1.6], look: [0, 0.74, 0.5], fov: 26 },
} as const
type CamName = keyof typeof CAMS

function CameraRig({ cam }: { cam: CamName }) {
  const { camera, controls } = useThree() as unknown as {
    camera: { position: { set: (...a: number[]) => void }; fov: number; updateProjectionMatrix: () => void }
    controls: { target: { set: (...a: number[]) => void }; update: () => void } | null
  }
  useEffect(() => {
    const c = CAMS[cam]
    camera.position.set(...c.pos)
    camera.fov = c.fov
    camera.updateProjectionMatrix()
    controls?.target.set(...c.look)
    controls?.update()
  }, [cam, camera, controls])
  return null
}

function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
    grad.addColorStop(0, 'rgba(40,50,30,0.55)')
    grad.addColorStop(1, 'rgba(40,50,30,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return new CanvasTexture(c)
  }, [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
        <circleGeometry args={[1.6, 48]} />
        <meshBasicMaterial color="#b3cc94" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} scale={[1, 1.5, 1]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

function Skeleton({ target }: { target: React.RefObject<Object3D | null> }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let helper: SkeletonHelper | undefined
    const id = setTimeout(() => {
      const root = target.current
      if (!root) return
      helper = new SkeletonHelper(root)
      scene.add(helper)
    }, 300)
    return () => {
      clearTimeout(id)
      if (helper) scene.remove(helper)
    }
  }, [scene, target])
  return null
}

function ReadyFlag() {
  const n = useRef(0)
  useFrame(() => {
    if (++n.current === 20) (window as unknown as { __dogReady?: boolean }).__dogReady = true
  })
  return null
}

/** /dev/dog – preview and tuning page. URL: ?clip=Sit&time=1.2&cam=3/4&shot=1 */
export default function DogPreview() {
  const q = new URLSearchParams(location.search)
  const shot = q.has('shot')
  const ctl = useControls({
    animation: { value: (q.get('clip') as ClipName) || 'Idle', options: [...CLIP_NAMES] },
    camera: { value: ((q.get('cam') as CamName) || '3/4') as CamName, options: Object.keys(CAMS) as CamName[] },
    coatBase: { value: q.get('base') ?? '#b97a4a', label: 'coat_base' },
    coatSecondary: { value: q.get('second') ?? '#f1e3c6', label: 'coat_secondary' },
    earShape: { value: (q.get('ears') as 'hanging') || 'hanging', options: ['hanging', 'half', 'upright'] },
    snoutLength: { value: Number(q.get('snout') ?? 0), min: -1, max: 1, step: 0.05 },
    bodyType: { value: (q.get('body') as 'normal') || 'normal', options: ['slim', 'normal', 'chunky'] },
    tailLength: { value: Number(q.get('tail') ?? 0), min: -1, max: 1, step: 0.05 },
    mouthOpen: { value: Number(q.get('mouth') ?? 0), min: 0, max: 1, step: 0.05 },
    secondary: true,
    wireframe: q.has('wire'),
    skeleton: q.has('bones'),
    frozen: { value: q.has('time'), label: 'freeze at time' },
    time: { value: Number(q.get('time') ?? 0), min: 0, max: 3.2, step: 0.02 },
  })
  const dogRef = useRef<Object3D | null>(null)
  const cam = CAMS[ctl.camera]
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#f6d6a8] to-[#bfe0ee]">
      <Leva hidden={shot} collapsed={false} />
      <Canvas flat dpr={[1, 2]} camera={{ position: [...cam.pos], fov: cam.fov, near: 0.05, far: 50 }} gl={{ preserveDrawingBuffer: true }}>
        <hemisphereLight args={['#fff1dc', '#b5c79a', 1.5]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2.4} color="#fff6e8" />
        <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#cfe6ff" />
        <OrbitControls makeDefault enablePan={false} minDistance={0.6} maxDistance={6} />
        <CameraRig cam={ctl.camera} />
        <Ground />
        <Suspense fallback={null}>
          <group ref={dogRef}>
            <Dog
              coatBase={ctl.coatBase}
              coatSecondary={ctl.coatSecondary}
              earShape={ctl.earShape as 'hanging' | 'half' | 'upright'}
              snoutLength={ctl.snoutLength}
              bodyType={ctl.bodyType as 'slim' | 'normal' | 'chunky'}
              tailLength={ctl.tailLength}
              animation={ctl.animation}
              mouthOpen={ctl.mouthOpen}
              secondary={ctl.secondary}
              wireframe={ctl.wireframe}
              time={ctl.frozen ? ctl.time : undefined}
            />
          </group>
          {ctl.skeleton && <Skeleton target={dogRef} />}
          <ReadyFlag />
        </Suspense>
      </Canvas>
    </div>
  )
}
