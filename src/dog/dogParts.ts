import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js'
import type { Appearance } from './appearance'
import { meshFromSdf, type Bounds } from './mesher'
import { ellipsoid, taper, union, type Sdf, type Vec3 } from './sdf'

const WHITE = new Color('#fffaf0')
/** Warm cream used for the light areas, so they never turn white or grey. */
const CREAM = new Color('#f9e4be')
/** Resolution of the smooth source mesh; it is simplified to a few large facets afterwards. */
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
  /** Head measurements in head-local coordinates (origin = neck pivot): skull centre z and muzzle tip z. */
  skullZ: number
  tipZ: number
  /** Paw centres, relative to the leg pivot (for toes). */
  frontPaw: Vec3
  hindPaw: Vec3
}

export function dogLayout(look: Appearance): DogLayout {
  const H = look.legLength
  const w = 0.85 + 0.3 * look.build
  const L = look.bodyLength
  const frontLegPivot: Vec3 = [0.19 * w, H, 0.4 * L]
  const hindLegPivot: Vec3 = [0.22 * w, H, -0.4 * L]
  const headZ = 0.62 * L
  const skullWorldZ = 0.82 * L
  // The muzzle sticks out well in front of the skull: 0.2 + 0.26 * snoutLength.
  const tipWorldZ = skullWorldZ + 0.34 + 0.2 + 0.26 * look.snoutLength
  return {
    H,
    w,
    L,
    headPivot: [0, H + 0.45, headZ],
    skullZ: skullWorldZ - headZ,
    tipZ: tipWorldZ - headZ,
    tailPivot: [0, H + 0.4, -0.78 * L],
    frontLegPivot,
    hindLegPivot,
    frontPaw: [0.18 * w - frontLegPivot[0], 0.06 - H, 0.47 * L - frontLegPivot[2]],
    hindPaw: [0.21 * w - hindLegPivot[0], 0.06 - H, -0.38 * L - hindLegPivot[2]],
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

type ColorOf = (
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
) => Color

/** Colour of a facet from its centre and normal, in hard blocks (no gradients) for the low-poly look. */
function faceColor(look: Appearance, lay: DogLayout): ColorOf {
  const { H, w, L } = lay
  const fur = new Color(look.furColor)
  const light = fur.clone().lerp(CREAM, 0.85)
  const second = new Color(look.secondColor)
  const hp = lay.headPivot
  const eyeY = hp[1] + 0.37
  const eyeZ = hp[2] + lay.skullZ + 0.27
  const spots: [number, number, number, number][] = [
    [0.36 * w, H + 0.32, 0.12 * L, 0.17],
    [0.33 * w, H + 0.12, -0.3 * L, 0.15],
    [0.2 * w, H + 0.56, -0.12 * L, 0.15],
    [-0.35 * w, H + 0.34, -0.05 * L, 0.17],
    [-0.28 * w, H + 0.5, 0.3 * L, 0.13],
    [-0.36 * w, H + 0.1, -0.35 * L, 0.15],
    [0.05 * w, H + 0.62, -0.42 * L, 0.14],
    [0.38 * w, H + 0.45, 0.45 * L, 0.12],
    [0.3 * w, H + 0.5, -0.5 * L, 0.12],
    [0.4, 0.45 * H, -0.42 * L, 0.1],
    [-0.4, 0.45 * H, 0.4 * L, 0.1],
  ]
  const isHead = (y: number, z: number) => y > H + 0.42 && z > 0.66 * L
  const out = new Color()

  return (x, y, z, _nx, ny) => {
    void ny
    out.copy(fur)
    const ax = Math.abs(x)
    // Light underside, chest front, throat, muzzle and the lower legs.
    if (y < H - 0.02 && y > 0.3 * H && ax < 0.34 * w) out.copy(light)
    if (ax < 0.2 && z > 0.5 * L && y < H + 0.5) out.copy(light)
    if (z > hp[2] + lay.skullZ + 0.3 && y > H + 0.3) out.copy(light)
    if (y < 0.3 * H) out.copy(look.marking === 'socks' ? WHITE : light)
    // Tail in the second colour.
    if (z < -0.7 * L && y > H + 0.35) out.copy(second)

    switch (look.marking) {
      case 'patch':
        // Cream head with a dark patch around one eye.
        if (isHead(y, z)) out.copy(light)
        if (Math.hypot(x - 0.2, y - eyeY, z - eyeZ) < 0.2) out.copy(second)
        break
      case 'blaze':
        if (ax < 0.075 && y > H + 0.85 && z > 0.8 * L) out.copy(WHITE)
        break
      case 'mask':
      case 'saddle':
        if (z > hp[2] + lay.skullZ + 0.3 && y < H + 0.85) out.copy(second)
        if (
          look.marking === 'saddle' &&
          ny > 0.1 &&
          y > H + 0.2 &&
          z < 0.42 * L &&
          z > -0.6 * L
        )
          out.copy(second)
        break
      case 'spots':
        for (const [cx, cy, cz, r] of spots) {
          if (Math.hypot(x - cx, y - cy, z - cz) < r) out.copy(second)
        }
        break
      default:
        break
    }
    return out
  }
}

/** Splits a mesh into independent triangles and paints each one in a single colour. */
function paintFacets(geo: BufferGeometry, colorOf: ColorOf): BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo
  const pos = flat.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i),
      ay = pos.getY(i),
      az = pos.getZ(i)
    const bx = pos.getX(i + 1),
      by = pos.getY(i + 1),
      bz = pos.getZ(i + 1)
    const cx = pos.getX(i + 2),
      cy = pos.getY(i + 2),
      cz = pos.getZ(i + 2)
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    const c = colorOf(
      (ax + bx + cx) / 3,
      (ay + by + cy) / 3,
      (az + bz + cz) / 3,
      nx,
      ny,
      nz,
    )
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r
      colors[(i + k) * 3 + 1] = c.g
      colors[(i + k) * 3 + 2] = c.b
    }
  }
  // Flat shading derives its own normals; drop the smooth ones.
  flat.deleteAttribute('normal')
  flat.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return flat
}

