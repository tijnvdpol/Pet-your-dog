/** Signed distance primitives and combinators. Negative = inside. Units are metres-ish. */
export type V3 = [number, number, number]
export type Sdf = (x: number, y: number, z: number) => number

export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - (h * h * k) / 4
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))

/** Axis-aligned ellipsoid (iq's bound-accurate approximation). */
export const ellipsoid =
  (c: V3, r: V3): Sdf =>
  (x, y, z) => {
    const px = (x - c[0]) / r[0]
    const py = (y - c[1]) / r[1]
    const pz = (z - c[2]) / r[2]
    const k0 = Math.hypot(px, py, pz)
    const qx = px / r[0]
    const qy = py / r[1]
    const qz = pz / r[2]
    const k1 = Math.hypot(qx, qy, qz)
    return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1
  }

/** Ellipsoid rotated by Euler angles (applied Z, then X, then Y — good enough for ears). */
export const orientedEllipsoid = (c: V3, r: V3, rx: number, ry: number, rz: number): Sdf => {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)]
  // inverse rotation = transpose of R = Ry * Rx * Rz
  const base = ellipsoid([0, 0, 0], r)
  return (x, y, z) => {
    let px = x - c[0]
    let py = y - c[1]
    let pz = z - c[2]
    // inverse Ry
    let t = cy * px - sy * pz
    pz = sy * px + cy * pz
    px = t
    // inverse Rx
    t = cx * py + sx * pz
    pz = -sx * py + cx * pz
    py = t
    // inverse Rz
    t = cz * px + sz * py
    py = -sz * px + cz * py
    px = t
    return base(px, py, pz)
  }
}

/** Capsule with a radius that tapers from r1 at a to r2 at b (round cone). */
export const roundCone = (a: V3, b: V3, r1: number, r2: number): Sdf => {
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  return (px, py, pz) => {
    const pax = px - a[0]
    const pay = py - a[1]
    const paz = pz - a[2]
    const y = pax * bax + pay * bay + paz * baz
    const z = y - l2
    const dx = pax * l2 - bax * y
    const dy = pay * l2 - bay * y
    const dz = paz * l2 - baz * y
    const x2 = dx * dx + dy * dy + dz * dz
    const y2 = y * y * l2
    const z2 = z * z * l2
    const k = Math.sign(rr) * rr * rr * x2
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
  }
}

export const sphere =
  (c: V3, r: number): Sdf =>
  (x, y, z) =>
    Math.hypot(x - c[0], y - c[1], z - c[2]) - r

/** Mirrors the shape across the x = 0 plane. */
export const mirror =
  (f: Sdf): Sdf =>
  (x, y, z) =>
    f(Math.abs(x), y, z)

export const unionAll = (fs: Sdf[], k: number): Sdf => (x, y, z) => {
  let d = fs[0](x, y, z)
  for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k)
  return d
}
