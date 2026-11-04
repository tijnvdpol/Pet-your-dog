import { useState, type FormEvent } from 'react'
import { useAuth, type SyncStatus } from '../game/sync'
import { supabase } from '../lib/supabase'

const STATUS_LABEL: Record<SyncStatus, string> = {
  local: 'Inloggen',
  syncing: 'Opslaan…',
  synced: 'Opgeslagen',
  offline: 'Offline',
  error: 'Mislukt',
}

/** Small cloud chip + sheet to sign in with an e-mail magic link. */
export function AccountButton() {
  const { session, status } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabase) return null

  const send = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setBusy(false)
    setMessage(
      error
        ? 'Versturen mislukt. Probeer het zo nog eens.'
        : 'Check je mail: tik op de link om in te loggen. 📬',
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-3 bottom-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow-md active:scale-95"
      >
        ☁️ {session ? STATUS_LABEL[status] : STATUS_LABEL.local}
      </button>
      {open && (
        <div
          className="absolute inset-0 z-10 flex items-end bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {session ? (
              <>
                <p className="font-semibold">Ingelogd als</p>
                <p className="mb-4 text-sm break-all">{session.user.email}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase!.auth.signOut()
                    setOpen(false)
                  }}
                  className="w-full rounded-xl bg-black/10 py-3 font-semibold"
                >
                  Uitloggen
                </button>
              </>
            ) : (
              <form onSubmit={send}>
                <p className="font-semibold">Bewaar je hond in de cloud</p>
                <p className="mb-3 text-sm">
                  Vul je e-mailadres in, dan sturen we een inloglink. Zo zie je op elk
                  apparaat dezelfde hond.
                </p>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="jij@voorbeeld.nl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mb-3 w-full rounded-xl border border-black/20 px-3 py-3 text-base"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-orange-400 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {busy ? 'Versturen…' : 'Stuur inloglink'}
                </button>
                {message && <p className="mt-3 text-sm">{message}</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
