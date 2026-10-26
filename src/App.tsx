import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { Home, type StartOptions } from './components/Home'
import { Login } from './components/Login'
import { Quiz } from './components/Quiz'
import { Result } from './components/Result'
import { WordList } from './components/WordList'
import { loadWords } from './data'
import { resetAll, sync } from './progress'
import { setVocab, shuffle, supports } from './quiz'
import { setSettings, useSettings } from './settings'
import { supabase } from './supabase'
import type { Answer, Mode, Question, Word } from './types'

type View =
  | { kind: 'home' }
  | { kind: 'quiz'; questions: Question[]; mode: Mode | 'mix' }
  | { kind: 'result'; answers: Answer[]; mode: Mode | 'mix' }
  | { kind: 'list'; round: number }
  | { kind: 'settings' }

const ALL_MODES: Mode[] = ['en2ja', 'ja2en', 'cloze', 'order', 'spell', 'forms']

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [words, setWords] = useState<Word[] | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>({ kind: 'home' })
  const settings = useSettings()

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const canLoad = !supabase || !!session
  useEffect(() => {
    if (!canLoad) return
    loadWords()
      .then((ws) => (setVocab(ws), setWords(ws)))
      .catch((e) => setError(String(e?.message ?? e)))
    void sync()
  }, [canLoad])

  const byId = useMemo(() => new Map((words ?? []).map((w) => [w.id, w])), [words])

  const start = ({ mode, ids }: StartOptions) => {
    const ws = shuffle(ids.map((id) => byId.get(id)!).filter(Boolean)).slice(0, settings.count)
    const questions = ws.map((w) => {
      if (mode !== 'mix') return { word: w, mode }
      const ok = ALL_MODES.filter((m) => supports(w, m) && m !== 'forms')
      return { word: w, mode: ok[Math.floor(Math.random() * ok.length)] ?? 'en2ja' }
    })
    if (questions.length) setView({ kind: 'quiz', questions, mode })
  }

  if (!authReady) return <div className="center">読み込み中…</div>
  if (supabase && !session) return <Login />

  return (
    <div className="app">
      {view.kind !== 'quiz' && (
        <header className="topbar">
          <button className="brand" onClick={() => setView({ kind: 'home' })}>
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
            英単語1400
          </button>
          <button className="ghost" onClick={() => setView({ kind: 'settings' })} aria-label="設定">
            ⚙
          </button>
        </header>
      )}
      <main>
        {error && <p className="error">単語データを読み込めませんでした：{error}</p>}
        {!words && !error && <div className="center">単語データを読み込み中…</div>}
        {words && view.kind === 'home' && <Home words={words} onStart={start} onList={(round) => setView({ kind: 'list', round })} />}
        {words && view.kind === 'quiz' && (
          <Quiz
            questions={view.questions}
            pool={words}
            onFinish={(answers) => setView({ kind: 'result', answers, mode: view.mode })}
            onQuit={(answers) => setView(answers.length ? { kind: 'result', answers, mode: view.mode } : { kind: 'home' })}
          />
        )}
        {view.kind === 'result' && (
          <Result answers={view.answers} onHome={() => setView({ kind: 'home' })} onAgainWrong={(ids) => start({ mode: view.mode, ids })} />
        )}
        {words && view.kind === 'list' && <WordList words={words} round={view.round} onBack={() => setView({ kind: 'home' })} />}
        {view.kind === 'settings' && (
          <div className="settings">
            <h2>設定</h2>
            <label className="toggle">
              <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => setSettings({ autoSpeak: e.target.checked })} />
              発音を自動で再生する
            </label>
            <label>
              4択の制限時間
              <select value={settings.timeLimit} onChange={(e) => setSettings({ timeLimit: Number(e.target.value) })}>
                <option value={0}>なし</option>
                {[2, 3, 4, 5, 8].map((s) => (
                  <option key={s} value={s}>
                    {s}秒
                  </option>
                ))}
              </select>
            </label>
            <label>
              これより遅い正解は「うろ覚え」扱い
              <select value={settings.slowSec} onChange={(e) => setSettings({ slowSec: Number(e.target.value) })}>
                {[3, 5, 8, 15].map((s) => (
                  <option key={s} value={s}>
                    {s}秒
                  </option>
                ))}
              </select>
            </label>
            {session && (
              <p className="fine">
                ログイン中：{session.user.email}
                <button className="link" onClick={() => supabase?.auth.signOut()}>
                  ログアウト
                </button>
              </p>
            )}
            <button
              className="danger"
              onClick={() => {
                if (window.confirm('学習記録をすべて消去します。よろしいですか？')) resetAll()
              }}
            >
              学習記録をリセット
            </button>
            <button className="ghost" onClick={() => setView({ kind: 'home' })}>
              ← 戻る
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
