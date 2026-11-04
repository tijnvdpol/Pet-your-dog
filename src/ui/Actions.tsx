import { activeActivity, useDog } from '../game/store'
import { useNow } from '../game/useNow'

function ActionButton(props: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl bg-white/90 px-2 py-2 text-sm font-semibold shadow-md active:scale-95 disabled:opacity-50"
    >
      <span className="text-2xl" aria-hidden>
        {props.icon}
      </span>
      {props.label}
    </button>
  )
}

export function Actions() {
  const feed = useDog((s) => s.feed)
  const sleep = useDog((s) => s.sleep)
  const activity = useDog((s) => s.activity)
  const now = useNow(500)
  const busy = activeActivity(activity, now).kind === 'sleep'
  return (
    <div className="flex gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <ActionButton icon="🍖" label="Voeren" onClick={feed} disabled={busy} />
      <ActionButton icon="🛏️" label="Slapen" onClick={sleep} disabled={busy} />
    </div>
  )
}
