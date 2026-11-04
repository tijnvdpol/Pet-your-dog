import type { ReactNode } from 'react'
import {
  BASE_MODEL_LABELS,
  withBaseModel,
  type BaseModel,
  type EarType,
  type Marking,
} from '../dog/appearance'
import type { Character } from '../game/character'
import { useDog, type PetZone } from '../game/store'
import { useCustomize } from './customizeStore'
import { PhotoTab } from './PhotoSheet'

const EARS: Record<EarType, string> = {
  upright: 'Staand',
  floppy: 'Hangend',
  half: 'Half',
}
const MARKINGS: Record<Marking, string> = {
  none: 'Geen',
  blaze: 'Bles',
  socks: 'Sokjes',
  mask: 'Masker',
  spots: 'Vlekken',
  saddle: 'Zadel',
  patch: 'Oogvlek',
}

function Chips<T extends string>(props: {
  value: T
  options: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(props.options) as T[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => props.onChange(k)}
          className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
            props.value === k ? 'bg-orange-400 text-white' : 'bg-black/10'
          }`}
        >
          {props.options[k]}
        </button>
      ))}
    </div>
  )
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase opacity-70">
        {props.label}
      </p>
      {props.children}
    </div>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  left: string
  right: string
}) {
  return (
    <Field label={props.label}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={(props.max - props.min) / 20}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-8 w-full accent-orange-400"
        aria-label={props.label}
      />
      <div className="flex justify-between text-xs opacity-60">
        <span>{props.left}</span>
        <span>{props.right}</span>
      </div>
    </Field>
  )
}

function LookTab() {
  const look = useDog((s) => s.appearance)
  const name = useDog((s) => s.name)
  const set = useDog((s) => s.setAppearance)
  const setName = useDog((s) => s.setName)
  const labels = BASE_MODEL_LABELS
  return (
    <div>
      <Field label="Naam">
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-black/20 px-3 py-2 text-base"
        />
      </Field>
      <Field label="Formaat">
        <Chips
          value={look.baseModel ?? 'large'}
          options={labels}
          onChange={(m: BaseModel) =>
            useDog.setState({ appearance: withBaseModel(look, m) })
          }
        />
      </Field>
      <Field label="Kleuren">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="color"
              value={look.furColor}
              onChange={(e) => set({ furColor: e.target.value })}
              className="h-10 w-14"
              aria-label="Vachtkleur"
            />
            Vacht
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="color"
              value={look.secondColor}
              onChange={(e) => set({ secondColor: e.target.value })}
              className="h-10 w-14"
              aria-label="Tweede kleur"
            />
            Oren en staart
          </label>
        </div>
      </Field>
      <Field label="Oren">
        <Chips
          value={look.earType}
          options={EARS}
          onChange={(earType) => set({ earType })}
        />
      </Field>
      <Field label="Aftekening">
        <Chips
          value={look.marking}
          options={MARKINGS}
          onChange={(marking) => set({ marking })}
        />
      </Field>
      <Slider
        label="Staart"
        value={look.tailLength}
        min={0.5}
        max={1.4}
        left="Kort"
        right="Lang"
        onChange={(tailLength) => set({ tailLength })}
      />
      <Slider
        label="Snuit"
        value={look.snoutLength}
        min={0}
        max={1}
        left="Plat"
        right="Lang"
        onChange={(snoutLength) => set({ snoutLength })}
      />
      <Slider
        label="Bouw"
        value={look.build}
        min={0}
        max={1}
        left="Slank"
        right="Stevig"
        onChange={(build) => set({ build })}
      />
      <Slider
        label="Pootlengte"
        value={look.legLength}
        min={0.4}
        max={0.85}
        left="Kort"
        right="Lang"
        onChange={(legLength) => set({ legLength })}
      />
    </div>
  )
}

const QUESTIONS: {
  key: 'energy' | 'playfulness' | 'cuddliness' | 'stubbornness'
  q: string
  low: string
  high: string
}[] = [
  { key: 'energy', q: 'Hoe energiek is je hond?', low: 'Luiwammes', high: 'Stuiterbal' },
  {
    key: 'playfulness',
    q: 'Hoe speels is hij?',
    low: 'Serieus',
    high: 'Altijd in voor spel',
  },
  { key: 'cuddliness', q: 'Hoe knuffelig is hij?', low: 'Onafhankelijk', high: 'Klit' },
  {
    key: 'stubbornness',
    q: 'Hoe eigenwijs is hij?',
    low: 'Gehoorzaam',
    high: 'Eigenwijs',
  },
]
const TOYS: Record<Character['favoriteToy'], string> = {
  ball: '🎾 Bal',
  rope: '🪢 Touw',
  squeaky: '🧸 Piepspeeltje',
  stick: '🪵 Stok',
}
const SPOTS: Record<PetZone, string> = { head: 'Kop en oren', back: 'Rug', belly: 'Buik' }

function CharacterTab() {
  const c = useDog((s) => s.character)
  const set = useDog((s) => s.setCharacter)
  const name = useDog((s) => s.name)
  return (
    <div>
      <p className="mb-3 text-sm">
        Vertel hoe {name} is. Een drukke hond wordt sneller moe en een knuffelaar mist je
        eerder.
      </p>
      {QUESTIONS.map(({ key, q, low, high }) => (
        <Field key={key} label={q}>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ [key]: n })}
                className={`h-10 flex-1 rounded-full text-sm font-semibold ${
                  c[key] === n ? 'bg-orange-400 text-white' : 'bg-black/10'
                }`}
                aria-label={`${q} ${n} van 5`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs opacity-60">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </Field>
      ))}
      <Field label="Favoriet speeltje">
        <Chips
          value={c.favoriteToy}
          options={TOYS}
          onChange={(favoriteToy) => set({ favoriteToy })}
        />
      </Field>
      <Field label="Favoriete aaiplek">
        <Chips
          value={c.favoriteSpot}
          options={SPOTS}
          onChange={(favoriteSpot) => set({ favoriteSpot })}
        />
      </Field>
    </div>
  )
}

/** Floating button that opens the customize panel. */
export function CustomizeButton() {
  const name = useDog((s) => s.name)
  const open = useCustomize((s) => s.open)
  const setOpen = useCustomize((s) => s.setOpen)
  if (open) return null
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow-md active:scale-95"
    >
      ✏️ Maak {name} na
    </button>
  )
}

/**
 * Panel to make the avatar look and act like the real dog. It sits in the page flow (not on top
 * of the 3D view), so the dog shrinks to fit above it and stays visible while you tweak.
 */
export function CustomizePanel() {
  const { open, tab, setOpen, setTab } = useCustomize()
  if (!open) return null
  return (
    <div className="flex max-h-[42dvh] shrink-0 flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
      <div className="flex items-center gap-1 px-3 pt-3">
        {(
          [
            ['look', 'Uiterlijk'],
            ['character', 'Karakter'],
            ['photo', 'Foto'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id ? 'bg-orange-400 text-white' : 'bg-black/5'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-full px-3 py-2 text-sm font-semibold"
          aria-label="Sluiten"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto px-5 pt-4 pb-3">
        {tab === 'look' && <LookTab />}
        {tab === 'character' && <CharacterTab />}
        {tab === 'photo' && <PhotoTab />}
      </div>
    </div>
  )
}
