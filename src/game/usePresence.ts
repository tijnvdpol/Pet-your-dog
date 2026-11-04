import { useEffect } from 'react'
import { useDog } from './store'

const HEARTBEAT_MS = 30_000

/** Greets on open/return and keeps `lastSeen` fresh while the app is visible. */
export function usePresence() {
  useEffect(() => {
    const { welcome, touch } = useDog.getState()
    welcome()
    const beat = setInterval(touch, HEARTBEAT_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') useDog.getState().welcome()
      else useDog.getState().touch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', touch)
    return () => {
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', touch)
    }
  }, [])
}
