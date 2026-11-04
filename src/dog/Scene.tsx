import { Canvas } from '@react-three/fiber'
import { PlaceholderDog } from './PlaceholderDog'

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [2.4, 1.6, 3.8], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
      onCreated={({ camera }) => camera.lookAt(0, 0.75, 0.2)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      {/* Ground + cheap blob shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]}>
        <circleGeometry args={[2.3, 40]} />
        <meshToonMaterial color="#b9dfa0" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} scale={[1.1, 1.7, 1]}>
        <circleGeometry args={[0.85, 32]} />
        <meshBasicMaterial color="#3d5a2a" transparent opacity={0.25} />
      </mesh>
      <PlaceholderDog />
    </Canvas>
  )
}
