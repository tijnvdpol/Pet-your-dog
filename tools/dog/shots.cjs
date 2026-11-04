// Screenshots of /dev/dog for the quality loop. Usage: node tools/dog/shots.cjs <round> [base-url] [filter]
const { chromium } = require('playwright')
const fs = require('node:fs')
const round = process.argv[2] ?? '1'
const base = process.argv[3] ?? 'http://localhost:5173'
const filter = process.argv[4]
const dir = `previews/round_${round}`
fs.mkdirSync(dir, { recursive: true })

const views = ['front', '3/4', 'side', 'top', 'face']
const clipFrames = {
  Idle: [0, 1.6], Wag: [0, 0.2], Sit: [0.8], Lie: [0.8], Sleep: [0.8], Eat: [0.1, 0.4],
  Run: [0, 0.2, 0.4, 0.6], Roll: [0.2, 0.6, 1.0, 1.4], Jump: [0.2, 0.6, 1.0, 1.35], Sulk: [0.8], PetHappy: [0.1, 0.2],
}
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 2 })
  p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)) })
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)))
  const shoot = async (name, params) => {
    if (filter && !name.includes(filter)) return
    await p.goto(`${base}/dev/dog?shot=1&${params}`)
    await p.waitForFunction(() => window.__dogReady === true, null, { timeout: 60000 })
    await p.waitForTimeout(300)
    await p.screenshot({ path: `${dir}/${name}.png` })
    console.log('shot', name)
  }
  for (const v of views) await shoot(`view_${v.replace('/', '')}`, `cam=${encodeURIComponent(v)}&time=0&clip=Idle`)
  await shoot('face_mouth_open', 'cam=face&time=0&mouth=1')
  for (const [clip, times] of Object.entries(clipFrames)) {
    for (const t of times) await shoot(`anim_${clip}_${String(t).replace('.', '_')}`, `cam=${clip === 'Run' || clip === 'Jump' ? 'side' : '3%2F4'}&clip=${clip}&time=${t}`)
  }
  await b.close()
})()
