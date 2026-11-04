import { lazy, Suspense } from 'react'
import { usePresence } from './game/usePresence'
import { Actions } from './ui/Actions'
import { InstallPrompt } from './ui/InstallPrompt'
import { DevPanel } from './ui/DevPanel'
import { Meters, MoodBubble } from './ui/Meters'

// The 3D scene (three.js) is a separate chunk so the UI can paint first.
const Scene = lazy(() => import('./dog/Scene').then((m) => ({ default: m.Scene })))

export default function App() {
  usePresence()
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-gradient-to-b from-[#ffe9c7] to-[#cfeaf5]">
      <Meters />
      <div className="relative min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-4xl">
              <span className="animate-bounce">🐶</span>
            </div>
          }
        >
          <Scene />
        </Suspense>
        <div className="pointer-events-none absolute inset-x-0 top-3">
          <MoodBubble />
        </div>
        {new URLSearchParams(location.search).has('dev') && <DevPanel />}
      </div>
      <InstallPrompt />
      <Actions />
    </div>
  )
}
