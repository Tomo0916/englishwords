import { useState } from 'react'
import { supabase } from '../supabase'

/** メールで届く6桁コード（またはリンク）でログイン。パスワード不要 */
export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (!supabase) return null
  const sb = supabase

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.href },
    })
    setBusy(false)
    if (error) setMsg('送信できませんでした。招待されたメールアドレスか確認してください。')
    else setSent(true)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg('コードが正しくないか、期限切れです。')
  }

  return (
    <div className="login">
      <div className="logo">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={72} height={72} />
        <h1>英単語1400</h1>
        <p>単語帳と連動して覚える</p>
      </div>
      {!sent ? (
        <form onSubmit={send}>
          <label>
            メールアドレス
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button className="primary wide" disabled={busy}>
            ログインコードを送る
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p>{email} にメールを送りました。届いたコードを入力するか、メール内のリンクを開いてください。</p>
          <label>
            コード
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="primary wide" disabled={busy || code.trim().length < 6}>
            ログイン
          </button>
          <button type="button" className="link" onClick={() => setSent(false)}>
            メールアドレスを変える
          </button>
        </form>
      )}
      {msg && <p className="error">{msg}</p>}
      <p className="fine">この単語帳をお持ちの方のみ、招待制でご利用いただけます。</p>
    </div>
  )
}
