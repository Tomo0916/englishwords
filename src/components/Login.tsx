import { useState } from 'react'
import { supabase } from '../supabase'

const PENDING = 'pendingInvite' // 登録直後に使う招待コード（メール確認が必要な設定のとき用）

export const pendingInvite = {
  get: () => {
    try {
      return localStorage.getItem(PENDING) ?? ''
    } catch {
      return ''
    }
  },
  set: (v: string) => {
    try {
      if (v) localStorage.setItem(PENDING, v)
      else localStorage.removeItem(PENDING)
    } catch {
      /* ignore */
    }
  },
}

function Logo() {
  return (
    <div className="logo">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={72} height={72} />
      <h1>英単語1400</h1>
      <p>単語帳と連動して覚える</p>
    </div>
  )
}

/**
 * ログイン／はじめての登録（招待コード）。
 * 登録：招待コードを確かめる → アカウントを作る → コードを使ってメンバーになる
 */
export function Login() {
  const [tab, setTab] = useState<'login' | 'signup'>(() => (new URLSearchParams(location.search).get('code') ? 'signup' : 'login'))
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (!supabase) return null
  const sb = supabase

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg('ログインできませんでした。メールアドレスとパスワードを確認してください。')
  }

  const signup = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    if (password.length < 8) return setMsg('パスワードは8文字以上にしてください。')
    if (password !== password2) return setMsg('確認用のパスワードが一致しません。')
    setBusy(true)
    try {
      const c = code.trim().toUpperCase()
      // コードが空欄なら確認しない（先生がメールアドレスを登録済みの人）
      if (c) {
        const { data: ok, error: e1 } = await sb.rpc('check_invite', { p_code: c })
        if (e1) throw e1
        if (!ok) return setMsg('招待コードが正しくないか、期限切れです。先生に確認してください。')
      }
      pendingInvite.set(c)
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
      if (error) {
        if (/registered|exists/i.test(error.message))
          return setMsg('このメールアドレスはすでに登録されています。「ログイン」から入ってください。')
        throw error
      }
      if (!data.session) return setMsg('確認メールを送りました。メールのリンクを開いてから、ログインしてください。')
      // ログインできたら、App 側で招待コードを使ってメンバーになる
    } catch (err) {
      setMsg(`登録できませんでした：${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <Logo />
      <div className="seg login-tabs">
        <button className={tab === 'login' ? 'on' : ''} onClick={() => (setTab('login'), setMsg(''))}>
          ログイン
        </button>
        <button className={tab === 'signup' ? 'on' : ''} onClick={() => (setTab('signup'), setMsg(''))}>
          はじめての方
        </button>
      </div>
      {tab === 'login' ? (
        <form onSubmit={login}>
          <label>
            メールアドレス
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" />
          </label>
          <label>
            パスワード
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary wide" disabled={busy}>
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      ) : (
        <form onSubmit={signup}>
          <label>
            招待コード（先生から配られた6文字）
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              className="code-input"
              maxLength={12}
            />
            <span className="fine">先生にメールアドレスを登録してもらった人は空欄で大丈夫です</span>
          </label>
          <label>
            メールアドレス
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" />
          </label>
          <label>
            パスワード（8文字以上・自分で決める）
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            パスワード（確認）
            <input type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>
          <button className="primary wide" disabled={busy}>
            {busy ? '登録中…' : '登録してはじめる'}
          </button>
        </form>
      )}
      {msg && <p className="error">{msg}</p>}
      <p className="fine">この単語帳をお持ちの方のみ、招待制でご利用いただけます。</p>
    </div>
  )
}

/** ログインはできたが、まだメンバーになっていない人の画面（招待コードを入れる） */
export function NeedInvite({ email, onDone }: { email: string; onDone: () => void }) {
  const [code, setCode] = useState(pendingInvite.get())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (!supabase) return null
  const sb = supabase

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { data, error } = await sb.rpc('redeem_invite', { p_code: code.trim().toUpperCase() })
    setBusy(false)
    if (error) return setMsg(`うまくいきませんでした：${error.message}`)
    if (!data) return setMsg('招待コードが正しくないか、期限切れです。先生に確認してください。')
    pendingInvite.set('')
    onDone()
  }

  return (
    <div className="login">
      <Logo />
      <p>
        <b>{email}</b> でログインしています。
        <br />
        使いはじめるには、先生から配られた招待コードを入れてください。
      </p>
      <form onSubmit={submit}>
        <label>
          招待コード
          <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" className="code-input" />
        </label>
        <button className="primary wide" disabled={busy}>
          {busy ? '確認中…' : 'はじめる'}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}
      <button className="link" onClick={() => void sb.auth.signOut()}>
        別のアカウントでログインする
      </button>
    </div>
  )
}
