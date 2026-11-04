/**
 * Screenshots of /dev/dog for the quality loop -> previews/round_N/.
 *
 *   npx tsx tools/dog/preview.ts 1            (dev server must run on :5173)
 *   npx tsx tools/dog/preview.ts 1 views      (only the still views)
 *
 * Uses the machine's preinstalled Playwright (resolved via NODE_PATH / global install).
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
function loadPlaywright() {
  try {
    return require('playwright')
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim()
    return require(join(globalRoot, 'playwright'))
  }
}
const { chromium } = loadPlaywright()

/** Globals published by /dev/dog (src/dev/DogLab.tsx). */
declare global {
  interface Window {
    __dogLab?: { set: (values: Record<string, unknown>) => Promise<void>; ready: boolean }
    __dogClips?: Record<string, number>
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const round = process.argv[2] ?? '1'
const only = process.argv[3]
const BASE_URL = process.env.DOG_URL ?? 'http://localhost:5173'
const out = resolve(here, `../../previews/round_${round}`)

const VIEWS = ['34', 'front', 'side', 'back', 'top', 'face'] as const
const VIEW_LABEL: Record<string, string> = {
  '34': '3/4',
  front: 'voor',
  side: 'zij',
  back: 'achter',
  top: 'boven',
  face: 'close-up gezicht',
}
const ANIMS = [
  'Idle',
  'Wag',
  'Sit',
  'Lie',
  'Sleep',
  'Eat',
  'Run',
  'Roll',
  'Jump',
  'Sulk',
  'PetHappy',
]
const ANIM_VIEW: Record<string, string> = {
  Roll: 'front',
  Sit: '34',
  Lie: '34',
  Sleep: '34',
  Run: 'side',
  Jump: 'sideWide',
}
const FRAMES = 5

const LAUNCH = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}

async function openLab(browser: any, w: number, h: number, dsf: number) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: dsf,
  })
  page.on('pageerror', (e: Error) => console.error('pageerror:', e.message))
  page.on(
    'console',
    (m: any) => m.type() === 'error' && console.error('console:', m.text()),
  )
  await page.goto(`${BASE_URL}/dev/dog?ui=0&t=0`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__dogLab?.ready && window.__dogClips, null, {
    timeout: 60_000,
  })
  await page.waitForTimeout(500)
  return page
}

const set = (page: any, values: Record<string, unknown>) =>
  page.evaluate(
    (v: Record<string, unknown>) =>
      Promise.race([
        window.__dogLab!.set(v),
        new Promise((r) => setTimeout(() => r('timeout'), 20_000)),
      ]),
    values,
  )

