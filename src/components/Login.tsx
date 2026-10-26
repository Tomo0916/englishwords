import { useState } from 'react'
import { supabase } from '../supabase'

/** メールアドレス＋パスワードでログイン（アカウントは管理者が Supabase で作成） */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div className="login">
      <div className="logo">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={72} height={72} />
        <h1>英単語1400</h1>
        <p>単語帳と連動して覚える</p>
      </div>
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
      {msg && <p className="error">{msg}</p>}
      <p className="fine">この単語帳をお持ちの方のみ、招待制でご利用いただけます。</p>
    </div>
  )
}
