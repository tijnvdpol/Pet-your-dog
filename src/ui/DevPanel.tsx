import { PRESETS } from '../dog/appearance'
import { useDog } from '../game/store'

/** Developer-only look picker, shown with `?dev` in the URL. */
export function DevPanel() {
  const set = useDog((s) => s.setAppearance)
  const look = useDog((s) => s.appearance)
  return (
    <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1 rounded-xl bg-white/80 p-2 text-xs">
      {Object.entries(PRESETS).map(([id, p]) => (
        <button
          key={id}
          className="rounded-lg bg-white px-2 py-1 shadow"
          onClick={() => set(p.look)}
        >
          {p.label}
        </button>
      ))}
      <input
        type="color"
        value={look.furColor}
        onChange={(e) => set({ furColor: e.target.value })}
      />
      <input
        type="color"
        value={look.secondColor}
        onChange={(e) => set({ secondColor: e.target.value })}
      />
    </div>
  )
}
