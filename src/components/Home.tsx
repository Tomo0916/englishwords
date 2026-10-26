import { useMemo, useState, useSyncExternalStore } from 'react'
import { getAll, getSyncState, isDue, subscribe } from '../progress'
import { MODE_LABEL, supports } from '../quiz'
import { setSettings, useSettings } from '../settings'
import type { Mode, Word } from '../types'

export type Filter = 'all' | 'due' | 'weak' | 'new'

export interface StartOptions {
  mode: Mode | 'mix'
  ids: number[]
}

const FILTER_LABEL: Record<Filter, string> = {
  all: 'すべて',
  due: '復習時期',
  weak: '苦手（□0〜1）',
  new: '未学習',
}

const MODES: (Mode | 'mix')[] = ['en2ja', 'ja2en', 'cloze', 'order', 'spell', 'forms', 'mix']

export function Home({ words, onStart, onList }: { words: Word[]; onStart: (o: StartOptions) => void; onList: (round: number) => void }) {
  const settings = useSettings()
  const progress = useSyncExternalStore(subscribe, getAll)
  const sync = useSyncExternalStore(subscribe, getSyncState)
  const rounds = useMemo(() => [...new Set(words.map((w) => w.round))].sort((a, b) => a - b), [words])
  const [round, setRound] = useState<number | 'all'>(rounds[0] ?? 'all')
  const [set, setSet] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [mode, setMode] = useState<Mode | 'mix'>('en2ja')

  const inRound = useMemo(() => words.filter((w) => round === 'all' || w.round === round), [words, round])
  const sets = useMemo(() => {
    const ids = inRound.map((w) => w.id)
    const out: { key: number; from: number; to: number }[] = []
    for (let i = 0; i < ids.length; i += 10) out.push({ key: i / 10, from: ids[i], to: ids[Math.min(i + 9, ids.length - 1)] })
    return out
  }, [inRound])

  const now = Date.now()
  const target = useMemo(() => {
    let ws = inRound
    if (set !== 'all') ws = ws.slice(set * 10, set * 10 + 10)
    ws = ws.filter((w) => {
      const p = progress[String(w.id)]
      if (filter === 'due') return isDue(p, now)
      if (filter === 'weak') return !p || p.level <= 1
      if (filter === 'new') return !p
      return true
    })
    return ws.filter((w) => (mode === 'mix' ? true : supports(w, mode)))
  }, [inRound, set, filter, mode, progress, now])

  const dueCount = words.filter((w) => isDue(progress[String(w.id)], now)).length
  const learned = words.filter((w) => (progress[String(w.id)]?.level ?? 0) >= 3).length
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const today = Object.values(progress).filter((p) => p.updatedAt >= todayStart).length

  return (
    <div className="home">
      <section className="stats">
        <div>
          <b>{learned}</b>
          <span>覚えた（□□□）</span>
        </div>
        <div>
          <b>{dueCount}</b>
          <span>復習待ち</span>
        </div>
        <div>
          <b>{today}</b>
          <span>今日学習</span>
        </div>
      </section>
      {sync !== 'off' && <p className={`sync ${sync}`}>{sync === 'syncing' ? '同期中…' : sync === 'error' ? '同期に失敗（オフライン？）' : '同期済み'}</p>}

      {dueCount > 0 && (
        <button
          className="primary wide due-btn"
          onClick={() => onStart({ mode: 'en2ja', ids: words.filter((w) => isDue(progress[String(w.id)], now)).slice(0, settings.count).map((w) => w.id) })}
        >
          今日の復習 {Math.min(dueCount, settings.count)}語を始める
        </button>
      )}

      <h3>範囲</h3>
      <div className="seg scroll">
        <button className={round === 'all' ? 'on' : ''} onClick={() => (setRound('all'), setSet('all'))}>
          全体
        </button>
        {rounds.map((r) => (
          <button key={r} className={round === r ? 'on' : ''} onClick={() => (setRound(r), setSet('all'))}>
            R{r}
          </button>
        ))}
      </div>
      {round !== 'all' && (
        <div className="seg scroll small">
          <button className={set === 'all' ? 'on' : ''} onClick={() => setSet('all')}>
            ROUND全体
          </button>
          {sets.map((s) => (
            <button key={s.key} className={set === s.key ? 'on' : ''} onClick={() => setSet(s.key)}>
              {s.from}–{s.to}
            </button>
          ))}
        </div>
      )}
      <RoundMeter words={inRound} progress={progress} />
      {round !== 'all' && (
        <button className="link" onClick={() => onList(round)}>
          ROUND {round} の単語一覧を見る →
        </button>
      )}

      <h3>出題</h3>
      <div className="seg">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <h3>学習モード</h3>
      <div className="modes">
        {MODES.map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'mix' ? 'ミックス' : MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="start">
        <label>
          出題数
          <select value={settings.count} onChange={(e) => setSettings({ count: Number(e.target.value) })}>
            {[10, 20, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={!target.length} onClick={() => onStart({ mode, ids: target.map((w) => w.id) })}>
          {target.length ? `スタート（対象 ${target.length}語）` : '対象の単語がありません'}
        </button>
      </div>
    </div>
  )
}

function RoundMeter({ words, progress }: { words: Word[]; progress: ReturnType<typeof getAll> }) {
  const counts = [0, 0, 0, 0]
  let none = 0
  for (const w of words) {
    const p = progress[String(w.id)]
    if (!p) none++
    else counts[p.level]++
  }
  const total = words.length || 1
  const seg = [
    { n: counts[3], c: 'l3', label: '□□□' },
    { n: counts[2], c: 'l2', label: '□□' },
    { n: counts[1], c: 'l1', label: '□' },
    { n: counts[0], c: 'l0', label: '要復習' },
    { n: none, c: 'ln', label: '未学習' },
  ]
  return (
    <div className="meter-wrap">
      <div className="meter">
        {seg.map((s) => s.n > 0 && <div key={s.c} className={s.c} style={{ width: `${(s.n / total) * 100}%` }} />)}
      </div>
      <div className="meter-legend">
        {seg.map((s) => (
          <span key={s.c}>
            <i className={s.c} />
            {s.label} {s.n}
          </span>
        ))}
      </div>
    </div>
  )
}
