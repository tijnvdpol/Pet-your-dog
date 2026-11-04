import { ExtrudeGeometry, Shape } from 'three'
import type { EarType } from './appearance'

const THICKNESS = 0.035

/** Angular, flat ear plates in the low-poly style. Floppy/half ears are meant to hang, upright ones point up. */
export function earGeometry(type: EarType): ExtrudeGeometry {
  const s = new Shape()
  if (type === 'upright') {
    s.moveTo(-0.17, 0)
    s.lineTo(0.17, 0)
    s.lineTo(0.04, 0.5)
    s.lineTo(-0.04, 0.5)
    s.closePath()
  } else {
    // Hanging flap: attached at the top, bulging backwards, ending in a blunt point.
    const k = type === 'half' ? 0.95 : 1.4
    const pts: [number, number][] = [
      [-0.07, 0],
      [0.1, 0.03],
      [0.21, -0.1],
      [0.18, -0.28],
      [0.06, -0.4],
      [-0.05, -0.33],
      [-0.1, -0.12],
    ]
    pts.forEach(([x, y], i) =>
      i === 0 ? s.moveTo(x * k, y * k) : s.lineTo(x * k, y * k),
    )
    s.closePath()
  }
  const geo = new ExtrudeGeometry(s, { depth: THICKNESS, bevelEnabled: false })
  geo.translate(0, 0, -THICKNESS / 2)
  // Hanging ears lie flat against the side of the head (plate normal along x).
  if (type !== 'upright') geo.rotateY(Math.PI / 2 - 0.5) // angled so the flap is seen from the front too
  return geo
}
