import { METER_IDS, moodFrom, type MeterId } from '../game/meters'
import { currentMeters, useDog } from '../game/store'
import { useNow } from '../game/useNow'

const LABELS: Record<MeterId, { icon: string; label: string; color: string }> = {
  hunger: { icon: '🍖', label: 'Honger', color: 'bg-orange-400' },
  energy: { icon: '⚡', label: 'Energie', color: 'bg-sky-400' },
  happiness: { icon: '💛', label: 'Blij', color: 'bg-pink-400' },
}

export function Meters() {
  const meters = useDog((s) => s.meters)
  const now = useNow()
  const values = currentMeters(meters, now)
  return (
    <div className="flex gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
      {METER_IDS.map((id) => (
        <div
          key={id}
          className="flex-1"
          aria-label={`${LABELS[id].label} ${Math.round(values[id])}%`}
        >
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold">
            <span aria-hidden>{LABELS[id].icon}</span>
            {LABELS[id].label}
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${LABELS[id].color}`}
              style={{ width: `${values[id]}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MoodBubble() {
  const meters = useDog((s) => s.meters)
  const activity = useDog((s) => s.activity)
  const name = useDog((s) => s.name)
  const now = useNow()
  const values = currentMeters(meters, now)
  const kind = now < activity.until ? activity.kind : 'idle'
  const mood = moodFrom(values)

  let text = `${name} wacht op je aandacht.`
  if (kind === 'sleep') text = 'Zzz… 💤'
  else if (kind === 'eat') text = 'Nom nom nom! 😋'
  else if (kind === 'pet')
    text = activity.zone === 'head' ? 'Ja, precies daar!' : 'Hmmm, lekker…'
  else if (mood === 'sulking') {
    text =
      values.hunger < 20
        ? `${name} staat met de lege bak in zijn bek.`
        : values.energy < 20
          ? `${name} ligt zielig in de mand.`
          : `${name} kijkt je vol verwijt aan.`
  } else if (mood === 'happy') text = `${name} is dolblij! 🐾`

  return (
    <div className="mx-auto max-w-[85%] rounded-2xl bg-white/80 px-4 py-2 text-center text-sm font-medium shadow-sm backdrop-blur">
      {text}
    </div>
  )
}
