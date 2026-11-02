import type { Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { Home, type StartOptions } from './components/Home'
import { Admin } from './components/Admin'
import { Login, WaitApproval } from './components/Login'
import { ChangePassword } from './components/ChangePassword'
import { Quiz } from './components/Quiz'
import { Result } from './components/Result'
import { WordList } from './components/WordList'
import { loadWords } from './data'
import { resetAll, sync } from './progress'
import { setVocab, shuffle, supports } from './quiz'
import { setSettings, useSettings } from './settings'
import { SaveAudio } from './components/SaveAudio'
import { availableVoices, clearAudioCache, playWord } from './speech'
import { displayName } from './account'
import { supabase } from './supabase'
import type { Answer, Mode, Question, Word } from './types'

/** 端末に保存されているログイン（Supabase が保存したもの）。電波がないときの起動用 */
function savedSession(): Session | null {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null') as Session | null
    return s?.refresh_token && s.user ? s : null
  } catch {
    return null
  }
}

/** ブラウザに「このサイトの保存データを勝手に消さないで」と頼む（対応ブラウザのみ） */
async function keepStorage() {
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* ignore */
  }
}

type MemberState = { allowed: boolean; admin: boolean }
const MEMBER_KEY = 'member-cache'
function readMemberCache(uid: string): MemberState | null {
  try {
    const c = JSON.parse(localStorage.getItem(MEMBER_KEY) ?? 'null') as (MemberState & { uid: string }) | null
    return c?.uid === uid ? { allowed: c.allowed, admin: c.admin } : null
  } catch {
    return null
  }
}
function writeMemberCache(uid: string, m: MemberState) {
  try {
    localStorage.setItem(MEMBER_KEY, JSON.stringify({ uid, ...m }))
  } catch {
    /* ignore */
  }
}

type View =
  | { kind: 'home' }
  | { kind: 'quiz'; questions: Question[]; mode: Mode | 'mix' }
  | { kind: 'result'; answers: Answer[]; mode: Mode | 'mix' }
  | { kind: 'list'; round: number }
  | { kind: 'settings' }
  | { kind: 'admin' }

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
    const sb = supabase
    // 電波が弱いとログインの更新に時間がかかるので、3秒待っても終わらなければ保存済みのログインで先に開く
    const timer = setTimeout(() => {
      const saved = savedSession()
      if (saved) {
        setSession((cur) => cur ?? saved)
        setAuthReady(true)
      }
    }, 3000)
    sb.auth.getSession().then(({ data }) => {
      clearTimeout(timer)
      // 電波がなく、ログインの更新ができなかっただけなら、保存済みのログインで続ける（ログイン画面を出さない）
      setSession(data.session ?? savedSession())
      setAuthReady(true)
    })
    const { data } = sb.auth.onAuthStateChange((e, s) => {
      // 通信の失敗でログインが外れたように見えても、保存済みのログインがあれば保つ（本当のログアウト時だけ外す）
      setSession(s ?? (e === 'SIGNED_OUT' ? null : savedSession()))
      if (s) void keepStorage()
    })
    // 電波が戻ったらログインを更新し、学習記録を同期する
    const online = () => void sb.auth.refreshSession().then(() => sync())
    window.addEventListener('online', online)
    return () => {
      clearTimeout(timer)
      data.subscription.unsubscribe()
      window.removeEventListener('online', online)
    }
  }, [])

  // メンバー（許可リストに入っている）か・講師か。まだなら登録を申請する（受付中なら自動承認）
  const [member, setMember] = useState<{ allowed: boolean; admin: boolean } | null>(null)
  const [recheck, setRecheck] = useState(0)
  const uid = session?.user.id
  useEffect(() => {
    if (!supabase || !uid) return setMember(null)
    const sb = supabase
    let alive = true
    // 前回の確認結果があれば、まずそれで開く（電波が弱くても待たせない）。確認できたら更新
    const cached = readMemberCache(uid)
    if (cached?.allowed) setMember(cached)
    void (async () => {
      const r = await sb.rpc('is_allowed')
      if (r.error && cached) return // 確認できなかったら前回の結果のまま
      let allowed = r.error ? true : !!r.data // 確認できないときは通す（データ自体は RLS で守られている）
      if (!allowed) {
        const j = await sb.rpc('request_join')
        allowed = j.data === 'approved'
      }
      const a = await sb.rpc('is_admin')
      const m = { allowed, admin: !a.error && !!a.data }
      if (!r.error) writeMemberCache(uid, m)
      if (alive) setMember(m)
    })()
    return () => {
      alive = false
    }
  }, [uid, recheck])

  const canLoad = !supabase || (!!session && !!member?.allowed)
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
  if (supabase && !member) return <div className="center">読み込み中…</div>
  if (supabase && session && member && !member.allowed) return <WaitApproval email={session.user.email ?? ''} onApproved={() => setRecheck((n) => n + 1)} />

  return (
    <div className="app">
      {view.kind !== 'quiz' && (
        <header className="topbar">
          <button className="brand" onClick={() => setView({ kind: 'home' })}>
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
            英単語1400
          </button>
          {member?.admin && (
            <button className="ghost teacher-btn" onClick={() => setView({ kind: 'admin' })}>
              講師
            </button>
          )}
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
        {view.kind === 'admin' && session && <Admin me={session.user.email ?? ''} onBack={() => setView({ kind: 'home' })} />}
        {view.kind === 'settings' && (
          <div className="settings">
            <h2>設定</h2>
            <label className="toggle">
              <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => setSettings({ autoSpeak: e.target.checked })} />
              発音を自動で再生する
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.readJa} onChange={(e) => setSettings({ readJa: e.target.checked })} />
              英語のあとに日本語（意味・和訳）も読む
            </label>
            <div className="voice-pick">
              <span>声</span>
              <div className="seg">
                {availableVoices().map((v) => (
                  <button
                    key={v.key}
                    className={settings.voice === v.key ? 'on' : ''}
                    onClick={() => {
                      setSettings({ voice: v.key })
                      const sample = words?.find((w) => w.id === 2)
                      if (sample) void playWord(sample)
                    }}
                  >
                    {v.label}
                    {!v.ready && '（準備中）'}
                  </button>
                ))}
              </div>
              <p className="fine">準備中の声は、端末の標準の読み上げで代用します。</p>
            </div>
            {words && (
              <div className="save-all">
                <span>音声の保存</span>
                <p className="fine">Wi-Fi のときに保存しておくと、どの単語もすぐに鳴り、電波がなくても使えます（いま選んでいる声のみ）。</p>
                <SaveAudio key={settings.voice} list={words} label="全単語の音声を保存" detail />
              </div>
            )}
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
            {session && <ChangePassword />}
            {member?.admin && (
              <button className="ghost" onClick={() => setView({ kind: 'admin' })}>
                講師用ページ
              </button>
            )}
            {session && (
              <p className="fine">
                ログイン中：{displayName(session.user.email)}
                <button className="link" onClick={() => supabase?.auth.signOut()}>
                  ログアウト
                </button>
              </p>
            )}
            <button className="ghost" onClick={() => void clearAudioCache().then(() => window.alert('端末に保存した音声を消去しました'))}>
              保存した音声を消去
            </button>
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
