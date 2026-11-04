import type { Session } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useDog } from './store'
import { fromRemote, toStatsRow, type LocalDog, type RemoteDog } from './syncMap'

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error'

interface AuthState {
  session: Session | null
  status: SyncStatus
}
export const useAuth = create<AuthState>(() => ({ session: null, status: 'local' }))

const SAVE_DEBOUNCE_MS = 1500
const setStatus = (status: SyncStatus) => useAuth.setState({ status })

const snapshot = (): LocalDog => {
  const s = useDog.getState()
  return {
    name: s.name,
    lastSeen: s.lastSeen,
    meters: s.meters,
    appearance: s.appearance,
  }
}

// All server work runs one at a time, so a create can never race a save.
let queue: Promise<void> = Promise.resolve()
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job).catch(() => undefined)
  return queue
}

let applyingRemote = false
let dirty = false

async function createRemote(userId: string) {
  if (!supabase) return
  const local = snapshot()
  const { data, error } = await supabase
    .from('dogs')
    .insert({ owner_id: userId, name: local.name, appearance: local.appearance })
    .select('id')
    .single()
  if (error) throw error
  const stats = await supabase
    .from('dog_stats')
    .insert({ dog_id: data.id, ...toStatsRow(local) })
  if (stats.error) throw stats.error
  useDog.setState({ dogId: data.id })
}

async function pushNow(session: Session) {
  if (!supabase) return
  const dogId = useDog.getState().dogId
  if (!dogId) return createRemote(session.user.id)
  const local = snapshot()
  const dog = await supabase
    .from('dogs')
    .update({ name: local.name, appearance: local.appearance })
    .eq('id', dogId)
  if (dog.error) throw dog.error
  const stats = await supabase
    .from('dog_stats')
    .upsert({ dog_id: dogId, ...toStatsRow(local) })
  if (stats.error) throw stats.error
}

async function pullNow(session: Session) {
  if (!supabase) return
  const { data, error } = await supabase
    .from('dogs')
    .select('id,name,appearance,dog_stats(*)')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  const remote = data?.[0] as RemoteDog | undefined
  if (!remote) return createRemote(session.user.id)
  applyingRemote = true
  try {
    useDog.getState().applyRemote({ dogId: remote.id, ...fromRemote(remote, Date.now()) })
  } finally {
    applyingRemote = false
  }
  useDog.getState().welcome()
}

function run(job: () => Promise<void>) {
  const session = useAuth.getState().session
  if (!session) return Promise.resolve()
  setStatus('syncing')
  return enqueue(async () => {
    try {
      await job()
      dirty = false
      setStatus('synced')
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline')
    }
  })
}

const save = () => {
  const session = useAuth.getState().session
  return session ? run(() => pushNow(session)) : Promise.resolve()
}
const pull = () => {
  const session = useAuth.getState().session
  return session ? run(() => pullNow(session)) : Promise.resolve()
}

/** Keeps the local dog and the Supabase dog in sync while signed in. */
export function useSync() {
  useEffect(() => {
    if (!supabase) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      useAuth.setState({ session, status: session ? 'syncing' : 'local' })
      if (event === 'SIGNED_OUT') useDog.getState().reset()
      else if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN'))
        void pull()
    })

    // Save a moment after meaningful changes (not on every `lastSeen` heartbeat).
    const unsubscribe = useDog.subscribe((s, prev) => {
      if (applyingRemote) return
      if (
        s.name === prev.name &&
        s.meters === prev.meters &&
        s.appearance === prev.appearance
      )
        return
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
    })

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(timer)
        void save()
      } else if (useAuth.getState().session) {
        void save().then(pull) // flush first, then pick up changes from other devices
      }
    }
    const onOnline = () => {
      if (dirty) void save()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      sub.subscription.unsubscribe()
      unsubscribe()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
