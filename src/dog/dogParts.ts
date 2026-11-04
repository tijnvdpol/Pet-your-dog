import { Color, MathUtils, type BufferGeometry } from 'three'
import type { Appearance } from './appearance'
import { meshFromSdf, type Bounds } from './mesher'
import { ellipsoid, taper, union, type Sdf, type Vec3 } from './sdf'

const WHITE = new Color('#fffaf0')
const CELL = 0.04

/** Key measurements of the standing dog, shared by the mesh builder and the animated model. */
export interface DogLayout {
  H: number
  w: number
  L: number
  /** Where the head, tail and legs rotate (world coordinates of the standing pose). */
  headPivot: Vec3
  tailPivot: Vec3
  frontLegPivot: Vec3
  hindLegPivot: Vec3
}

export function dogLayout(look: Appearance): DogLayout {
  const H = look.legLength
  const w = 0.85 + 0.3 * look.build
  const L = look.bodyLength
  return {
    H,
    w,
    L,
    headPivot: [0, H + 0.45, 0.62 * L],
    tailPivot: [0, H + 0.4, -0.78 * L],
    frontLegPivot: [0.19 * w, H, 0.4 * L],
    hindLegPivot: [0.22 * w, H, -0.4 * L],
  }
}

export interface DogParts {
  layout: DogLayout
  body: BufferGeometry
  head: BufferGeometry
  tail: BufferGeometry
  /** Right legs; the left ones are mirrored copies. Origin is the leg pivot. */
  front: BufferGeometry
  hind: BufferGeometry
}

/** Fur colour at a point on the surface, including markings. All in world coordinates. */
function furColor(look: Appearance, lay: DogLayout) {
  const { H, w, L } = lay
  const fur = new Color(look.furColor)
  const belly = fur.clone().lerp(WHITE, 0.6)
  const chin = fur.clone().lerp(WHITE, 0.3)
  const second = new Color(look.secondColor)
  const out = new Color()
  const spotCenters: [number, number, number, number][] = [
    [0.36 * w, H + 0.32, 0.12 * L, 0.2],
    [0.33 * w, H + 0.12, -0.3 * L, 0.17],
    [0.2 * w, H + 0.56, -0.12 * L, 0.18],
    [-0.35 * w, H + 0.34, -0.05 * L, 0.2],
    [-0.28 * w, H + 0.5, 0.3 * L, 0.15],
    [-0.36 * w, H + 0.1, -0.35 * L, 0.17],
    [0.05 * w, H + 0.62, -0.42 * L, 0.16],
    [0.38 * w, H + 0.45, 0.45 * L, 0.14],
    [0.4, 0.45 * H, -0.42 * L, 0.12],
    [0.19 * w, 0.4 * H, 0.38 * L, 0.1],
    [-0.4, 0.45 * H, 0.4 * L, 0.11],
    [0.3 * w, H + 0.5, -0.5 * L, 0.13],
  ]
  const soft = (v: number, edge0: number, edge1: number) =>
    MathUtils.smoothstep(v, edge0, edge1)

  return (x: number, y: number, z: number, ny: number) => {
    // Fur on top, fading to a lighter underside.
    // Only on the torso underside (not on the legs), so there are no colour jumps where legs join.
    const underside =
      soft(-ny, 0.2, 0.85) *
      soft(0.08 * w + 0.1 - Math.abs(x), 0, 0.1) *
      soft(y, H - 0.35, H - 0.15)
    out.copy(fur).lerp(belly, underside * 0.8)
    // Lighter chin and muzzle underside.
    if (z > 0.85 * L && y > H + 0.3) out.lerp(chin, 0.7 * soft(-ny, -0.2, 0.5))
    // Paws.
    out.lerp(
      look.marking === 'socks' ? WHITE : belly,
      (look.marking === 'socks' ? 1 : 0.35) * soft(0.16 - y, 0, 0.1),
    )
    // Tail takes the second colour.
    if (z < -0.7 * L && y > H + 0.35) out.copy(second)

    switch (look.marking) {
      case 'blaze':
        out.lerp(
          WHITE,
          soft(0.075 - Math.abs(x), 0, 0.04) *
            soft(y, H + 0.85, H + 0.95) *
            soft(z, 0.9 * L, 1.05 * L),
        )
        break
      case 'mask':
      case 'saddle': {
        // Dark muzzle.
        out.lerp(
          second,
          soft(z, 1.0 * L + 0.04, 1.0 * L + 0.14) * soft(H + 0.78 - y, 0, 0.08),
        )
        if (look.marking === 'saddle') {
          // Dark patch over the back.
          const onBack = soft(ny, -0.1, 0.25) * soft(y, H + 0.18, H + 0.3)
          out.lerp(
            second,
            onBack * soft(0.5 * L - z, 0, 0.15) * soft(z, -0.58 * L, -0.4 * L),
          )
        }
        break
      }
      case 'spots': {
        let m = 0
        for (const [cx, cy, cz, r] of spotCenters) {
          const d = Math.hypot(x - cx, y - cy, z - cz)
          m = Math.max(m, soft(r - d, 0, r * 0.35))
        }
        out.lerp(second, m)
        break
      }
      default:
        break
    }
    return out
  }
}

