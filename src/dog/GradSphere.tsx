import { useEffect, useMemo } from 'react'
import { Color, MathUtils, SphereGeometry, Float32BufferAttribute } from 'three'
import type { ThreeElements } from '@react-three/fiber'

interface Props extends Omit<ThreeElements['mesh'], 'args' | 'color'> {
  radius?: number
  top: string
  bottom: string
  /** Height (-1 bottom … 1 top) where the colour blend is centred. */
  mid?: number
  /** Blend width; smaller = sharper transition. */
  soft?: number
}

/** Ellipsoid with a top→bottom vertex-colour gradient (soft fur shading, no textures). */
export function GradSphere({
  radius = 1,
  top,
  bottom,
  mid = -0.2,
  soft = 0.9,
  ...mesh
}: Props) {
  const geo = useMemo(() => {
    const g = new SphereGeometry(radius, 32, 22)
    const pos = g.attributes.position
    const a = new Color(top)
    const b = new Color(bottom)
    const c = new Color()
    const colors: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / radius
      const t = MathUtils.smoothstep(y, mid - soft / 2, mid + soft / 2)
      c.copy(b).lerp(a, t)
      colors.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return g
  }, [radius, top, bottom, mid, soft])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh {...mesh} geometry={geo}>
      <meshStandardMaterial vertexColors roughness={0.85} />
    </mesh>
  )
}
