/** Tiny signed-distance-field toolkit for building smooth, organic shapes. */
export type Vec3 = readonly [number, number, number]
export type Sdf = (x: number, y: number, z: number) => number

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)

/** Ellipsoid (approximate distance, good enough for blending and meshing). */
export const ellipsoid =
  (c: Vec3, r: Vec3): Sdf =>
  (x, y, z) => {
    const px = (x - c[0]) / r[0]
    const py = (y - c[1]) / r[1]
    const pz = (z - c[2]) / r[2]
    const k0 = len3(px, py, pz)
    const k1 = len3(px / r[0], py / r[1], pz / r[2])
    return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1
  }

/** Line segment from `a` to `b` whose radius changes smoothly from `ra` to `rb` (a tapered limb). */
export const taper = (a: Vec3, b: Vec3, ra: number, rb: number): Sdf => {
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const baba = bax * bax + bay * bay + baz * baz
  return (x, y, z) => {
    const pax = x - a[0]
    const pay = y - a[1]
    const paz = z - a[2]
    const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / baba))
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h)
  }
}

/** Polynomial smooth minimum: blends two shapes together with blend radius `k`. */
export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Smooth union of many shapes. */
export const union =
  (k: number, ...shapes: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = shapes[0](x, y, z)
    for (let i = 1; i < shapes.length; i++) d = smin(d, shapes[i](x, y, z), k)
    return d
  }
