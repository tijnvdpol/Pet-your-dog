import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DataTexture,
  Euler,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  Quaternion,
  RedFormat,
  SkinnedMesh,
  Vector3,
  type Bone,
  type Mesh,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { buildClips, FACE, type ClipName } from './dogRig'

export const DOG_MODEL_URL = '/models/dog_large.glb'

export interface DogProps {
  /** Main coat colour (any CSS colour). */
  coatBase?: string
  /** Chest, muzzle and paws. */
  coatSecondary?: string
  earShape?: 'hanging' | 'half' | 'upright'
  /** -1 = short, 0 = default, 1 = long. */
  snoutLength?: number
  bodyType?: 'slim' | 'normal' | 'chunky'
  /** -1 = short, 0 = default, 1 = long. */
  tailLength?: number
  animation?: ClipName
  /** Extra mouth opening 0..1 on top of the clip. */
  mouthOpen?: number
  /** Pins the animation at this time (seconds) and disables secondary motion: for screenshots. */
  time?: number
  /** Ear/tail follow-through. */
  secondary?: boolean
  wireframe?: boolean
}

const CROSSFADE = 0.25
const INNER_EAR = '#d99a86'
const NOSE = '#4a2e29'
const TONGUE = '#ee7f8e'
const MOUTH = '#4a1f27'

/** 3-band gradient: soft toon shading. */
function toonGradient() {
  const tex = new DataTexture(new Uint8Array([140, 175, 210, 238, 255]), 5, 1, RedFormat)
  tex.minFilter = tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

/** MeshToonMaterial that colours vertex zones (COLOR_0 = secondary/nose/innerEar/tongue, uv.x = mouth) and adds a soft rim. */
function makeCoatMaterial() {
  const uniforms = {
    uBase: { value: new Color('#b97a4a') },
    uSecondary: { value: new Color('#f1e3c6') },
    uNose: { value: new Color(NOSE) },
    uInner: { value: new Color(INNER_EAR) },
    uTongue: { value: new Color(TONGUE) },
    uMouth: { value: new Color(MOUTH) },
    uRim: { value: new Color('#ffd9b0') },
  }
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vMouth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMouth = uv.x;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vMouth;
uniform vec3 uBase; uniform vec3 uSecondary; uniform vec3 uNose; uniform vec3 uInner; uniform vec3 uTongue; uniform vec3 uMouth; uniform vec3 uRim;`,
      )
      .replace(
        '#include <color_fragment>',
        `vec4 zone = vColor;
vec3 zc = mix(uBase, uSecondary, zone.r);
zc = mix(zc, uInner, zone.b);
zc = mix(zc, uNose, zone.g);
zc = mix(zc, uMouth, vMouth);
zc = mix(zc, uTongue, zone.a);
diffuseColor.rgb *= zc;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float rim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 2.6);
outgoingLight += uRim * rim * 0.22;
#include <opaque_fragment>`,
      )
  }
  return { material: m, uniforms }
}

