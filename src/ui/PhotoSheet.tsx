import { useRef, useState } from 'react'
import { analysisToAppearance, parseAnalysis } from '../dog/analysis'
import { useDog } from '../game/store'
import { useAuth } from '../game/sync'
import { supabase } from '../lib/supabase'

const MAX_SIDE = 1024

/** Downscales a photo in the browser: faster upload, cheaper analysis, no huge files. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode'))),
      'image/jpeg',
      0.85,
    ),
  )
}

const ERRORS: Record<string, string> = {
  analysis_not_configured:
    'Foto-analyse is nog niet ingeschakeld. Probeer het later nog eens.',
  not_a_dog_or_invalid:
    'Dat lijkt geen hond. Probeer een andere foto, het liefst van dichtbij.',
  analysis_failed: 'De analyse is mislukt. Probeer het zo nog eens.',
}

/** Tab content: pick a photo of your dog and let the avatar copy its looks. */
export function PhotoTab() {
  const session = useAuth((s) => s.session)
  const dogId = useDog((s) => s.dogId)
  const name = useDog((s) => s.name)
  const setAppearance = useDog((s) => s.setAppearance)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file || !session || !dogId) return
    setBusy(true)
    setMessage(null)
    try {
      const blob = await shrink(file)
      const path = `${session.user.id}/${crypto.randomUUID()}.jpg`
      const up = await supabase!.storage
        .from('dog-photos')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const row = await supabase!
        .from('uploads')
        .insert({ dog_id: dogId, owner_id: session.user.id, storage_path: path })
        .select('id')
        .single()
      if (row.error) {
        setMessage(
          row.error.message.includes('limit')
            ? 'Je hebt het maximum aantal foto’s bereikt.'
            : 'Uploaden mislukt.',
        )
        return
      }
      const res = await supabase!.functions.invoke('analyze-dog', {
        body: { upload_id: row.data.id },
      })
      if (res.error) {
        let code = 'analysis_failed'
        try {
          code = (await (res.error as { context: Response }).context.json()).error ?? code
        } catch {
          // keep the generic code
        }
        setMessage(ERRORS[code] ?? ERRORS.analysis_failed)
        return
      }
      const analysis = parseAnalysis(res.data?.analysis)
      if (!analysis) {
        setMessage(ERRORS.not_a_dog_or_invalid)
        return
      }
      setAppearance(analysisToAppearance(analysis))
      setMessage(
        `Gelukt! ${name} lijkt nu op jouw hond (${analysis.breed_guess || 'onbekend ras'}). 🎉`,
      )
    } catch {
      setMessage('Er ging iets mis. Controleer je verbinding en probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {!session ? (
        <p className="text-sm">
          Log eerst in via de wolk rechtsonder, dan kun je een foto uploaden.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            Kies een duidelijke foto van je hond, liefst van de zijkant of schuin voor. De
            foto blijft privé en wordt alleen gebruikt om het uiterlijk te bepalen. Daarna
            kun je het resultaat nog bijstellen bij “Uiterlijk”.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={busy || !dogId}
            onClick={() => input.current?.click()}
            className="w-full rounded-xl bg-orange-400 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Bezig met analyseren…' : dogId ? 'Kies een foto' : 'Even geduld…'}
          </button>
        </>
      )}
      {message && <p className="mt-3 text-sm">{message}</p>}
    </div>
  )
}
