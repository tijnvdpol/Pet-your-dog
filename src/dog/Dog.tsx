import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { haptic } from '../game/haptics'
import { moodFrom } from '../game/meters'
import { activeActivity, currentMeters, useDog, type PetZone } from '../game/store'
import type { Appearance } from './appearance'

const DARK = '#2a1d16'
const WHITE = '#fffaf0'
/** Distance (world units) of finger movement that counts as one stroke. */
const STROKE_DISTANCE = 0.5
const damp = MathUtils.damp
/** Decorations must never swallow pointer events meant for the body or head. */
const noRaycast = () => null

/** Orients a flat decal so it lies on the surface at `normal`. */
function faceNormal(normal: Vector3): [number, number, number, number] {
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    normal.clone().normalize(),
  )
  return [q.x, q.y, q.z, q.w]
}

/** Parametric stylized dog. Behaviours: idle, pet, eat, sleep, sulk. */
export function Dog({ look }: { look: Appearance }) {
  const root = useRef<Group>(null)
  const upper = useRef<Group>(null)
  const head = useRef<Group>(null)
  const tailWag = useRef<Group>(null)
  const earL = useRef<Group>(null)
  const earR = useRef<Group>(null)
  const eyeL = useRef<Mesh>(null)
  const eyeR = useRef<Mesh>(null)
  const legFL = useRef<Group>(null)
  const legFR = useRef<Group>(null)
  const legBL = useRef<Group>(null)
  const legBR = useRef<Group>(null)
  const bowl = useRef<Group>(null)

  const pose = useRef({ lie: 0, headX: 0, wag: 0, earDrop: 0, eyes: 1, kick: 0, sad: 0 })
  const stroke = useRef({ down: false, last: null as Vector3 | null, dist: 0 })

  // ---- derived dimensions ----
  const H = look.legLength
  const w = 0.85 + 0.3 * look.build // body width factor
  const L = look.bodyLength
  const legR = 0.075 + 0.04 * look.build
  const bodyY = H + 0.08
  const bodyR = [0.55 * w, 0.5 * w, 0.85 * L] as const
  const snoutScaleZ = 0.8 + 0.7 * look.snoutLength
  const snoutZ = 0.38 + 0.25 * look.snoutLength
  const noseZ = snoutZ + 0.2 * snoutScaleZ
  const dir = look.earType === 'upright' ? 1 : -1
  const earBase = look.earType === 'upright' ? 0.2 : 0.15
  const earBaseX = look.earType === 'half' ? 0.45 : 0

  const colors = useMemo(() => {
    const fur = new Color(look.furColor)
    return {
      fur: look.furColor,
      second: look.secondColor,
      belly: `#${fur.clone().lerp(new Color(WHITE), 0.6).getHexString()}`,
    }
  }, [look.furColor, look.secondColor])

  const spots = useMemo(() => {
    // Directions in unit-sphere space; mostly on the visible right flank and rump.
    const dirs = [
      [0.95, 0.25, -0.1],
      [0.9, 0.5, -0.55],
      [0.8, -0.15, -0.5],
      [0.85, 0.35, 0.45],
      [0.3, 0.95, -0.25],
      [-0.9, 0.3, 0.1],
      [-0.3, 0.9, 0.45],
    ]
    return dirs.map(([x, y, z]) => {
      const n = new Vector3(x / bodyR[0], y / bodyR[1], z / bodyR[2]).normalize()
      const p = new Vector3(
        n.x * bodyR[0],
        n.y * bodyR[1],
        n.z * bodyR[2],
      ).multiplyScalar(1.0)
      return { p, q: faceNormal(n) }
    })
  }, [bodyR[0], bodyR[1], bodyR[2]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const up = () => {
      stroke.current.down = false
      stroke.current.last = null
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const zoneHandlers = (zoneOf: (e: ThreeEvent<PointerEvent>) => PetZone) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      stroke.current = { down: true, last: e.point.clone(), dist: 0 }
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const s = stroke.current
      if (!s.down) return
      e.stopPropagation()
      if (s.last) s.dist += e.point.distanceTo(s.last)
      s.last = e.point.clone()
      if (s.dist >= STROKE_DISTANCE) {
        s.dist = 0
        useDog.getState().pet(zoneOf(e))
        haptic()
      }
    },
  })

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const now = Date.now()
    const state = useDog.getState()
    const act = activeActivity(state.activity, now)
    const mood = moodFrom(currentMeters(state.meters, now))
    const p = pose.current

    const sleeping = act.kind === 'sleep'
    const eating = act.kind === 'eat'
    const petting = act.kind === 'pet'
    const sulking = mood === 'sulking' && !sleeping && !eating && !petting

    p.lie = damp(p.lie, sleeping ? 1 : sulking ? 0.55 : 0, 4, dt)
    p.sad = damp(p.sad, sulking ? 1 : 0, 3, dt)
    p.eyes = damp(p.eyes, sleeping ? 0.08 : 1, 8, dt)
    p.earDrop = damp(p.earDrop, sulking || sleeping ? 0.5 : 0, 4, dt)

    const wagTarget = petting
      ? act.zone === 'belly'
        ? 14
        : 10
      : sulking || sleeping
        ? 0
        : mood === 'happy'
          ? 5
          : 2.5
    p.wag = damp(p.wag, wagTarget, 5, dt)
    p.kick = damp(p.kick, petting && act.zone === 'head' ? 1 : 0, 10, dt)

    const headTarget = eating
      ? 0.6 + Math.sin(t * 9) * 0.08
      : sleeping
        ? 0.55
        : sulking
          ? 0.4
          : 0
    p.headX = damp(p.headX, headTarget, 8, dt)

    if (root.current) {
      const breathe = 1 + Math.sin(t * (sleeping ? 1.4 : 2.2)) * 0.012
      root.current.scale.set(look.size, look.size * breathe, look.size)
    }
    const drop = 0.4 * H * p.lie
    if (upper.current) upper.current.position.y = -drop
    if (head.current) {
      head.current.rotation.x = p.headX
      head.current.rotation.z = petting ? Math.sin(t * 6) * 0.06 : 0
    }
    if (tailWag.current) {
      tailWag.current.rotation.y = Math.sin(t * 14) * 0.5 * Math.min(1, p.wag / 6)
      tailWag.current.rotation.x = -0.15 * p.sad + 0.5 * p.lie
    }
    const earZ = dir * (earBase + p.earDrop * 0.7)
    if (earL.current) earL.current.rotation.z = earZ
    if (earR.current) earR.current.rotation.z = -earZ
    if (eyeL.current) eyeL.current.scale.y = p.eyes
    if (eyeR.current) eyeR.current.scale.y = p.eyes

    // Legs pivot at the top; folding them keeps the paws on the floor.
    for (const leg of [legFL, legFR, legBL, legBR]) {
      if (leg.current) {
        leg.current.position.y = H - drop
        leg.current.scale.y = 1 - drop / H
      }
    }
    if (legBR.current) legBR.current.rotation.x = Math.sin(t * 28) * 0.7 * p.kick
    if (bowl.current) bowl.current.visible = eating
  })

  const body = zoneHandlers((e) => (e.point.y < H * look.size * 0.85 ? 'belly' : 'back'))
  const headZone = zoneHandlers(() => 'head')
  const showSocks = look.marking === 'socks'

  const legSpots = [
    [legFL, -0.2 * w, 0.45 * L],
    [legFR, 0.2 * w, 0.45 * L],
    [legBL, -0.22 * w, -0.5 * L],
    [legBR, 0.22 * w, -0.5 * L],
  ] as const

  const ear = (side: -1 | 1) => (
    <group
      ref={side < 0 ? earL : earR}
      position={[
        side * (look.earType === 'upright' ? 0.2 : 0.3),
        look.earType === 'upright' ? 0.5 : 0.42,
        0.12,
      ]}
      rotation={[earBaseX, 0, side * -dir * earBase]}
    >
      {look.earType === 'upright' ? (
        <mesh position={[0, 0.16, 0]}>
          <coneGeometry args={[0.15, 0.4, 14]} />
          <meshToonMaterial color={colors.second} />
        </mesh>
      ) : (
        <mesh
          position={[0, look.earType === 'half' ? -0.12 : -0.18, 0]}
          scale={[0.12, look.earType === 'half' ? 0.2 : 0.27, 0.18]}
        >
          <sphereGeometry args={[1, 14, 12]} />
          <meshToonMaterial color={colors.second} />
        </mesh>
      )}
    </group>
  )

  return (
    <group ref={root}>
      <group ref={upper}>
        {/* Body, chest and belly */}
        <mesh position={[0, bodyY, 0]} scale={[...bodyR]} {...body}>
          <sphereGeometry args={[1, 28, 20]} />
          <meshToonMaterial color={colors.fur} />
        </mesh>
        <mesh
          position={[0, bodyY - 0.24 * w, 0.05]}
          scale={[0.4 * w, 0.3, 0.65 * L]}
          raycast={noRaycast}
        >
          <sphereGeometry args={[1, 16, 12]} />
          <meshToonMaterial color={colors.belly} />
        </mesh>
        {/* Chest bib */}
        <mesh
          position={[0, bodyY - 0.1, 0.55 * L]}
          scale={[0.28 * w, 0.3, 0.22]}
          raycast={noRaycast}
        >
          <sphereGeometry args={[1, 14, 12]} />
          <meshToonMaterial color={colors.belly} />
        </mesh>

        {look.marking === 'spots' &&
          spots.map((s, i) => (
            <mesh
              key={i}
              position={[s.p.x, bodyY + s.p.y, s.p.z]}
              quaternion={s.q}
              scale={[0.14 + (i % 3) * 0.03, 0.14 + (i % 2) * 0.03, 0.06]}
              raycast={noRaycast}
            >
              <sphereGeometry args={[1, 12, 10]} />
              <meshToonMaterial color={colors.second} />
            </mesh>
          ))}

        {/* Tail */}
        <group position={[0, bodyY + 0.12, -0.8 * L]}>
          <group ref={tailWag}>
            <group rotation={[-0.9, 0, 0]}>
              <mesh position={[0, 0.3 * look.tailLength, 0]}>
                <capsuleGeometry args={[0.07, 0.45 * look.tailLength, 4, 10]} />
                <meshToonMaterial color={colors.second} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Head (pivot at the neck) */}
        <group ref={head} position={[0, bodyY + 0.2, 0.55 * L]} {...headZone}>
          <mesh position={[0, 0.15, 0.2]} scale={[1.05, 0.98, 0.98]}>
            <sphereGeometry args={[0.4, 28, 20]} />
            <meshToonMaterial color={colors.fur} />
          </mesh>
          {/* Snout */}
          <mesh position={[0, 0.03, snoutZ]} scale={[1, 0.8, snoutScaleZ]}>
            <sphereGeometry args={[0.2, 18, 14]} />
            <meshToonMaterial
              color={look.marking === 'mask' ? colors.second : colors.belly}
            />
          </mesh>
          <mesh position={[0, 0.1, noseZ]}>
            <sphereGeometry args={[0.07, 14, 10]} />
            <meshToonMaterial color={look.marking === 'mask' ? '#6b4a3a' : DARK} />
          </mesh>
          {look.marking === 'blaze' && (
            <mesh
              position={[0, 0.3, 0.46]}
              rotation={[0.9, 0, 0]}
              scale={[0.07, 0.2, 0.03]}
              raycast={noRaycast}
            >
              <sphereGeometry args={[1, 12, 10]} />
              <meshToonMaterial color={WHITE} />
            </mesh>
          )}
          {/* Eyes with highlight */}
          {([-1, 1] as const).map((side) => (
            <mesh
              key={side}
              ref={side < 0 ? eyeL : eyeR}
              position={[side * 0.17, 0.26, 0.5]}
              raycast={noRaycast}
            >
              <sphereGeometry args={[0.085, 14, 10]} />
              <meshToonMaterial color={DARK} />
              <mesh position={[0.025, 0.035, 0.07]}>
                <sphereGeometry args={[0.025, 8, 6]} />
                <meshBasicMaterial color="white" />
              </mesh>
            </mesh>
          ))}
          {ear(-1)}
          {ear(1)}
        </group>
      </group>

      {/* Legs (pivot at the top so they can fold when lying down) */}
      {legSpots.map(([ref, x, z], i) => (
        <group key={i} ref={ref} position={[x, H, z]}>
          <mesh position={[0, -H / 2, 0]}>
            <capsuleGeometry args={[legR, H - 2 * legR, 4, 12]} />
            <meshToonMaterial color={colors.fur} />
          </mesh>
          {showSocks && (
            <mesh
              position={[0, -H + legR + 0.03, 0]}
              scale={[1.12, 1, 1.12]}
              raycast={noRaycast}
            >
              <sphereGeometry args={[legR * 1.1, 12, 10]} />
              <meshToonMaterial color={WHITE} />
            </mesh>
          )}
        </group>
      ))}

      {/* Food bowl, only visible while eating */}
      <group ref={bowl} position={[0, 0, 1.55 * L]} visible={false}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.28, 0.2, 0.16, 20]} />
          <meshToonMaterial color="#d95f5f" />
        </mesh>
      </group>
    </group>
  )
}