const shift = (g: BufferGeometry, p: Vec3) => g.translate(-p[0], -p[1], -p[2])

/** Builds every body part of the dog as a smooth mesh. Runs on appearance changes, not per frame. */
export function buildDogParts(look: Appearance): DogParts {
  const lay = dogLayout(look)
  const { H, w, L } = lay
  const sl = look.snoutLength
  const tl = look.tailLength
  const color = furColor(look, lay)
  const mk = (sdf: Sdf, bounds: Bounds) =>
    meshFromSdf(sdf, bounds, CELL, (x, y, z, _nx, ny) => color(x, y, z, ny))

  // Torso: deep chest, tucked waist, round haunches, plus a short neck stub.
  const bodySdf = union(
    0.12,
    ellipsoid([0, H + 0.14, 0.34 * L], [0.4 * w, 0.43, 0.44 * L]),
    ellipsoid([0, H + 0.2, -0.04 * L], [0.33 * w, 0.35, 0.42 * L]),
    ellipsoid([0, H + 0.2, -0.44 * L], [0.37 * w, 0.4, 0.38 * L]),
    taper([0, H + 0.32, 0.55 * L], lay.headPivot, 0.26, 0.25),
    // Shoulders and thighs (down to elbow and knee) belong to the body, so legs join seamlessly.
    ...[-1, 1].flatMap((sd) => [
      taper(
        [sd * 0.2 * w, H + 0.14, 0.4 * L],
        [sd * 0.18 * w, H * 0.5, 0.38 * L],
        0.17,
        0.1,
      ),
      taper(
        [sd * 0.22 * w, H + 0.24, -0.46 * L],
        [sd * 0.24 * w, H * 0.55, -0.32 * L],
        0.2,
        0.11,
      ),
    ]),
  )
  const body = mk(bodySdf, {
    min: [-0.75, H * 0.4, -1.15 * L],
    max: [0.75, H + 0.75, 0.85 * L],
  })

  // Head: neck, big round skull and a short soft muzzle. Slightly wider neck so it overlaps the body.
  const headSdf = union(
    0.1,
    taper(lay.headPivot, [0, H + 0.6, 0.82 * L], 0.275, 0.23),
    ellipsoid([0, H + 0.7, 0.92 * L], [0.38, 0.35, 0.36]),
    taper([0, H + 0.62, 1.0 * L], [0, H + 0.58, 1.0 * L + 0.1 + 0.18 * sl], 0.17, 0.125),
  )
  const head = mk(headSdf, {
    min: [-0.5, H + 0.15, 0.4 * L],
    max: [0.5, H + 1.2, 1.0 * L + 0.55],
  })

  // Tail: thick at the base, curling up, with a soft tip.
  const t0: Vec3 = lay.tailPivot
  const t1: Vec3 = [0, H + 0.58 + 0.1 * tl, -0.78 * L - 0.2 * tl]
  const t2: Vec3 = [0, H + 0.58 + 0.42 * tl, -0.78 * L - 0.22 * tl]
  const tailSdf = union(
    0.08,
    taper(t0, t1, 0.095, 0.07),
    taper(t1, t2, 0.07, 0.055),
    ellipsoid([0, t2[1] + 0.04, t2[2]], [0.07, 0.09, 0.07]),
  )
  const tail = mk(tailSdf, {
    min: [-0.25, H + 0.15, -0.78 * L - 0.55],
    max: [0.25, H + 1.2, -0.78 * L + 0.2],
  })

  // Legs (right side). Front: shoulder, elbow, wrist, paw. Hind: thigh, knee, hock, paw (Z-shape).
  const frontSdf = union(
    0.06,
    taper([0.18 * w, H * 0.5 + 0.05, 0.38 * L], [0.18 * w, 0.08, 0.4 * L], 0.104, 0.075),
    ellipsoid([0.18 * w, 0.05, 0.47 * L], [0.095, 0.058, 0.13]),
  )
  const front = mk(frontSdf, {
    min: [-0.05, -0.05, 0.4 * L - 0.35],
    max: [0.5, H * 0.5 + 0.1, 0.4 * L + 0.45],
  })
  const hindSdf = union(
    0.06,
    taper(
      [0.24 * w, H * 0.55 + 0.05, -0.32 * L],
      [0.21 * w, H * 0.3, -0.5 * L],
      0.114,
      0.075,
    ),
    taper([0.21 * w, H * 0.3, -0.5 * L], [0.21 * w, 0.08, -0.45 * L], 0.075, 0.07),
    ellipsoid([0.21 * w, 0.05, -0.38 * L], [0.095, 0.058, 0.13]),
  )
  const hind = mk(hindSdf, {
    min: [-0.05, -0.05, -0.4 * L - 0.55],
    max: [0.5, H * 0.55 + 0.1, -0.4 * L + 0.4],
  })

  // Put each part's origin at its pivot, so it can be rotated in place.
  shift(head, lay.headPivot)
  shift(tail, lay.tailPivot)
  shift(front, lay.frontLegPivot)
  shift(hind, lay.hindLegPivot)
  return { layout: lay, body, head, tail, front, hind }
}
