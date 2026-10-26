import { useSyncExternalStore } from 'react'

export interface Settings {
  autoSpeak: boolean
  /** 4択の制限時間（秒）。0 で無制限 */
  timeLimit: number
  count: number
  /** この秒数を超えた正解は「うろ覚え」扱い */
  slowSec: number
}

const KEY = 'settings-v1'
const DEFAULTS: Settings = { autoSpeak: true, timeLimit: 0, count: 20, slowSec: 5 }

let current: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
})()
const ls = new Set<() => void>()

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
  ls.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      ls.add(cb)
      return () => ls.delete(cb)
    },
    () => current,
  )
}