const morph = (mesh: Mesh | undefined, name: string, value: number) => {
  const i = mesh?.morphTargetDictionary?.[name]
  if (mesh && i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = value
}

/** Damped spring that lags behind its anchor (ears, tail). */
/**
 * The mixer only writes a bone back when its clip value changed, so an additive tweak on top of a
 * constant track would pile up frame after frame. Remember the clip's value and re-apply on top of it.
 */
class Overlay {
  base = new Quaternion()
  written = new Quaternion()
  /** Call once per frame before tweaking `bone.quaternion`. */
  begin(bone: Object3D) {
    if (!bone.quaternion.equals(this.written)) this.base.copy(bone.quaternion)
    bone.quaternion.copy(this.base)
  }
  end(bone: Object3D) {
    this.written.copy(bone.quaternion)
  }
}

class Follow {
  x = [0, 0]
  v = [0, 0]
  prev = new Vector3()
  prevVel = new Vector3()
  primed = false
}

export function Dog(props: DogProps) {
  const {
    coatBase = '#b97a4a',
    coatSecondary = '#f1e3c6',
    earShape = 'hanging',
    snoutLength = 0,
    bodyType = 'normal',
    tailLength = 0,
    animation = 'Idle',
    mouthOpen = 0,
    time,
    secondary = true,
    wireframe = false,
  } = props
  const gltf = useGLTF(DOG_MODEL_URL)
  const model = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene])
  const clips = useMemo(() => buildClips(model), [model])
  const { actions, mixer } = useAnimations(clips, model)
  const coat = useMemo(() => makeCoatMaterial(), [])
  const parts = useRef<Record<string, Mesh>>({})
  const bones = useRef<Record<string, Bone>>({})
  const face = useRef({ happy: 0, sad: 0, mouth: 0, closed: 0, blinkT: 2, blinkPhase: -1 })
  const follows = useRef<Record<string, Follow>>({})
  const current = useRef<ClipName | null>(null)
  const overlays = useRef<Record<string, Overlay>>({})
  const overlay = (name: string) => (overlays.current[name] ??= new Overlay())

  // one-time setup: materials, bones, meshes
  useEffect(() => {
    const eye = new MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0 })
    const hi = new MeshBasicMaterial({ color: 'white' })
    model.traverse((o) => {
      const mesh = o as Mesh
      if ((o as Bone).isBone) bones.current[o.name] = o as Bone
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      parts.current[o.name] = mesh
      if (o.name === 'Eyes') mesh.material = eye
      else if (o.name === 'Highlights') mesh.material = hi
      else mesh.material = coat.material
    })
    return () => {
      eye.dispose()
      hi.dispose()
    }
  }, [model, coat])

  useEffect(() => {
    coat.uniforms.uBase.value.set(coatBase)
    coat.uniforms.uSecondary.value.set(coatSecondary)
  }, [coat, coatBase, coatSecondary])
  useEffect(() => {
    coat.material.wireframe = wireframe
  }, [coat, wireframe])

  // animation switching with crossfade (or pinned time for screenshots)
  useEffect(() => {
    const next = actions[animation]
    if (!next) return
    const prev = current.current ? actions[current.current] : null
    if (time !== undefined) {
      for (const a of Object.values(actions)) a?.stop()
      next.reset().play()
      next.paused = true
      next.time = time
      mixer.update(0)
    } else {
      next.reset().play()
      if (prev && prev !== next) prev.crossFadeTo(next, CROSSFADE, false)
      else next.fadeIn(CROSSFADE)
    }
    current.current = animation
    return () => {
      void prev
    }
  }, [animation, actions, mixer, time])

  const tmp = useMemo(
    () => ({ q: new Quaternion(), e: new Euler(), v: new Vector3(), m: new Matrix4(), acc: new Vector3(), pq: new Quaternion() }),
    [],
  )

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20) || 1 / 60
    // A pinned (paused) action is not re-evaluated by the mixer, so re-apply it to keep the additive jaw from accumulating.
    if (time !== undefined) mixer.update(0)
    const P = parts.current
    const f = face.current
    const target = FACE[animation]
    const k = time !== undefined ? 1 : 1 - Math.exp(-8 * dt)
    f.happy += (target.happy - f.happy) * k
    f.sad += (target.sad - f.sad) * k
    f.mouth += (target.mouth - f.mouth) * k
    f.closed += (target.closed - f.closed) * k

    // random blinking
    let blink = f.closed
    if (target.blink && time === undefined) {
      f.blinkT -= dt
      if (f.blinkT <= 0 && f.blinkPhase < 0) f.blinkPhase = 0
      if (f.blinkPhase >= 0) {
        f.blinkPhase += dt / 0.16
        blink = Math.max(blink, Math.sin(Math.min(1, f.blinkPhase) * Math.PI))
        if (f.blinkPhase >= 1) {
          f.blinkPhase = -1
          f.blinkT = 2 + Math.random() * 3.5
        }
      }
    }
    const happy = f.happy * (1 - blink)
    morph(P.Lids, 'blink', blink)
    morph(P.Lids, 'happy_eyes', happy)
    morph(P.Brows, 'sad_brows', f.sad)

    // shape morphs
    const body = P.Body
    morph(body, 'ears_up', earShape === 'upright' ? 1 : 0)
    morph(body, 'ears_half', earShape === 'half' ? 1 : 0)
    morph(body, 'snout_long', Math.max(0, snoutLength))
    morph(body, 'snout_short', Math.max(0, -snoutLength))
    morph(body, 'body_slim', bodyType === 'slim' ? 1 : 0)
    morph(body, 'body_chunky', bodyType === 'chunky' ? 1 : 0)
    morph(body, 'tail_long', Math.max(0, tailLength))
    morph(body, 'tail_short', Math.max(0, -tailLength))

    // jaw: clip value + extra mouth opening
    const B = bones.current
    const open = Math.min(1, f.mouth * 0.6 + mouthOpen)
    if (B.jaw) {
      const o = overlay('jaw')
      o.begin(B.jaw)
      B.jaw.rotateX(open * 0.5)
      o.end(B.jaw)
    }

    // secondary motion: ears and tail trail their anchor
    if (secondary && time === undefined) {
      model.updateMatrixWorld(true)
      const chains: { key: string; bones: string[]; k: number; c: number; g: number; tail: boolean }[] = [
        { key: 'earL', bones: ['ear_L_0', 'ear_L_1'], k: 110, c: 7, g: 0.35, tail: false },
        { key: 'earR', bones: ['ear_R_0', 'ear_R_1'], k: 110, c: 7, g: 0.35, tail: false },
        { key: 'tail', bones: ['tail_0', 'tail_1', 'tail_2', 'tail_3', 'tail_4'], k: 70, c: 5, g: 0.22, tail: true },
      ]
      for (const ch of chains) {
        const anchor = B[ch.bones[ch.bones.length > 2 ? 2 : 0]]
        if (!anchor) continue
        const st = (follows.current[ch.key] ??= new Follow())
        anchor.getWorldPosition(tmp.v)
        if (!st.primed) {
          st.prev.copy(tmp.v)
          st.primed = true
        }
        const vel = tmp.v.clone().sub(st.prev).divideScalar(dt)
        tmp.acc.copy(vel).sub(st.prevVel).divideScalar(dt)
        st.prev.copy(tmp.v)
        st.prevVel.copy(vel)
        tmp.acc.clampLength(0, 60)
        // acceleration in the parent's frame
        anchor.parent!.getWorldQuaternion(tmp.pq)
        tmp.acc.applyQuaternion(tmp.pq.invert())
        const drive = [tmp.acc.y, tmp.acc.x] // pitch from vertical, yaw/roll from lateral
        for (let a = 0; a < 2; a++) {
          const force = -ch.k * st.x[a] - ch.c * st.v[a] - ch.g * drive[a] * (a === 0 ? 1 : 1)
          st.v[a] += force * dt
          st.x[a] = MathUtils.clamp(st.x[a] + st.v[a] * dt, -0.6, 0.6)
        }
        ch.bones.forEach((bn, i) => {
          const b = B[bn]
          if (!b) return
          const w = (i + 1) / ch.bones.length
          const o = overlay(bn)
          o.begin(b)
          if (ch.tail) tmp.e.set(st.x[0] * w, st.x[1] * w, 0)
          else tmp.e.set(st.x[0] * w, 0, (ch.key === 'earL' ? 1 : -1) * st.x[1] * w)
          tmp.q.setFromEuler(tmp.e)
          b.quaternion.multiply(tmp.q)
          o.end(b)
        })
      }
    }
  })

  return <primitive object={model as Object3D & SkinnedMesh} />
}

useGLTF.preload(DOG_MODEL_URL)
