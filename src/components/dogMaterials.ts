import {
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Vector3,
  type ColorRepresentation,
  type IUniform,
} from 'three'

/** Coat pattern on top of the two coat colours. */
export type Marking = 'none' | 'blaze' | 'socks' | 'mask' | 'spots' | 'saddle' | 'patch'
export const MARKINGS: Marking[] = [
  'none',
  'blaze',
  'socks',
  'mask',
  'spots',
  'saddle',
  'patch',
]

/**
 * Soft toon ramp: three light tones with anti-aliased steps. Replaces three.js' default
 * two-tone `getGradientIrradiance`.
 */
const TOON_RAMP = /* glsl */ `
uniform vec3 uToon;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float d = dot( normal, lightDirection ) * 0.5 + 0.5;
  float w = fwidth( d ) * 0.75 + 0.006;
  float t1 = smoothstep( 0.4 - w, 0.4 + w, d );
  float t2 = smoothstep( 0.66 - w, 0.66 + w, d );
  return vec3( mix( mix( uToon.x, uToon.y, t1 ), uToon.z, t2 ) );
}
`

const RIM = /* glsl */ `
  {
    float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
    float rim = smoothstep( 0.55, 1.0, 1.0 - facing );
    outgoingLight += uRimColor * rim * uRim;
  }
`

/** Rim light on the silhouette only: the baked occlusion keeps it out of creases. */
const RIM_COAT = /* glsl */ `
  {
    float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
    float rim = smoothstep( 0.7, 1.0, 1.0 - facing ) * smoothstep( 0.75, 0.97, vAO );
    outgoingLight += uRimColor * rim * uRim;
  }
`

function toonBase(uniforms: Record<string, IUniform>) {
  const m = new MeshToonMaterial()
  m.userData.uniforms = uniforms
  return m
}

export interface CoatUniforms {
  uCoatBase: { value: Color }
  uCoatSecondary: { value: Color }
  uMarkColor: { value: Color }
  uInnerEar: { value: Color }
  uMouth: { value: Color }
  uMarking: { value: number }
  uToon: { value: Vector3 }
  uRim: { value: number }
  uRimColor: { value: Color }
  /** Leg-height level (0..1 of 0.4 m) below which the paws take the secondary colour. */
  uPawLevel: { value: number }
  /** Strength of the baked ambient occlusion (0..1). */
  uAO: { value: number }
}

/**
 * Coat material. The body carries smooth zone fields as vertex attributes
 * (COLOR_0 = bib, muzzle, leg height, inner ear; _MARKINGS = mouth, blaze, saddle, eye patch);
 * the fragment shader thresholds them into crisp, smooth-edged colour zones.
 */
