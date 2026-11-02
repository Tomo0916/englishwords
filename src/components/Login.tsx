import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

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
 * ログイン／はじめての登録。
 * 登録するとログインした状態になり、App 側で申請する（先生が受付中なら自動承認、停止中なら承認待ち）
 */
export function Login() {
  const [tab, setTab] = useState<'login' | 'signup'>('login')
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
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
      if (error) {
        if (/registered|exists/i.test(error.message))
          return setMsg('このメールアドレスはすでに登録されています。「ログイン」から入ってください。')
        throw error
      }
      if (!data.session) return setMsg('確認メールを送りました。メールのリンクを開いてから、ログインしてください。')
      // ログインできたら、App 側で登録の申請（受付中なら自動承認）をする
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
      <p className="fine">この単語帳をお持ちの方のみ、先生の承認を受けてご利用いただけます。</p>
    </div>
  )
}

/** 登録したが、まだ先生の承認を待っている人の画面（承認されたら自動で先へ進む） */
export function WaitApproval({ email, onApproved }: { email: string; onApproved: () => void }) {
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState('')

  const check = useCallback(async () => {
    if (!supabase) return
    setChecking(true)
    const { data } = await supabase.rpc('request_join')
    setChecking(false)
    setCheckedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
    if (data === 'approved') onApproved()
  }, [onApproved])

  // 画面を開いている間は15秒ごとに確かめる
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void check(), 15000)
    return () => clearInterval(t)
  }, [check])

  if (!supabase) return null
  const sb = supabase
  return (
    <div className="login">
      <Logo />
      <div className="wait-box">
        <p className="wait-title">登録を受け付けました</p>
        <p>先生が登録を確認するので、お待ちください。</p>
        <p>承認されない場合は、先生に知らせてください。</p>
        <p className="fine">登録したメールアドレス：{email}</p>
      </div>
      <button className="primary wide" disabled={checking} onClick={() => void check()}>
        {checking ? '確認中…' : '承認されたか確かめる'}
      </button>
      <p className="fine center-text">承認されると、この画面は自動で切り替わります{checkedAt && `（${checkedAt} に確認）`}</p>
      <button className="link" onClick={() => void sb.auth.signOut()}>
        別のアカウントでログインする
      </button>
    </div>
  )
}
