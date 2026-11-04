import { useEffect, useState } from 'react'
import { useDog } from '../game/store'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'virtuele-hond-install-dismissed'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Invites the owner to put the dog on their home screen (needed for push on iOS). */
export function InstallPrompt() {
  const name = useDog((s) => s.name)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  const ios = isIos()
  const canInstall = deferred !== null || ios
  if (dismissed || isStandalone() || !canInstall) return null

  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') dismiss()
      setDeferred(null)
    } else {
      setShowIosHelp(true)
    }
  }

  return (
    <div className="mx-4 mb-2 rounded-2xl bg-white/90 p-3 text-sm shadow-md">
      <p className="font-semibold">Geef {name} een plekje op je beginscherm 🏠</p>
      {showIosHelp ? (
        <p className="mt-1 text-xs">
          Tik op <span aria-label="deelknop">⎙ Deel</span> onderin Safari en kies{' '}
          <b>Zet op beginscherm</b>.
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={install}
          className="flex-1 rounded-xl bg-orange-400 py-2 font-semibold text-white active:scale-95"
        >
          Installeren
        </button>
        <button type="button" onClick={dismiss} className="rounded-xl px-3 py-2 text-xs">
          Later
        </button>
      </div>
    </div>
  )
}