export function createCoatMaterial(): MeshToonMaterial & {
  userData: { uniforms: CoatUniforms }
} {
  const u: CoatUniforms = {
    uCoatBase: { value: new Color('#6a4632') },
    uCoatSecondary: { value: new Color('#7a5540') },
    uMarkColor: { value: new Color('#f6ead8') },
    uInnerEar: { value: new Color('#8a5a4a') },
    uMouth: { value: new Color('#4c1e20') },
    uMarking: { value: 0 },
    uToon: { value: new Vector3(0.56, 0.82, 1.0) },
    uRim: { value: 0.2 },
    uRimColor: { value: new Color('#ffe2c2') },
    uPawLevel: { value: 0.12 },
    uAO: { value: 0.8 },
  }
  const m = toonBase(u as unknown as Record<string, IUniform>) as MeshToonMaterial & {
    userData: { uniforms: CoatUniforms }
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec4 color;
        attribute vec4 _markings;
        attribute vec4 _shade;
        varying float vAO;
        varying vec4 vZones;
        varying vec4 vMarks;
        varying vec3 vRest;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vZones = color;
        vMarks = _markings;
        vAO = _shade.x;
        vRest = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', TOON_RAMP)
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uCoatBase;
        uniform vec3 uCoatSecondary;
        uniform vec3 uMarkColor;
        uniform vec3 uInnerEar;
        uniform vec3 uMouth;
        uniform int uMarking;
        uniform float uRim;
        uniform vec3 uRimColor;
        uniform float uPawLevel;
        uniform float uAO;
        varying float vAO;
        varying vec4 vZones;
        varying vec4 vMarks;
        varying vec3 vRest;
        float zoneAbove( float v, float t ) {
          float w = max( fwidth( v ) * 0.9, 0.004 );
          return smoothstep( t - w, t + w, v );
        }
        float hash3( vec3 p ) {
          p = fract( p * 0.3183099 + 0.1 );
          p *= 17.0;
          return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
        }
        float vnoise( vec3 x ) {
          vec3 i = floor( x );
          vec3 f = fract( x );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( hash3( i ), hash3( i + vec3( 1, 0, 0 ) ), f.x ),
                           mix( hash3( i + vec3( 0, 1, 0 ) ), hash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( hash3( i + vec3( 0, 0, 1 ) ), hash3( i + vec3( 1, 0, 1 ) ), f.x ),
                           mix( hash3( i + vec3( 0, 1, 1 ) ), hash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
        }`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        float bib = smoothstep( 0.35, 0.75, vZones.x ) * 0.85; // soft edge: a bib, not a patch
        float muzzle = zoneAbove( vZones.y, 0.5 );
        float paws = 1.0 - zoneAbove( vZones.z, uPawLevel );
        vec3 coat = mix( uCoatBase, uCoatSecondary, max( max( bib, muzzle ), paws ) );
        float mark = 0.0;
        if ( uMarking == 1 ) mark = zoneAbove( vMarks.y, 0.5 );
        else if ( uMarking == 2 ) mark = 1.0 - zoneAbove( vZones.z, 0.5 );
        else if ( uMarking == 3 ) mark = zoneAbove( vZones.y, 0.3 );
        else if ( uMarking == 4 ) {
          float n = vnoise( vRest * 9.0 ) * 0.65 + vnoise( vRest * 19.0 ) * 0.35;
          float w = max( fwidth( n ), 0.01 );
          mark = smoothstep( 0.66 - w, 0.66 + w, n ) * ( 1.0 - muzzle );
        }
        else if ( uMarking == 5 ) mark = zoneAbove( vMarks.z, 0.5 );
        else if ( uMarking == 6 ) mark = zoneAbove( vMarks.w, 0.5 );
        coat = mix( coat, uMarkColor, mark );
        coat = mix( coat, uInnerEar, zoneAbove( vZones.w, 0.5 ) );
        coat = mix( coat, uMouth, zoneAbove( vMarks.x, 0.5 ) );
        coat *= mix( 1.0, vAO, uAO );
        vec4 diffuseColor = vec4( coat, opacity );`,
      )
      .replace('#include <opaque_fragment>', `${RIM_COAT}\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'dog-coat-v2'
  return m
}

/** Plain toon material (tongue). */
export function createToonMaterial(color: ColorRepresentation) {
  const u = {
    uToon: { value: new Vector3(0.62, 0.84, 1.0) },
    uRim: { value: 0.15 },
    uRimColor: { value: new Color('#ffe2c2') },
  }
  const m = new MeshToonMaterial({ color })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', TOON_RAMP)
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;',
      )
      .replace('#include <opaque_fragment>', `${RIM}\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'dog-toon-v1'
  return m
}

/** Glossy nose; vertex colours darken the nostrils. */
export function createNoseMaterial(color: ColorRepresentation) {
  return new MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0,
    vertexColors: true,
  })
}

export interface EyeUniforms {
  uIris: { value: Color }
  uPupil: { value: Color }
  /** 0 = open; 1 = closed (hides the highlights). */
  uClosed: { value: number }
  /** Eye ball scale baked into the mesh (see tools/dog/parts.ts). */
  uScale: { value: Vector3 }
}

/**
 * Big glossy cartoon eye, drawn procedurally from the eye-local rest position:
 * dark iris with a warm lower ring, large pupil and two fixed white highlights.
 */
export function createEyeMaterial(): MeshBasicMaterial & {
  userData: { uniforms: EyeUniforms }
} {
  const u: EyeUniforms = {
    uIris: { value: new Color('#5a3418') },
    uPupil: { value: new Color('#120a06') },
    uClosed: { value: 0 },
    uScale: { value: new Vector3(1, 1.1, 0.55) },
  }
  const m = new MeshBasicMaterial() as MeshBasicMaterial & {
    userData: { uniforms: EyeUniforms }
  }
  m.userData.uniforms = u
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uIris;
        uniform vec3 uPupil;
        uniform float uClosed;
        uniform vec3 uScale;
        varying vec3 vLocal;
        float spot( vec3 d, vec3 c, float r ) {
          float a = acos( clamp( dot( d, normalize( c ) ), -1.0, 1.0 ) );
          float w = fwidth( a ) + 0.01;
          return 1.0 - smoothstep( r - w, r + w, a );
        }`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `
        vec3 d = normalize( vLocal / uScale );
        float a = acos( clamp( d.z, -1.0, 1.0 ) );
        float wa = fwidth( a ) + 0.01;
        // warm ring in the lower half of the iris
        vec3 iris = mix( uIris * 0.55, uIris * 1.25, smoothstep( 0.1, -0.7, d.y ) );
        vec3 col = mix( uPupil, iris, smoothstep( 0.5 - wa, 0.5 + wa, a ) );
        col = mix( col, uIris * 0.35, smoothstep( 0.95 - wa, 0.95 + wa, a ) );
        col *= 0.8 + 0.2 * smoothstep( -0.8, 0.6, d.y );
        float hl = max( spot( d, vec3( -0.42, 0.5, 0.76 ), 0.27 ), spot( d, vec3( 0.32, -0.3, 0.9 ), 0.1 ) * 0.9 );
        col = mix( col, vec3( 1.0 ), hl * ( 1.0 - uClosed ) );
        vec4 diffuseColor = vec4( col, opacity );`,
      )
  }
  m.customProgramCacheKey = () => 'dog-eye-v1'
  return m
}
