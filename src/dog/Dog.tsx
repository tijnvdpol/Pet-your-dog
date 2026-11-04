import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { haptic } from '../game/haptics'
import { moodFrom } from '../game/meters'
import { activeActivity, currentMeters, useDog, type PetZone } from '../game/store'
import type { Appearance } from './appearance'
import { GradSphere } from './GradSphere'

const DARK = '#24170f'
const IRIS = '#4a2c18'
const MOUTH = '#6a2430'
const TONGUE = '#f2828f'
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
  const mouth = useRef<Mesh>(null)
  const tongue = useRef<Mesh>(null)

  const pose = useRef({
    turn: 0,
    hop: 0,
    lie: 0,
    headX: 0,
    wag: 0,
    earDrop: 0,
    eyes: 1,
    kick: 0,
    sad: 0,
    mouth: 0,
    tongue: 0,
  })
  const stroke = useRef({ down: false, last: null as Vector3 | null, dist: 0 })

  // ---- derived dimensions ----
  const H = look.legLength
  const w = 0.85 + 0.3 * look.build // body width factor
  const L = look.bodyLength
  const legR = 0.07 + 0.035 * look.build
  const bodyY = H + 0.08
  const bodyR = [0.55 * w, 0.5 * w, 0.85 * L] as const
  const snoutScaleZ = 0.8 + 0.7 * look.snoutLength
  const snoutZ = 0.46 + 0.2 * look.snoutLength
  const noseZ = snoutZ + 0.19 * snoutScaleZ
  const dir = look.earType === 'upright' ? 1 : -1
  const earBase = look.earType === 'upright' ? 0.2 : 0.15
  const earBaseX = look.earType === 'half' ? 0.45 : 0

  const colors = useMemo(() => {
    const fur = new Color(look.furColor)
    return {
      fur: look.furColor,
      second: look.secondColor,
      belly: `#${fur.clone().lerp(new Color(WHITE), 0.6).getHexString()}`,
      chin: `#${fur.clone().lerp(new Color(WHITE), 0.3).getHexString()}`,
      toe: `#${fur.clone().multiplyScalar(0.8).getHexString()}`,
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
    const mood = moodFrom(currentMeters(state.meters, now, state.character))
    const p = pose.current

    const sleeping = act.kind === 'sleep'
    const eating = act.kind === 'eat'
    const petting = act.kind === 'pet'
    const offended = act.kind === 'sulk'
    const joy = act.kind === 'joy'
    const sulking = (mood === 'sulking' || offended) && !sleeping && !eating && !petting

    p.lie = damp(p.lie, sleeping ? 1 : sulking ? 0.55 : 0, 4, dt)
    p.sad = damp(p.sad, sulking ? 1 : 0, 3, dt)
    const blink = t % 3.7 < 0.12 ? 0.1 : 1
    p.eyes = damp(p.eyes, sleeping ? 0.08 : blink, 25, dt)
    const mouthTarget =
      petting || joy
        ? 1
        : eating
          ? 0.5 + 0.5 * Math.abs(Math.sin(t * 9))
          : sleeping || sulking
            ? 0
            : mood === 'happy'
              ? 0.55 + 0.15 * Math.sin(t * 8)
              : 0.12
    p.mouth = damp(p.mouth, mouthTarget, 10, dt)
    p.tongue = damp(
      p.tongue,
      petting || joy || (mood === 'happy' && !sleeping && !eating && !offended)
        ? 1
        : mood === 'neutral' && !sleeping && !eating
          ? 0.25
          : 0,
      6,
      dt,
    )
    p.earDrop = damp(p.earDrop, sulking || sleeping ? 0.5 : 0, 4, dt)

    const wagTarget = joy
      ? 14
      : petting
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

    // Offended: turns his back on you. Overjoyed: hops around.
    p.turn = damp(p.turn, offended ? 2.5 : 0, 5, dt)
    p.hop = damp(p.hop, joy ? Math.abs(Math.sin(t * 9)) * 0.28 : 0, 18, dt)
    if (root.current) {
      root.current.rotation.y = p.turn
      root.current.position.y = p.hop
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
    if (mouth.current) mouth.current.scale.y = 0.005 + 0.07 * p.mouth
    if (tongue.current) {
      tongue.current.scale.y = 0.01 + 0.1 * p.tongue
      tongue.current.position.y = -0.1 - 0.05 * p.tongue
    }
  })

  const body = zoneHandlers((e) => (e.point.y < H * look.size * 0.85 ? 'belly' : 'back'))
  const headZone = zoneHandlers(() => 'head')
  const socks = look.marking === 'socks'
  const darkMuzzle = look.marking === 'mask' || look.marking === 'saddle'
  const pawColor = socks ? WHITE : colors.fur

  const legSpots = [
    [legFL, -0.2 * w, 0.45 * L],
    [legFR, 0.2 * w, 0.45 * L],
    [legBL, -0.22 * w, -0.5 * L],
    [legBR, 0.22 * w, -0.5 * L],
  ] as const

  const std = (color: string) => <meshStandardMaterial color={color} roughness={0.85} />

  const ear = (side: -1 | 1) => (
    <group
      ref={side < 0 ? earL : earR}
      position={[
        side * (look.earType === 'upright' ? 0.22 : 0.34),
        look.earType === 'upright' ? 0.55 : 0.46,
        0.14,
      ]}
      rotation={[earBaseX, 0, side * -dir * earBase]}
    >
      {look.earType === 'upright' ? (
        <mesh position={[0, 0.17, 0]} scale={[1, 1, 0.55]}>
          <coneGeometry args={[0.16, 0.42, 16]} />
          {std(colors.second)}
        </mesh>
      ) : (
        <mesh
          position={[0, look.earType === 'half' ? -0.12 : -0.2, 0]}
          scale={[0.12, look.earType === 'half' ? 0.2 : 0.29, 0.19]}
        >
          <sphereGeometry args={[1, 16, 14]} />
          {std(colors.second)}
        </mesh>
      )}
    </group>
  )

  return (
    <group ref={root}>
      <group ref={upper}>
        {/* Body: fur on top fading to a lighter belly */}
        <GradSphere
          position={[0, bodyY, 0]}
          scale={[...bodyR]}
          top={colors.fur}
          bottom={colors.belly}
          mid={-0.25}
          {...body}
        />
        {/* Neck and chest bib connect head and body smoothly */}
        <GradSphere
          position={[0, bodyY + 0.1, 0.5 * L]}
          scale={[0.34 * w, 0.4, 0.34]}
          top={colors.fur}
          bottom={colors.belly}
          mid={-0.5}
          raycast={noRaycast}
        />
        <mesh
          position={[0, bodyY - 0.08, 0.6 * L]}
          scale={[0.26 * w, 0.3, 0.2]}
          raycast={noRaycast}
        >
          <sphereGeometry args={[1, 16, 14]} />
          {std(colors.belly)}
        </mesh>

        {look.marking === 'saddle' && (
          <mesh
            position={[0, bodyY + 0.004, -0.02]}
            scale={[bodyR[0] * 1.02, bodyR[1] * 1.02, bodyR[2] * 1.02]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[1, 28, 12, 0, Math.PI * 2, 0, 1.0]} />
            {std(colors.second)}
          </mesh>
        )}
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
              {std(colors.second)}
            </mesh>
          ))}

        {/* Tail */}
        <group position={[0, bodyY + 0.12, -0.8 * L]}>
          <group ref={tailWag}>
            <group rotation={[-0.9, 0, 0]}>
              <mesh position={[0, 0.3 * look.tailLength, 0]}>
                <capsuleGeometry args={[0.07, 0.45 * look.tailLength, 6, 12]} />
                {std(colors.second)}
              </mesh>
            </group>
          </group>
        </group>

        {/* Head (pivot at the neck): big and round for the cute look */}
        <group ref={head} position={[0, bodyY + 0.2, 0.55 * L]} {...headZone}>
          <GradSphere
            position={[0, 0.17, 0.2]}
            scale={[1.04, 0.98, 0.98]}
            radius={0.46}
            top={colors.fur}
            bottom={colors.chin}
            mid={-0.3}
          />
          {/* Snout */}
          <mesh position={[0, 0.06, snoutZ]} scale={[1, 0.8, snoutScaleZ]}>
            <sphereGeometry args={[0.2, 20, 16]} />
            {std(darkMuzzle ? colors.second : colors.chin)}
          </mesh>
          {/* Open mouth + tongue */}
          <mesh
            ref={mouth}
            position={[0, -0.08, snoutZ + 0.05]}
            scale={[0.12, 0.005, 0.2 * snoutScaleZ]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={MOUTH} roughness={0.6} />
          </mesh>
          <mesh
            ref={tongue}
            position={[0, -0.1, snoutZ + 0.1 * snoutScaleZ + 0.03]}
            scale={[0.075, 0.01, 0.11]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={TONGUE} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.14, noseZ]} scale={[1.15, 0.85, 1]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial
              color={darkMuzzle ? '#6b4a3a' : DARK}
              roughness={0.35}
            />
          </mesh>
          {look.marking === 'blaze' && (
            <mesh
              position={[0, 0.36, 0.52]}
              rotation={[0.9, 0, 0]}
              scale={[0.07, 0.2, 0.03]}
              raycast={noRaycast}
            >
              <sphereGeometry args={[1, 12, 10]} />
              {std(WHITE)}
            </mesh>
          )}
          {/* Big glossy eyes with iris and two highlights */}
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * 0.19, 0.3, 0.56]} raycast={noRaycast}>
              <mesh ref={side < 0 ? eyeL : eyeR} raycast={noRaycast}>
                <sphereGeometry args={[0.1, 18, 14]} />
                <meshStandardMaterial color={DARK} roughness={0.2} />
                <mesh position={[0, 0, 0.012]} scale={[0.82, 0.82, 0.9]}>
                  <sphereGeometry args={[0.1, 14, 10]} />
                  <meshStandardMaterial color={IRIS} roughness={0.25} />
                </mesh>
                <mesh position={[0.035, 0.04, 0.085]}>
                  <sphereGeometry args={[0.03, 8, 6]} />
                  <meshBasicMaterial color="white" />
                </mesh>
                <mesh position={[-0.03, -0.035, 0.092]}>
                  <sphereGeometry args={[0.014, 8, 6]} />
                  <meshBasicMaterial color="white" />
                </mesh>
              </mesh>
            </group>
          ))}
          {ear(-1)}
          {ear(1)}
        </group>
      </group>

      {/* Legs: tapered, with paws and toes; pivot at the top so they fold when lying down */}
      {legSpots.map(([ref, x, z], i) => (
        <group key={i} ref={ref} position={[x, H, z]}>
          <mesh position={[0, -(H - 0.05) / 2, 0]}>
            <cylinderGeometry args={[legR * 1.1, legR * 0.8, H - 0.05, 14]} />
            {std(colors.fur)}
          </mesh>
          <mesh position={[0, -H + legR * 0.75, legR * 0.35]} scale={[1, 0.6, 1.45]}>
            <sphereGeometry args={[legR * 1.25, 14, 10]} />
            {std(pawColor)}
          </mesh>
          {[-0.45, 0, 0.45].map((tx) => (
            <mesh
              key={tx}
              position={[
                tx * legR * 1.4,
                -H + legR * 0.4,
                legR * 1.65 - Math.abs(tx) * legR * 0.4,
              ]}
            >
              <sphereGeometry args={[legR * 0.3, 8, 6]} />
              {std(socks ? '#e6dccb' : colors.toe)}
            </mesh>
          ))}
        </group>
      ))}

      {/* Food bowl, only visible while eating */}
      <group ref={bowl} position={[0, 0, 1.55 * L]} visible={false}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.28, 0.2, 0.16, 20]} />
          {std('#d95f5f')}
        </mesh>
      </group>
    </group>
  )
}
