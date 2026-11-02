import { useState } from 'react'
import { supabase } from '../supabase'

/** 設定画面：自分のパスワードを変える（仮パスワードをもらった人もここで変える） */
export function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (!supabase) return null
  const sb = supabase

  if (!open)
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        パスワードを変える
      </button>
    )

  return (
    <form
      className="admin-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setMsg('')
        if (pw.length < 8) return setMsg('8文字以上にしてください。')
        if (pw !== pw2) return setMsg('確認用のパスワードが一致しません。')
        setBusy(true)
        const { error } = await sb.auth.updateUser({ password: pw })
        setBusy(false)
        if (error) return setMsg(`変えられませんでした：${error.message}`)
        setPw('')
        setPw2('')
        setOpen(false)
        window.alert('パスワードを変えました。')
      }}
    >
      <label>
        新しいパスワード（8文字以上）
        <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </label>
      <label>
        新しいパスワード（確認）
        <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </label>
      {msg && <p className="error">{msg}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>
          {busy ? '変更中…' : '変更する'}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          やめる
        </button>
      </div>
    </form>
  )
}
