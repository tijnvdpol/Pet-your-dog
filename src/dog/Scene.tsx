import { Canvas } from '@react-three/fiber'
import { useDog } from '../game/store'
import { Dog } from './Dog'

export function Scene() {
  const appearance = useDog((s) => s.appearance)
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [3.0, 2.1, 5.0], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
      onCreated={({ camera }) => {
        // Dev aid: `?cam=front|side|back|top` views the dog from another angle.
        const cam = new URLSearchParams(location.search).get('cam')
        const views: Record<string, [number, number, number]> = {
          front: [0, 1.3, 5.6],
          side: [5.6, 1.3, 0],
          back: [0, 1.6, -5.6],
          top: [0.01, 6.5, 0.8],
        }
        if (cam && views[cam]) camera.position.set(...views[cam])
        camera.lookAt(0, 0.8, 0.2)
      }}
    >
      <hemisphereLight args={['#fff3e0', '#e8d9bd', 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={2.8} />
      <directionalLight position={[-4, 2, 2]} intensity={0.7} />
      {/* Ground + cheap blob shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]}>
        <circleGeometry args={[2.3, 40]} />
        <meshStandardMaterial color="#b9dfa0" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} scale={[1.1, 1.7, 1]}>
        <circleGeometry args={[0.85, 32]} />
        <meshBasicMaterial color="#3d5a2a" transparent opacity={0.25} />
      </mesh>
      <Dog look={appearance} />
    </Canvas>
  )
}
