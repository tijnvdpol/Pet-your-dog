/** Tiny vector / quaternion / matrix helpers for the build script (no three.js dependency). */

export type V3 = [number, number, number]
/** Quaternion as [x, y, z, w]. */
export type Q = [number, number, number, number]
/** 4x4 matrix, column-major (glTF / three.js layout). */
export type M4 = number[]

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const mul = (a: V3, b: V3): V3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const norm = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const lerp = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export const mirrorX = (a: V3): V3 => [-a[0], a[1], a[2]]
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t

// ---------- quaternions ----------

export const qIdentity = (): Q => [0, 0, 0, 1]

export function qAxisAngle(axis: V3, angle: number): Q {
  const [x, y, z] = norm(axis)
  const s = Math.sin(angle / 2)
  return [x * s, y * s, z * s, Math.cos(angle / 2)]
}

export function qMul(a: Q, b: Q): Q {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]]

export function qNormalize(q: Q): Q {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

export function qRotate(q: Q, v: V3): V3 {
  // v' = q v q*
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1]
  const iy = w * v[1] + z * v[0] - x * v[2]
  const iz = w * v[2] + x * v[1] - y * v[0]
  const iw = -x * v[0] - y * v[1] - z * v[2]
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ]
}

/** Euler angles in three.js 'XYZ' order (R = Rx * Ry * Rz). */
export function qEuler(x: number, y: number, z: number): Q {
  const c1 = Math.cos(x / 2)
  const c2 = Math.cos(y / 2)
  const c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2)
  const s2 = Math.sin(y / 2)
  const s3 = Math.sin(z / 2)
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

export function qSlerp(a: Q, b: Q, t: number): Q {
  let [bx, by, bz, bw] = b
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (cos < 0) {
    cos = -cos
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  if (cos > 0.9995) {
    return qNormalize([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ])
  }
  const th = Math.acos(cos)
  const s = Math.sin(th)
  const wa = Math.sin((1 - t) * th) / s
  const wb = Math.sin(t * th) / s
  return [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb,
  ]
}

/** Rotation taking orthonormal basis (columns) `from` to `to`. Each basis = [x, y, z] axes. */
export function qFromBases(from: [V3, V3, V3], to: [V3, V3, V3]): Q {
  // R = To * From^T
  const m = new Array<number>(9).fill(0) // row-major 3x3
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0
      for (let k = 0; k < 3; k++) s += to[k][r] * from[k][c]
      m[r * 3 + c] = s
    }
  return qFromMat3(m)
}

/** Quaternion from a row-major 3x3 rotation matrix. */
export function qFromMat3(m: number[]): Q {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m
  const tr = m00 + m11 + m22
  let q: Q
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1)
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
  }
  return qNormalize(q)
}

// ---------- 4x4 matrices (column-major) ----------

export function m4Identity(): M4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

/** Affine matrix from three basis columns (already scaled) and an origin. */
export function m4FromBasis(x: V3, y: V3, z: V3, o: V3): M4 {
  return [
    x[0],
    x[1],
    x[2],
    0,
    y[0],
    y[1],
    y[2],
    0,
    z[0],
    z[1],
    z[2],
    0,
    o[0],
    o[1],
    o[2],
    1,
  ]
}

export function m4Compose(t: V3, q: Q, s: V3 = [1, 1, 1]): M4 {
  return m4FromBasis(
    scale(qRotate(q, [1, 0, 0]), s[0]),
    scale(qRotate(q, [0, 1, 0]), s[1]),
    scale(qRotate(q, [0, 0, 1]), s[2]),
    t,
  )
}

export function m4Mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = s
    }
  return o
}

export function m4Point(m: M4, p: V3): V3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

/** Inverse of an affine 4x4 (bottom row 0 0 0 1). */
export function m4InvertAffine(m: M4): M4 {
  const [a, b, c, , d, e, f, , g, h, i] = m
  // columns: (a,b,c) (d,e,f) (g,h,i); matrix rows: [a d g; b e h; c f i]
  const A = e * i - f * h
  const B = -(b * i - c * h)
  const C = b * f - c * e
  const det = a * A + d * B + g * C
  const inv = 1 / det
  // inverse of 3x3 (row-major result r)
  const r00 = A * inv
  const r01 = -(d * i - g * f) * inv
  const r02 = (d * h - g * e) * inv
  const r10 = B * inv
  const r11 = (a * i - g * c) * inv
  const r12 = -(a * h - g * b) * inv
  const r20 = C * inv
  const r21 = -(a * f - d * c) * inv
  const r22 = (a * e - d * b) * inv
  const tx = m[12]
  const ty = m[13]
  const tz = m[14]
  return [
    r00,
    r10,
    r20,
    0,
    r01,
    r11,
    r21,
    0,
    r02,
    r12,
    r22,
    0,
    -(r00 * tx + r01 * ty + r02 * tz),
    -(r10 * tx + r11 * ty + r12 * tz),
    -(r20 * tx + r21 * ty + r22 * tz),
    1,
  ]
}
