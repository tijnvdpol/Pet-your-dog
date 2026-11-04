import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { CanvasTexture } from 'three'
import { useDog } from '../game/store'
import { LiveDog } from './LiveDog'

/** Soft round shadow under the dog (cheaper than real shadows). */
function useBlobTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
    grad.addColorStop(0, 'rgba(40,52,30,0.5)')
    grad.addColorStop(0.6, 'rgba(40,52,30,0.22)')
    grad.addColorStop(1, 'rgba(40,52,30,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return new CanvasTexture(c)
  }, [])
}

export function Scene() {
  const appearance = useDog((s) => s.appearance)
  const blob = useBlobTexture()
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [2.3, 1.55, 3.9], fov: 38 }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      style={{ touchAction: 'none' }}
      onCreated={({ camera }) => {
        // Dev aid: `?cam=front|side|back|top` views the dog from another angle.
        const cam = new URLSearchParams(location.search).get('cam')
        const views: Record<string, [number, number, number]> = {
          front: [0, 1.0, 4.6],
          side: [4.6, 1.0, 0],
          back: [0, 1.3, -4.6],
          top: [0.01, 5.5, 0.6],
        }
        if (cam && views[cam]) camera.position.set(...views[cam])
        camera.lookAt(0, 0.62, 0.1)
      }}
    >
      <hemisphereLight args={['#fff4e2', '#b9c99a', 1.1]} />
      <directionalLight position={[2.5, 4.5, 3.5]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#cfe2ff" />
      {/* Ground + cheap blob shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <circleGeometry args={[2.3, 48]} />
        <meshToonMaterial color="#b6d99c" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, -0.05]} scale={[1.1, 1.9, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <Suspense fallback={null}>
        <LiveDog look={appearance} />
      </Suspense>
    </Canvas>
  )
}
