import { Scene } from './dog/Scene'
import { Actions } from './ui/Actions'
import { DevPanel } from './ui/DevPanel'
import { Meters, MoodBubble } from './ui/Meters'

export default function App() {
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col bg-gradient-to-b from-[#ffe9c7] to-[#cfeaf5]">
      <Meters />
      <div className="relative min-h-0 flex-1">
        <Scene />
        <div className="pointer-events-none absolute inset-x-0 top-3">
          <MoodBubble />
        </div>
        {new URLSearchParams(location.search).has('dev') && <DevPanel />}
      </div>
      <Actions />
    </div>
  )
}
