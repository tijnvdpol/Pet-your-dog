// Analyzes an uploaded dog photo with a vision model and stores the result as JSON.
// Secrets: GEMINI_API_KEY (preferred) or ANTHROPIC_API_KEY. Optional: GEMINI_MODEL, ANALYSIS_MODEL.
// The request runs as the signed-in user, so Row Level Security applies to every query.
import { encodeBase64 } from 'jsr:@std/encoding/base64'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CLAUDE_MODEL = Deno.env.get('ANALYSIS_MODEL') ?? 'claude-sonnet-5-5'
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const MAX_BYTES = 5 * 1024 * 1024
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ENUMS = {
  marking: ['none', 'blaze', 'socks', 'mask', 'spots', 'saddle'],
  ear_type: ['upright', 'floppy', 'half'],
  tail_length: ['short', 'medium', 'long'],
  snout_length: ['short', 'medium', 'long'],
  build: ['slim', 'average', 'sturdy'],
  size_class: ['small', 'medium', 'large'],
  leg_length: ['short', 'normal', 'long'],
} as const

const TOOL = {
  name: 'report_dog',
  description: 'Report the visual traits of the dog in the photo.',
  input_schema: {
    type: 'object',
    properties: {
      is_dog: { type: 'boolean', description: 'True only if the photo clearly shows a dog.' },
      breed_guess: { type: 'string', description: 'Best guess of the breed or mix, in English.' },
      fur_color: { type: 'string', description: 'Dominant coat color as #RRGGBB.' },
      second_color: {
        type: 'string',
        description: 'Secondary color (ears, back patch, spots) as #RRGGBB. Same as fur_color if none.',
      },
      ...Object.fromEntries(
        Object.entries(ENUMS).map(([k, v]) => [k, { type: 'string', enum: [...v] }]),
      ),
      confidence: { type: 'number', description: 'Confidence between 0 and 1.' },
    },
    required: ['is_dog', 'breed_guess', 'fur_color', 'second_color', ...Object.keys(ENUMS), 'confidence'],
  },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const HEX = /^#[0-9a-fA-F]{6}$/

/** Never trust model output: only accept values that match the schema. */
function validate(input: Record<string, unknown>) {
  if (input.is_dog !== true) return null
  const out: Record<string, unknown> = {}
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (!(allowed as readonly string[]).includes(input[k] as string)) return null
    out[k] = input[k]
  }
  for (const k of ['fur_color', 'second_color']) {
    if (typeof input[k] !== 'string' || !HEX.test(input[k] as string)) return null
    out[k] = (input[k] as string).toLowerCase()
  }
  out.breed_guess = String(input.breed_guess ?? '').slice(0, 80)
  const c = Number(input.confidence)
  out.confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0
  return out
}


const PROMPT =
  'Describe the dog in this photo for a stylized 3D avatar. Judge the real dog, not the background. ' +
  'Pick the closest option for each trait. Colors must be the true coat colors as #RRGGBB.'

/** Gemini has no tool-calling shortcut here, so the allowed values go in the prompt and we validate strictly. */
const GEMINI_PROMPT =
  PROMPT +
  ' Reply with ONLY a JSON object with these keys: ' +
  '"is_dog" (boolean, true only if the photo clearly shows a dog), ' +
  '"breed_guess" (string, English), "fur_color" (#RRGGBB), ' +
  '"second_color" (#RRGGBB, secondary color such as ears/back patch/spots; same as fur_color if none), ' +
  Object.entries(ENUMS).map(([k, v]) => `"${k}" (one of: ${v.join(', ')})`).join(', ') +
  ', "confidence" (number 0 to 1).'

type Image = { mediaType: string; data: string }

async function askGemini(apiKey: string, img: Image): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ inline_data: { mime_type: img.mediaType, data: img.data } }, { text: GEMINI_PROMPT }] },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    },
  )
  if (!res.ok) {
    console.error('gemini_http_status', res.status) // status only: never log keys or bodies with user data
    throw new Error('provider_failed')
  }
  const body = await res.json()
  const text: string = (body.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
  // Be tolerant of ```json fences even though JSON mode should not add them.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(cleaned)
    const obj = Array.isArray(parsed) ? parsed[0] : parsed // some models wrap the object in an array
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

async function askClaude(apiKey: string, img: Image): Promise<Record<string, unknown> | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_dog' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    console.error('claude_http_status', res.status)
    throw new Error('provider_failed')
  }
  const body = await res.json()
  const block = (body.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  return block?.input ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!geminiKey && !claudeKey) return json({ error: 'analysis_not_configured' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')['default']
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    publishable ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)

  let uploadId: string
  try {
    uploadId = String((await req.json()).upload_id ?? '')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  // RLS: only the owner can see this row.
  const { data: upload, error: upErr } = await supabase
    .from('uploads')
    .select('id, storage_path, analysis')
    .eq('id', uploadId)
    .maybeSingle()
  if (upErr || !upload) return json({ error: 'not_found' }, 404)

  // Analyze once per upload (costs money): return the stored result if there is one.
  if (upload.analysis) return json({ analysis: upload.analysis, cached: true })

  const { data: file, error: dlErr } = await supabase.storage.from('dog-photos').download(upload.storage_path)
  if (dlErr || !file) return json({ error: 'file_not_found' }, 404)
  if (file.size > MAX_BYTES) return json({ error: 'file_too_large' }, 413)
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : 'image/jpeg'

  const img: Image = { mediaType, data: encodeBase64(await file.arrayBuffer()) }
  let raw: Record<string, unknown> | null
  try {
    raw = geminiKey ? await askGemini(geminiKey, img) : await askClaude(claudeKey!, img)
  } catch {
    return json({ error: 'analysis_failed' }, 502)
  }
  const analysis = raw ? validate(raw) : null
  if (!analysis) return json({ error: 'not_a_dog_or_invalid' }, 422)

  const { error: saveErr } = await supabase.from('uploads').update({ analysis }).eq('id', upload.id)
  if (saveErr) return json({ error: 'save_failed' }, 500)
  return json({ analysis, cached: false })
})
