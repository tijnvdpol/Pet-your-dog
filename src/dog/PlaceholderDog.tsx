import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, type Group, type Mesh, type Vector3 } from 'three'
import { haptic } from '../game/haptics'
import { activeActivity, useDog, type PetZone } from '../game/store'
import { moodFrom } from '../game/meters'
import { currentMeters } from '../game/store'

const FUR = '#e0a458'
const FUR_DARK = '#c98a3c'
const BELLY = '#f6dcae'
const DARK = '#2a1d16'

/** Distance (world units) of finger movement that counts as one stroke. */
const STROKE_DISTANCE = 0.5

const damp = MathUtils.damp

/**
 * Stand-in dog built from primitives. Exposes the same behaviours (idle, pet, eat, sleep,
 * sulk) a rigged GLB will need, so it can be swapped for a real model later.
 */
export function PlaceholderDog() {
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

  // Smoothed pose values
  const pose = useRef({ lie: 0, headX: 0, wag: 0, earDrop: 0, eyes: 1, kick: 0, sad: 0 })
  const stroke = useRef({ down: false, last: null as Vector3 | null, dist: 0 })

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
      // Gentle breathing
      const breathe = 1 + Math.sin(t * (sleeping ? 1.4 : 2.2)) * 0.012
      root.current.scale.set(1, breathe, 1)
    }
    if (upper.current) upper.current.position.y = -0.28 * p.lie
    if (head.current) {
      head.current.rotation.x = p.headX
      head.current.rotation.z = petting ? Math.sin(t * 6) * 0.06 : 0
    }
    if (tailWag.current)
      tailWag.current.rotation.y = Math.sin(t * 14) * 0.5 * Math.min(1, p.wag / 6)
    if (tailWag.current) tailWag.current.rotation.x = -0.15 * p.sad + 0.5 * p.lie
    if (earL.current) earL.current.rotation.z = 0.15 + p.earDrop * 0.7
    if (earR.current) earR.current.rotation.z = -0.15 - p.earDrop * 0.7
    if (eyeL.current) eyeL.current.scale.y = p.eyes
    if (eyeR.current) eyeR.current.scale.y = p.eyes

    const legY = 0.7 - 0.28 * p.lie
    const legScale = 1 - 0.4 * p.lie
    for (const leg of [legFL, legFR, legBL, legBR]) {
      if (leg.current) {
        leg.current.position.y = legY
        leg.current.scale.y = legScale
      }
    }
    // Hind-leg scratch when petting behind the ears
    if (legBR.current) legBR.current.rotation.x = Math.sin(t * 28) * 0.7 * p.kick
    if (bowl.current) bowl.current.visible = eating
  })

  const body = zoneHandlers((e) => (e.point.y < 0.62 ? 'belly' : 'back'))
  const headZone = zoneHandlers(() => 'head')

  return (
    <group ref={root}>
      <group ref={upper}>
        {/* Body */}
        <mesh position={[0, 0.78, 0]} scale={[0.55, 0.5, 0.85]} {...body}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshToonMaterial color={FUR} />
        </mesh>
        <mesh position={[0, 0.55, 0.05]} scale={[0.4, 0.3, 0.65]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshToonMaterial color={BELLY} />
        </mesh>

        {/* Tail */}
        <group position={[0, 0.95, -0.78]}>
          <group ref={tailWag}>
            <group rotation={[-0.9, 0, 0]}>
              <mesh position={[0, 0.3, 0]}>
                <capsuleGeometry args={[0.07, 0.45, 4, 10]} />
                <meshToonMaterial color={FUR_DARK} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Head (pivot at the neck) */}
        <group ref={head} position={[0, 1.0, 0.55]} {...headZone}>
          <mesh position={[0, 0.15, 0.2]} scale={[1, 0.95, 0.95]}>
            <sphereGeometry args={[0.4, 24, 16]} />
            <meshToonMaterial color={FUR} />
          </mesh>
          <mesh position={[0, 0.03, 0.55]} scale={[1, 0.8, 1.1]}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshToonMaterial color={BELLY} />
          </mesh>
          <mesh position={[0, 0.1, 0.76]}>
            <sphereGeometry args={[0.07, 12, 8]} />
            <meshToonMaterial color={DARK} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              ref={side < 0 ? eyeL : eyeR}
              position={[side * 0.16, 0.25, 0.5]}
            >
              <sphereGeometry args={[0.07, 12, 8]} />
              <meshToonMaterial color={DARK} />
            </mesh>
          ))}
          <group ref={earL} position={[-0.3, 0.45, 0.15]} rotation={[0, 0, 0.15]}>
            <mesh position={[0, -0.18, 0]} scale={[0.12, 0.26, 0.18]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshToonMaterial color={FUR_DARK} />
            </mesh>
          </group>
          <group ref={earR} position={[0.3, 0.45, 0.15]} rotation={[0, 0, -0.15]}>
            <mesh position={[0, -0.18, 0]} scale={[0.12, 0.26, 0.18]}>
              <sphereGeometry args={[1, 12, 10]} />
              <meshToonMaterial color={FUR_DARK} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Legs (pivot at the top so they can fold when lying down) */}
      {(
        [
          [legFL, -0.22, 0.45],
          [legFR, 0.22, 0.45],
          [legBL, -0.24, -0.5],
          [legBR, 0.24, -0.5],
        ] as const
      ).map(([ref, x, z], i) => (
        <group key={i} ref={ref} position={[x, 0.7, z]}>
          <mesh position={[0, -0.35, 0]}>
            <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            <meshToonMaterial color={FUR} />
          </mesh>
        </group>
      ))}

      {/* Food bowl, only visible while eating */}
      <group ref={bowl} position={[0, 0, 1.5]} visible={false}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.28, 0.2, 0.16, 20]} />
          <meshToonMaterial color="#d95f5f" />
        </mesh>
      </group>
    </group>
  )
}