function sheet(
  title: string,
  rows: Array<{ label: string; files: Array<{ path: string; caption: string }> }>,
  cols: number,
  cell: [number, number],
) {
  const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString('base64')}`
  const body = rows
    .map(
      (r) =>
        `<div class="row">${r.label ? `<div class="rl">${r.label}</div>` : ''}<div class="g" style="grid-template-columns:repeat(${cols},${cell[0]}px)">${r.files
          .map(
            (f) =>
              `<div class="c"><img src="${img(f.path)}" style="width:${cell[0]}px;height:${cell[1]}px"><div class="l">${f.caption}</div></div>`,
          )
          .join('')}</div></div>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#2b2420;font:600 14px system-ui;color:#f3e6d6;padding:12px;display:inline-block}
  h1{font-size:17px;margin:0 0 10px}.row{margin-bottom:10px}.rl{font-size:15px;margin:4px 0}
  .g{display:grid;gap:8px}.c{background:#000;border-radius:8px;overflow:hidden}img{display:block;object-fit:cover}
  .l{padding:4px 8px;background:#3b322c;font-weight:500}</style></head><body><h1>${title}</h1>${body}</body></html>`
}

async function renderSheet(browser: any, html: string, file: string) {
  const page = await browser.newPage({
    viewport: { width: 400, height: 300 },
    deviceScaleFactor: 1,
  })
  await page.setContent(html, { waitUntil: 'load' })
  const size = await page.evaluate(() => ({
    w: document.body.scrollWidth,
    h: document.body.scrollHeight,
  }))
  await page.setViewportSize({ width: size.w, height: size.h })
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

async function main() {
  mkdirSync(join(out, 'views'), { recursive: true })
  mkdirSync(join(out, 'anims'), { recursive: true })
  const browser = await chromium.launch(LAUNCH)

  if (!only || only === 'views') {
    const page = await openLab(browser, 480, 600, 2)
    for (const view of VIEWS) {
      await set(page, { view, animation: 'Idle', frozen: true, time: 0, lookAt: false })
      await page.screenshot({ path: join(out, 'views', `${view}.png`) })
    }
    await page.close()
    // as it appears on a phone
    const phone = await openLab(browser, 390, 844, 2)
    // in the app the dog looks at you
    await set(phone, {
      view: '34',
      animation: 'Idle',
      frozen: true,
      time: 0,
      lookAt: true,
    })
    await phone.screenshot({ path: join(out, 'phone.png') })
    await phone.close()
    await renderSheet(
      browser,
      sheet(
        `Ronde ${round} – aanzichten`,
        [
          {
            label: '',
            files: VIEWS.map((v) => ({
              path: join(out, 'views', `${v}.png`),
              caption: VIEW_LABEL[v],
            })),
          },
        ],
        3,
        [360, 450],
      ),
      join(out, 'overview_views.png'),
    )
  }

  if (!only || only === 'morphs') {
    const page = await openLab(browser, 420, 420, 2)
    const ALL = [
      'ears_up',
      'ears_half',
      'snout_long',
      'snout_short',
      'body_slim',
      'body_chunky',
      'tail_long',
      'tail_short',
      'blink',
      'mouth_open',
      'happy_eyes',
      'sad_brows',
    ]
    const FACE = new Set([
      'blink',
      'mouth_open',
      'happy_eyes',
      'sad_brows',
      'snout_long',
      'snout_short',
      'ears_up',
      'ears_half',
    ])
    const files = []
    for (const m of ['basis', ...ALL]) {
      const values: Record<string, unknown> = {
        overrideMorphs: true,
        animation: 'Idle',
        frozen: true,
        time: 0,
        lookAt: false,
      }
      for (const k of ALL) values[`m_${k}`] = k === m ? 1 : 0
      values.view = FACE.has(m) ? 'face' : m.startsWith('tail') ? 'side' : '34'
      if (m === 'basis') values.view = '34'
      await set(page, values)
      const path = join(out, 'morphs', `${m}.png`)
      mkdirSync(join(out, 'morphs'), { recursive: true })
      await page.screenshot({ path })
      files.push({ path, caption: m })
    }
    await set(page, { overrideMorphs: false })
    await page.close()
    await renderSheet(
      browser,
      sheet(`Ronde ${round} – morph targets`, [{ label: '', files }], 5, [220, 220]),
      join(out, 'overview_morphs.png'),
    )
  }

  if (!only || only === 'variants') {
    // coat colours, markings and shapes: does the zone system work for other dogs?
    const VARIANTS: Array<[string, Record<string, unknown>]> = [
      ['chocolade labrador', {}],
      ['zwarte labrador', { coatBase: '#2a2421', coatSecondary: '#352d29' }],
      ['blonde labrador', { coatBase: '#e2b47a', coatSecondary: '#efcd9c' }],
      [
        'dalmatiër (vlekken)',
        {
          coatBase: '#f3efe7',
          coatSecondary: '#f3efe7',
          marking: 'spots',
          markingColor: '#2a2522',
          earShape: 'half',
          bodyType: 0.3,
        },
      ],
      [
        'beagle (zadel)',
        {
          coatBase: '#c27d3e',
          coatSecondary: '#f6ead8',
          marking: 'saddle',
          markingColor: '#2e2621',
          tailLength: 0.3,
          snoutLength: 0.65,
        },
      ],
      [
        'herder (zadel, staande oren)',
        {
          coatBase: '#c98f55',
          coatSecondary: '#d9a86c',
          marking: 'saddle',
          markingColor: '#3a2a20',
          earShape: 'upright',
          snoutLength: 0.85,
          bodyType: 0.35,
          tailLength: 0.75,
        },
      ],
      [
        'collie (bles, sokjes)',
        {
          coatBase: '#221d1b',
          coatSecondary: '#f6f1ea',
          marking: 'blaze',
          markingColor: '#f6f1ea',
          earShape: 'half',
          snoutLength: 0.7,
        },
      ],
      [
        'ooglap',
        {
          coatBase: '#f2e6d4',
          coatSecondary: '#f2e6d4',
          marking: 'patch',
          markingColor: '#6b4128',
          bodyType: 0.75,
        },
      ],
      [
        'masker',
        {
          coatBase: '#d9a066',
          coatSecondary: '#e8bd8a',
          marking: 'mask',
          markingColor: '#3b2a22',
          snoutLength: 0.3,
          bodyType: 0.85,
        },
      ],
      [
        'sokjes',
        {
          coatBase: '#8a5a3a',
          coatSecondary: '#9a6a48',
          marking: 'socks',
          markingColor: '#f6ead8',
          tailLength: 0.8,
        },
      ],
    ]
    const page = await openLab(browser, 420, 420, 2)
    mkdirSync(join(out, 'variants'), { recursive: true })
    const files = []
    const neutral = {
      coatBase: '#6a4632',
      coatSecondary: '#7a5540',
      marking: 'none',
      markingColor: '#f6ead8',
      earShape: 'floppy',
      snoutLength: 0.5,
      bodyType: 0.5,
      tailLength: 0.5,
    }
    for (const [i, [label, v]] of VARIANTS.entries()) {
      // let the shape morphs settle (they ease towards new values)
      await set(page, {
        ...neutral,
        ...v,
        view: '34',
        animation: 'Sit',
        frozen: true,
        time: 0,
        lookAt: true,
      })
      await page.waitForTimeout(300)
      await set(page, { time: 0.01 })
      const path = join(out, 'variants', `${i}.png`)
      await page.screenshot({ path })
      files.push({ path, caption: label })
    }
    await set(page, neutral)
    await page.close()
    await renderSheet(
      browser,
      sheet(
        `Ronde ${round} – kleuren, aftekening en vorm`,
        [{ label: '', files }],
        5,
        [220, 220],
      ),
      join(out, 'overview_variants.png'),
    )
  }

  if (!only || only === 'anims') {
    const page = await openLab(browser, 420, 420, 1)
    const clips: Record<string, number> = await page.evaluate(() => window.__dogClips)
    const rows = []
    for (const anim of ANIMS) {
      const dur = clips[anim]
      if (!dur) {
        console.warn(`no clip ${anim}`)
        continue
      }
      const files = []
      for (let i = 0; i < FRAMES; i++) {
        // simulate from 0 so secondary motion is settled; sample the second loop
        const t = dur + (i / FRAMES) * dur
        await set(page, {
          view: ANIM_VIEW[anim] ?? '34',
          animation: anim,
          frozen: true,
          time: t,
          lookAt: false,
        })
        const path = join(out, 'anims', `${anim}_${i}.png`)
        await page.screenshot({ path })
        files.push({ path, caption: `${((i / FRAMES) * dur).toFixed(2)} s` })
      }
      rows.push({ label: `${anim} (${dur.toFixed(2)} s)`, files })
    }
    await page.close()
    for (let s = 0; s < rows.length; s += 4)
      await renderSheet(
        browser,
        sheet(
          `Ronde ${round} – animaties ${s / 4 + 1}`,
          rows.slice(s, s + 4),
          FRAMES,
          [210, 210],
        ),
        join(out, `overview_anims_${s / 4 + 1}.png`),
      )
  }
  await browser.close()
  console.log(`previews -> ${out}`)
}

void main()
