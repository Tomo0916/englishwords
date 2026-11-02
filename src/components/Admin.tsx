import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

type Request = { email: string; status: 'pending' | 'rejected'; created_at: string }
type Member = { email: string; note: string | null; is_admin: boolean; created_at: string; last_sign_in_at: string | null; registered: boolean }

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '')
const time = (s: string) => new Date(s).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 紛らわしい文字を使わない仮パスワード */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => chars[n % chars.length]).join('')
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    window.alert(done)
  } catch {
    window.prompt('コピーして使ってください', text)
  }
}

/**
 * 講師用ページ（講師＝管理者だけが開ける）
 * - 新規登録の受付：受付中は登録した生徒を自動承認。停止中は「承認待ち」に入り、ここで手動承認
 * - メンバーの一覧・仮パスワード・利用停止
 */
export function Admin({ me, onBack }: { me: string; onBack: () => void }) {
  const [open, setOpen] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<Request[] | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newNote, setNewNote] = useState('')
  const [showMembers, setShowMembers] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    const [o, r, m] = await Promise.all([supabase.rpc('admin_get_signup'), supabase.rpc('admin_list_requests'), supabase.rpc('admin_list_members')])
    const e = o.error ?? r.error ?? m.error
    if (e) return setErr(e.message)
    setErr('')
    setOpen(!!o.data)
    setRequests(r.data as Request[])
    setMembers(m.data as Member[])
  }, [])

  // 開いている間は10秒ごとに新しい申請を確かめる
  useEffect(() => {
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 10000)
    return () => clearInterval(t)
  }, [load])

  if (!supabase) return null
  const sb = supabase
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true)
    const { error } = await p
    setBusy(false)
    if (error) window.alert(`うまくいきませんでした：${error.message}`)
    await load()
    return !error
  }

  const pending = requests?.filter((r) => r.status === 'pending') ?? []
  const rejected = requests?.filter((r) => r.status === 'rejected') ?? []
  const approve = (emails: string[]) => run(sb.rpc('admin_approve', { p_emails: emails }))

  return (
    <div className="admin">
      <div className="list-top">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2>講師用ページ</h2>
      </div>
      {err && (
        <p className="error">
          読み込めませんでした：{err}
          <br />
          Supabase で supabase/members.sql を実行したか確認してください。
        </p>
      )}

      {/* ---------- 新規登録の受付 ---------- */}
      <section className={`signup-panel ${open ? 'on' : 'off'}`}>
        <div className="signup-state">
          <span className="dot" />
          <div>
            <b>{open == null ? '確認中…' : open ? '新規登録を受付中' : '新規登録は停止中'}</b>
            <p className="fine">
              {open
                ? '登録した生徒はすぐに使えます（自動承認）。授業が終わったら停止してください。'
                : '登録した生徒は「承認待ち」に入ります。下で確認して承認してください。'}
            </p>
          </div>
        </div>
        {open != null &&
          (open ? (
            <button className="stop-btn" disabled={busy} onClick={() => void run(sb.rpc('admin_set_signup', { p_open: false }))}>
              ■ 受付を停止する
            </button>
          ) : (
            <button className="start-btn" disabled={busy} onClick={() => void run(sb.rpc('admin_set_signup', { p_open: true }))}>
              ▶ 新規登録の受付を開始する
            </button>
          ))}
        <p className="fine">
          生徒への案内：アプリ（{location.origin}
          {import.meta.env.BASE_URL}）を開き、「はじめての方」でメールアドレスとパスワードを決めて登録
          <button
            className="link"
            onClick={() =>
              void copy(
                `英単語1400（単語帳アプリ）\n${location.origin}${import.meta.env.BASE_URL}\nこのページを開き、「はじめての方」でメールアドレスとパスワード（自分で決める）を入れて登録してください。`,
                '案内文をコピーしました。',
              )
            }
          >
            案内文をコピー
          </button>
        </p>
      </section>

      {/* ---------- 承認待ち ---------- */}
      <section>
        <div className="section-head">
          <h3>承認待ち（{pending.length}人）</h3>
          {pending.length > 1 && (
            <button
              className="primary small"
              disabled={busy}
              onClick={() => window.confirm(`${pending.length}人をまとめて承認しますか？`) && void approve(pending.map((r) => r.email))}
            >
              全員承認
            </button>
          )}
        </div>
        {requests && pending.length === 0 && <p className="fine">承認待ちの人はいません。</p>}
        <ul className="admin-list">
          {pending.map((r) => (
            <li key={r.email}>
              <div className="row">
                <b className="email">{r.email}</b>
              </div>
              <div className="fine">{time(r.created_at)} に登録</div>
              <div className="row">
                <button className="primary small" disabled={busy} onClick={() => void approve([r.email])}>
                  承認
                </button>
                <button
                  className="ghost danger-text"
                  disabled={busy}
                  onClick={() => window.confirm(`${r.email} を却下しますか？\n（あとから「却下した人」で承認し直せます）`) && void run(sb.rpc('admin_reject', { p_email: r.email }))}
                >
                  却下
                </button>
              </div>
            </li>
          ))}
        </ul>
        {rejected.length > 0 && (
          <details className="rejected">
            <summary>却下した人（{rejected.length}人）</summary>
            <ul className="admin-list">
              {rejected.map((r) => (
                <li key={r.email} className="off">
                  <div className="row">
                    <b className="email">{r.email}</b>
                    <button className="ghost" disabled={busy} onClick={() => void approve([r.email])}>
                      承認し直す
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---------- メンバー ---------- */}
      <section>
        <div className="section-head">
          <h3>メンバー（{members?.length ?? '…'}人）</h3>
          <button className="ghost small" onClick={() => setShowMembers(!showMembers)}>
            {showMembers ? '閉じる' : '一覧を見る'}
          </button>
        </div>
        {showMembers && (
          <>
            <form
              className="admin-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (await run(sb.rpc('admin_add_member', { p_email: newEmail, p_note: newNote }))) {
                  window.alert(`${newEmail} を追加しました。本人がこのメールアドレスで登録すると、すぐに使えます。`)
                  setNewEmail('')
                  setNewNote('')
                }
              }}
            >
              <label>
                メールアドレスで先に追加（家族など）
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoCapitalize="none" />
              </label>
              <label>
                メモ
                <input value={newNote} onChange={(e) => setNewNote(e.target.value)} />
              </label>
              <button className="primary" disabled={busy}>
                追加
              </button>
            </form>
            <ul className="admin-list">
              {members?.map((m) => (
                <li key={m.email}>
                  <div className="row">
                    <b className="email">{m.email}</b>
                    {m.is_admin && <span className="badge">講師</span>}
                    {!m.registered && <span className="badge warn">未登録</span>}
                  </div>
                  <div className="fine">
                    {m.note && `${m.note}・`}
                    {m.last_sign_in_at ? `最終ログイン ${day(m.last_sign_in_at)}` : 'まだログインしていません'}
                  </div>
                  {m.email.toLowerCase() !== me.toLowerCase() && (
                    <div className="row">
                      {m.registered && (
                        <button
                          className="ghost"
                          disabled={busy}
                          onClick={async () => {
                            const pw = tempPassword()
                            if (!window.confirm(`${m.email} のパスワードを、仮のパスワード「${pw}」に変えますか？`)) return
                            if (await run(sb.rpc('admin_reset_password', { p_email: m.email, p_password: pw })))
                              void copy(
                                `仮のパスワード：${pw}\nログイン後、設定画面の「パスワードを変える」で自分のパスワードに変えてください。`,
                                `仮のパスワード「${pw}」を設定し、案内文をコピーしました。本人に伝えてください。`,
                              )
                          }}
                        >
                          仮パスワードを発行
                        </button>
                      )}
                      <button
                        className="ghost danger-text"
                        disabled={busy}
                        onClick={() =>
                          window.confirm(`${m.email} の利用を止めますか？\n（学習記録は残ります。もう一度追加すれば元どおり使えます）`) &&
                          void run(sb.rpc('admin_remove_member', { p_email: m.email }))
                        }
                      >
                        利用を止める
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