const simplifier = new SimplifyModifier()
const shift = (g: BufferGeometry, p: Vec3) => g.translate(-p[0], -p[1], -p[2])

/**
 * Builds every body part of the dog as a low-poly mesh: a smooth surface is generated from the
 * shape, simplified to a few large facets, and painted per facet. Runs on appearance changes only.
 */
export async function buildDogParts(look: Appearance): Promise<DogParts> {
  const lay = dogLayout(look)
  const { H, w, L } = lay
  const tl = look.tailLength
  const colorOf = faceColor(look, lay)
  /** `keep` = fraction of the triangles to keep. */
  const mk = async (sdf: Sdf, bounds: Bounds, keep: number) => {
    const smooth = meshFromSdf(sdf, bounds, CELL)
    const removeVerts = Math.floor(smooth.attributes.position.count * (1 - keep))
    const simple = await simplifier.modify(smooth, removeVerts)
    smooth.dispose()
    return paintFacets(simple, colorOf)
  }

  // Torso: deep chest, tucked waist, round haunches, a short neck stub, shoulders and thighs.
  const bodySdf = union(
    0.12,
    ellipsoid([0, H + 0.14, 0.34 * L], [0.4 * w, 0.43, 0.44 * L]),
    ellipsoid([0, H + 0.2, -0.04 * L], [0.33 * w, 0.35, 0.42 * L]),
    ellipsoid([0, H + 0.2, -0.44 * L], [0.37 * w, 0.4, 0.38 * L]),
    taper([0, H + 0.32, 0.55 * L], lay.headPivot, 0.26, 0.25),
    ...[-1, 1].flatMap((sd) => [
      taper(
        [sd * 0.2 * w, H + 0.14, 0.4 * L],
        [sd * 0.18 * w, H * 0.5, 0.38 * L],
        0.19,
        0.12,
      ),
      taper(
        [sd * 0.22 * w, H + 0.24, -0.46 * L],
        [sd * 0.24 * w, H * 0.55, -0.32 * L],
        0.2,
        0.12,
      ),
    ]),
  )
  // Head: neck, rounded skull, a clearly protruding muzzle and a lower jaw.
  const skullWorldZ = lay.skullZ + lay.headPivot[2]
  const tipWorldZ = lay.tipZ + lay.headPivot[2]
  const headSdf = union(
    0.1,
    taper(lay.headPivot, [0, H + 0.6, 0.78 * L], 0.275, 0.23),
    ellipsoid([0, H + 0.72, skullWorldZ], [0.36, 0.34, 0.34]),
    taper([0, H + 0.66, skullWorldZ + 0.1], [0, H + 0.6, tipWorldZ - 0.13], 0.17, 0.13),
    ellipsoid(
      [0, H + 0.54, (skullWorldZ + tipWorldZ) / 2 + 0.02],
      [0.1, 0.08, (tipWorldZ - skullWorldZ) / 2],
    ),
  )
  // Tail: thick at the base, curling up, with a soft tip.
  const t0: Vec3 = lay.tailPivot
  const t1: Vec3 = [0, H + 0.58 + 0.1 * tl, -0.78 * L - 0.2 * tl]
  const t2: Vec3 = [0, H + 0.58 + 0.42 * tl, -0.78 * L - 0.22 * tl]
  const tailSdf = union(
    0.08,
    taper(t0, t1, 0.1, 0.075),
    taper(t1, t2, 0.075, 0.06),
    ellipsoid([0, t2[1] + 0.04, t2[2]], [0.075, 0.1, 0.075]),
  )
  // Legs (right side), chunkier than before: lower foreleg + paw, shin + hock + paw.
  const frontSdf = union(
    0.06,
    taper([0.18 * w, H * 0.5 + 0.05, 0.38 * L], [0.18 * w, 0.11, 0.4 * L], 0.15, 0.115),
    ellipsoid([0.18 * w, 0.06, 0.47 * L], [0.13, 0.07, 0.16]),
  )
  const hindSdf = union(
    0.06,
    taper(
      [0.24 * w, H * 0.55 + 0.05, -0.32 * L],
      [0.21 * w, H * 0.3, -0.5 * L],
      0.134,
      0.09,
    ),
    taper([0.21 * w, H * 0.3, -0.5 * L], [0.21 * w, 0.1, -0.45 * L], 0.09, 0.085),
    ellipsoid([0.21 * w, 0.055, -0.38 * L], [0.11, 0.065, 0.14]),
  )

  const [body, head, tail, front, hind] = await Promise.all([
    mk(
      bodySdf,
      { min: [-0.75, H * 0.4, -1.15 * L], max: [0.75, H + 0.75, 0.85 * L] },
      0.1,
    ),
    mk(
      headSdf,
      { min: [-0.5, H + 0.15, 0.4 * L], max: [0.5, H + 1.2, 1.0 * L + 0.55] },
      0.14,
    ),
    mk(
      tailSdf,
      { min: [-0.25, H + 0.15, -0.78 * L - 0.55], max: [0.25, H + 1.2, -0.78 * L + 0.2] },
      0.25,
    ),
    mk(
      frontSdf,
      { min: [-0.05, -0.05, 0.4 * L - 0.35], max: [0.5, H * 0.5 + 0.1, 0.4 * L + 0.45] },
      0.22,
    ),
    mk(
      hindSdf,
      {
        min: [-0.05, -0.05, -0.4 * L - 0.55],
        max: [0.5, H * 0.55 + 0.1, -0.4 * L + 0.4],
      },
      0.22,
    ),
  ])

  // Put each part's origin at its pivot, so it can be rotated in place.
  shift(head, lay.headPivot)
  shift(tail, lay.tailPivot)
  shift(front, lay.frontLegPivot)
  shift(hind, lay.hindLegPivot)
  return { layout: lay, body, head, tail, front, hind }
}
