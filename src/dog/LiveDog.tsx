import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MathUtils, Vector3, type Group, type SkinnedMesh } from 'three'
import { Dog } from '../components/Dog'
import { haptic } from '../game/haptics'
import { moodFrom } from '../game/meters'
import { activeActivity, currentMeters, useDog } from '../game/store'
import { useNow } from '../game/useNow'
import type { Appearance } from './appearance'
import { behaviourFor, lookFromAppearance, petZoneFor } from './dogLook'

/** Finger travel (world units) that counts as one stroke. */
const STROKE_DISTANCE = 0.4
/** Keep the petting reaction this long after the last stroke. */
const PET_LINGER_MS = 1500

/** Bone that owns the touched surface (null for the eyes and nose, which belong to the head). */
function boneAt(e: ThreeEvent<PointerEvent>): string | null {
  const mesh = e.object as SkinnedMesh
  if (!mesh.isSkinnedMesh || !e.face) return null
  const idx = mesh.geometry.getAttribute('skinIndex')
  const wts = mesh.geometry.getAttribute('skinWeight')
  let best = 0
  let bone = 0
  for (let k = 0; k < 4; k++) {
    const w = wts.getComponent(e.face.a, k)
    if (w > best) {
      best = w
      bone = idx.getComponent(e.face.a, k)
    }
  }
  return mesh.skeleton.bones[bone]?.name ?? null
}

/** The 3D dog as it lives in the app: game state in, petting out. */
export function LiveDog({ look }: { look: Appearance }) {
  const { scale, ...dogLook } = useMemo(() => lookFromAppearance(look), [look])
  const activity = useDog((s) => s.activity)
  const meters = useDog((s) => s.meters)
  const character = useDog((s) => s.character)
  const now = useNow(250)
  let act = activeActivity(activity, now)
  // a pet lasts < 1 s per stroke: linger a little so the dog does not pop up and down
  if (
    act.kind === 'idle' &&
    activity.kind === 'pet' &&
    now < activity.until + PET_LINGER_MS
  )
    act = activity
  const behaviour = behaviourFor(act, moodFrom(currentMeters(meters, now, character)))

  // offended: turn the back towards the owner
  const turn = useRef<Group>(null)
  useFrame((_, dt) => {
    if (!turn.current) return
    turn.current.rotation.y = MathUtils.damp(
      turn.current.rotation.y,
      behaviour.turnAway ? 2.4 : 0,
      5,
      dt,
    )
  })

  // petting: stroke over the dog
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
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    stroke.current = { down: true, last: e.point.clone(), dist: 0 }
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const s = stroke.current
    if (!s.down) return
    e.stopPropagation()
    if (s.last) s.dist += e.point.distanceTo(s.last)
    s.last = e.point.clone()
    if (s.dist < STROKE_DISTANCE) return
    s.dist = 0
    const normalY = e.face
      ? e.face.normal.clone().transformDirection(e.object.matrixWorld).y
      : 0
    useDog.getState().pet(petZoneFor(boneAt(e), normalY))
    haptic()
  }

  return (
    <group
      ref={turn}
      scale={scale}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <Dog
        {...dogLook}
        animation={behaviour.animation}
        face={behaviour.face}
        fade={0.3}
      />
      {behaviour.bowl && (
        <group position={[0, 0, 0.56]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.16, 0.12, 0.1, 32, 1, true]} />
            <meshToonMaterial color="#d95f5f" side={2} />
          </mesh>
          <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.15, 32]} />
            <meshToonMaterial color="#8a5a35" />
          </mesh>
        </group>
      )}
    </group>
  )
}
