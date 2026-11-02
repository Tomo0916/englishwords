import { useEffect, useRef, useState } from 'react'
import { cachedCount, saveWords } from '../speech'
import type { Word } from '../types'

/** 1ファイルあたりのおおよその大きさ（MB） */
const MB_PER_FILE = 0.03

type WakeLock = { release: () => Promise<void> }

/**
 * 音声をまとめて端末に保存するボタン（単語一覧の ROUND ごと／設定画面の全単語）。
 * 保存済みのものは飛ばすので、途中で止めても次は続きから。
 */
export function SaveAudio({ list, label, detail = false }: { list: Word[]; label: string; detail?: boolean }) {
  const [state, setState] = useState<{ done: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const stop = useRef(false)

  useEffect(() => {
    let alive = true
    stop.current = false
    void cachedCount(list).then((c) => alive && setState(c))
    return () => {
      alive = false
      stop.current = true
    }
  }, [list])

  if (!state) return detail ? <p className="fine">保存状況を確認中…</p> : null
  if (state.total === 0) return null
  const all = state.done >= state.total
  const restMb = Math.max(1, Math.round((state.total - state.done) * MB_PER_FILE))

  const start = async () => {
    stop.current = false
    setSaving(true)
    // 保存中は画面が消えないようにする（対応端末のみ）。画面が消えると途中で止まるため
    let lock: WakeLock | null = null
    try {
      lock = (await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock?.request('screen')) ?? null
    } catch {
      lock = null
    }
    try {
      setState(await saveWords(list, (done, total) => setState({ done, total }), () => stop.current))
    } finally {
      setSaving(false)
      void lock?.release().catch(() => {})
    }
  }

  return (
    <div className="save-bar">
      <span className="fine">
        音声 {all ? 'すべて端末に保存済み' : `${state.done.toLocaleString()} / ${state.total.toLocaleString()} 件を保存済み`}
        {saving && state.total > 0 && `（${Math.floor((state.done / state.total) * 100)}%）`}
      </span>
      {!all &&
        (saving ? (
          <button className="ghost" onClick={() => (stop.current = true)}>
            止める
          </button>
        ) : (
          <button className="ghost" onClick={() => void start()}>
            {label}（約{restMb}MB）
          </button>
        ))}
      {detail && saving && <p className="fine">保存中はアプリを開いたままにしてください。止めても、次は続きから保存します。</p>}
    </div>
  )
}
