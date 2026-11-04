import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Color, MathUtils, type BufferGeometry, type Group, type Mesh } from 'three'
import { haptic } from '../game/haptics'
import { moodFrom } from '../game/meters'
import { activeActivity, currentMeters, useDog, type PetZone } from '../game/store'
import type { Appearance } from './appearance'
import { buildDogParts, dogLayout, type DogParts } from './dogParts'
import { earGeometry } from './ears'

const DARK = '#24170f'
const NOSE = '#5e3b2a'
const MOUTH = '#6a2430'
const TONGUE = '#f2828f'
/** Distance (world units) of finger movement that counts as one stroke. */
const STROKE_DISTANCE = 0.5
const damp = MathUtils.damp
/** Decorations must never swallow pointer events meant for the body or head. */
const noRaycast = () => null

/** Waits for the value to stop changing, so dragging a slider does not rebuild the mesh every tick. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}

const disposeParts = (p: DogParts) => {
  for (const g of [p.body, p.head, p.tail, p.front, p.hind]) g.dispose()
}

/** Low-poly stylized dog. Behaviours: idle, pet, eat, sleep, sulk, offended, joy. */
export function Dog({ look: liveLook }: { look: Appearance }) {
  const look = useSettled(liveLook, 140)
  const lay = useMemo(() => dogLayout(look), [look])
  const { H, L } = lay
  const sl = look.snoutLength
  const dir = look.earType === 'upright' ? 1 : -1
  const earBase = look.earType === 'upright' ? 0.2 : 0.3
  const earBaseX = look.earType === 'half' ? 0.45 : 0
  const earGeo = useMemo(() => earGeometry(look.earType), [look.earType])
  useEffect(() => () => earGeo.dispose(), [earGeo])

  // The mesh is built asynchronously (the simplifier loads a small WASM module).
  const [parts, setParts] = useState<DogParts | null>(null)
  const current = useRef<DogParts | null>(null)
  const token = useRef(0)
  useEffect(() => {
    const mine = ++token.current
    void buildDogParts(look).then((built) => {
      if (mine !== token.current) return disposeParts(built) // a newer look was requested meanwhile
      const old = current.current
      current.current = built
      setParts(built)
      if (old) disposeParts(old)
    })
  }, [look])

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
  const stroke = useRef({
    down: false,
    last: null as import('three').Vector3 | null,
    dist: 0,
  })

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
      tongue.current.position.y = -0.025 - 0.05 * p.tongue
    }
  })

  if (!parts) return null

  const body = zoneHandlers((e) => (e.point.y < (H + 0.1) * look.size ? 'belly' : 'back'))
  const headZone = zoneHandlers(() => 'head')

  // Facial features, in head-local coordinates (origin = neck pivot).
  const skullZ = 0.3 * L
  const eyeZ = skullZ + 0.27
  const tipZ = 0.38 * L + 0.1 + 0.18 * sl // front of the muzzle
  const mat = <meshStandardMaterial vertexColors flatShading roughness={0.9} />
  const std = (color: string) => (
    <meshStandardMaterial color={color} flatShading roughness={0.9} />
  )
  const toeColor =
    look.marking === 'socks'
      ? '#fffaf0'
      : `#${new Color(look.furColor).lerp(new Color('#fffaf0'), 0.62).getHexString()}`

  const ear = (side: -1 | 1) => (
    <group
      ref={side < 0 ? earL : earR}
      position={[
        side * (look.earType === 'upright' ? 0.2 : 0.31),
        look.earType === 'upright' ? 0.58 : 0.52,
        skullZ - 0.02,
      ]}
      rotation={[earBaseX, 0, side * -dir * earBase]}
    >
      <mesh geometry={earGeo}>{std(look.secondColor)}</mesh>
    </group>
  )

  const leg = (
    ref: typeof legFR,
    geo: BufferGeometry,
    pivot: readonly [number, number, number],
    paw: readonly [number, number, number],
    mirror: boolean,
  ) => (
    <group
      ref={ref}
      position={[mirror ? -pivot[0] : pivot[0], pivot[1], pivot[2]]}
      scale={[mirror ? -1 : 1, 1, 1]}
    >
      <mesh geometry={geo}>{mat}</mesh>
      {/* Three little toes on each paw */}
      {[-0.05, 0, 0.05].map((dx) => (
        <mesh
          key={dx}
          position={[paw[0] + dx, paw[1] - 0.005, paw[2] + 0.135 - Math.abs(dx) * 0.5]}
          scale={[1, 0.8, 1.35]}
        >
          <icosahedronGeometry args={[0.032, 0]} />
          {std(toeColor)}
        </mesh>
      ))}
    </group>
  )

  return (
    <group ref={root}>
      <group ref={upper}>
        <mesh geometry={parts.body} {...body}>
          {mat}
        </mesh>

        {/* Tail (pivot at its base) */}
        <group position={lay.tailPivot}>
          <group ref={tailWag}>
            <mesh geometry={parts.tail} raycast={noRaycast}>
              {mat}
            </mesh>
          </group>
        </group>

        {/* Head (pivot at the neck) */}
        <group ref={head} position={lay.headPivot} {...headZone}>
          <mesh geometry={parts.head}>{mat}</mesh>
          {/* Mouth (a thin line when closed) + tongue */}
          <mesh
            ref={mouth}
            position={[0, -0.01, tipZ - 0.13]}
            scale={[0.11, 0.005, 0.1 + 0.1 * sl]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={MOUTH} roughness={0.6} />
          </mesh>
          <mesh
            ref={tongue}
            position={[0, -0.025, tipZ - 0.1]}
            scale={[0.065, 0.01, 0.09]}
            raycast={noRaycast}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={TONGUE} roughness={0.5} />
          </mesh>
          {/* Big nose */}
          <mesh
            position={[0, 0.15, tipZ + 0.05]}
            scale={[1.25, 0.85, 1]}
            raycast={noRaycast}
          >
            <icosahedronGeometry args={[0.09, 1]} />
            {std(NOSE)}
          </mesh>
          {/* Small dark eyes with a tiny highlight */}
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * 0.2, 0.36, eyeZ]} raycast={noRaycast}>
              <mesh ref={side < 0 ? eyeL : eyeR} raycast={noRaycast}>
                <icosahedronGeometry args={[0.06, 1]} />
                <meshStandardMaterial color={DARK} flatShading roughness={0.25} />
                <mesh position={[0.02, 0.025, 0.05]}>
                  <icosahedronGeometry args={[0.014, 0]} />
                  <meshBasicMaterial color="white" />
                </mesh>
              </mesh>
            </group>
          ))}
          {ear(-1)}
          {ear(1)}
        </group>
      </group>

      {/* Legs: right ones are built once, left ones are mirrored. Pivot at the top so they can fold. */}
      {leg(legFR, parts.front, lay.frontLegPivot, lay.frontPaw, false)}
      {leg(legFL, parts.front, lay.frontLegPivot, lay.frontPaw, true)}
      {leg(legBR, parts.hind, lay.hindLegPivot, lay.hindPaw, false)}
      {leg(legBL, parts.hind, lay.hindLegPivot, lay.hindPaw, true)}

      {/* Food bowl, only visible while eating */}
      <group ref={bowl} position={[0, 0, 1.3 * L + 0.15 * sl]} visible={false}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.28, 0.2, 0.16, 12]} />
          {std('#d95f5f')}
        </mesh>
      </group>
    </group>
  )
}
