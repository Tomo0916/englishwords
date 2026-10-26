import { supabase } from './supabase'
import type { Level, Progress } from './types'

const KEY = 'progress-v1'
const DIRTY_KEY = 'progress-dirty-v1'
const DAY = 86_400_000

type Store = Record<string, Progress>

let store: Store = load<Store>(KEY, {})
let dirty = new Set<string>(load<string[]>(DIRTY_KEY, []))
const listeners = new Set<() => void>()

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getProgress(id: number | string): Progress | undefined {
  return store[String(id)]
}

export function getAll(): Store {
  return store
}

export function isDue(p: Progress | undefined, now = Date.now()) {
  return !!p && p.due <= now
}

/**
 * 解答結果を記録する（簡易な間隔反復）。
 * - 正解：習熟度+1。ただし遅い正解（slow）は間隔を伸ばしにくい
 * - 不正解：習熟度-2、すぐ再出題
 */
export function record(id: number | string, correct: boolean, slow = false) {
  const k = String(id)
  const now = Date.now()
  const p: Progress = store[k] ?? { level: 0, due: now, interval: 0, correct: 0, wrong: 0, updatedAt: now }
  let { level, interval } = p
  if (correct) {
    level = Math.min(3, level + (slow ? 0 : 1)) as Level
    interval = interval === 0 ? 1 : Math.round(interval * (slow ? 1.3 : 2.5))
    interval = Math.min(interval, 120)
  } else {
    level = Math.max(0, level - 2) as Level
    interval = 0
  }
  store = {
    ...store,
    [k]: {
      level,
      interval,
      due: correct ? now + interval * DAY : now,
      correct: p.correct + (correct ? 1 : 0),
      wrong: p.wrong + (correct ? 0 : 1),
      updatedAt: now,
    },
  }
  dirty.add(k)
  persist()
  scheduleSync()
}

/** 本の □□□ を手動で付ける・外す */
export function setLevel(id: number | string, level: Level) {
  const k = String(id)
  const now = Date.now()
  const p = store[k] ?? { level: 0, due: now, interval: 0, correct: 0, wrong: 0, updatedAt: now }
  store = { ...store, [k]: { ...p, level, updatedAt: now } }
  dirty.add(k)
  persist()
  scheduleSync()
}

export function resetAll() {
  const keys = Object.keys(store)
  store = {}
  keys.forEach((k) => dirty.add(k))
  persist()
}

// ---------- 同期（Supabase の progress テーブル） ----------

let timer: number | undefined
function scheduleSync() {
  if (!supabase) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void sync(), 3000)
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'
let syncState: SyncState = supabase ? 'idle' : 'off'
export const getSyncState = () => syncState

/** サーバーと双方向にマージ（updatedAt が新しい方を採用） */
export async function sync(): Promise<void> {
  if (!supabase || !navigator.onLine) return
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return
  syncState = 'syncing'
  listeners.forEach((l) => l())
  try {
    const { data, error } = await supabase
      .from('progress')
      .select('word_key, data, updated_at')
      .eq('user_id', user.id)
    if (error) throw error
    const merged: Store = { ...store }
    for (const row of data) {
      const remote = row.data as Progress | null
      const local = merged[row.word_key]
      if (!local || (remote && remote.updatedAt > local.updatedAt)) {
        if (remote) merged[row.word_key] = remote
        else delete merged[row.word_key]
        dirty.delete(row.word_key)
      }
    }
    const remoteKeys = new Set(data.map((r) => r.word_key))
    const toPush = [...dirty, ...Object.keys(merged).filter((k) => !remoteKeys.has(k))]
    const uniq = [...new Set(toPush)]
    if (uniq.length) {
      const rows = uniq.map((k) => ({
        user_id: user.id,
        word_key: k,
        data: merged[k] ?? null,
        updated_at: new Date(merged[k]?.updatedAt ?? Date.now()).toISOString(),
      }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e2 } = await supabase.from('progress').upsert(rows.slice(i, i + 500))
        if (e2) throw e2
      }
    }
    store = merged
    dirty = new Set()
    syncState = 'idle'
    persist()
  } catch (e) {
    console.error('sync failed', e)
    syncState = 'error'
    listeners.forEach((l) => l())
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void sync()
  })
}
