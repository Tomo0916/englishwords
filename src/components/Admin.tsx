import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

type Code = { code: string; note: string | null; max_uses: number | null; uses: number; expires_at: string | null; active: boolean; created_at: string }
type Member = { email: string; note: string | null; is_admin: boolean; created_at: string; last_sign_in_at: string | null; registered: boolean }

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')
const appUrl = () => `${location.origin}${import.meta.env.BASE_URL}`

/** 紛らわしい文字を使わない仮パスワード */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => chars[n % chars.length]).join('')
}

function inviteText(c: Code) {
  return [
    '英単語1400（単語帳アプリ）への招待です。',
    '',
    `① このページを開く：${appUrl()}?code=${c.code}`,
    '② 「はじめての方」で、メールアドレスとパスワード（自分で決める）を入れて登録',
    '',
    `招待コード：${c.code}`,
    c.expires_at ? `（${day(c.expires_at)} まで有効）` : '',
  ]
    .filter((l, i, a) => l || a[i - 1])
    .join('\n')
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    window.alert('コピーしました。LINE やメールに貼り付けて送ってください。')
  } catch {
    window.prompt('コピーして使ってください', text)
  }
}

/** 管理者だけが開ける「メンバー管理」画面 */
export function Admin({ me, onBack }: { me: string; onBack: () => void }) {
  const [codes, setCodes] = useState<Code[] | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('40')
  const [days, setDays] = useState('30')
  const [newEmail, setNewEmail] = useState('')
  const [newNote, setNewNote] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    const [c, m] = await Promise.all([supabase.rpc('admin_list_codes'), supabase.rpc('admin_list_members')])
    if (c.error || m.error) return setErr((c.error ?? m.error)!.message)
    setCodes(c.data as Code[])
    setMembers(m.data as Member[])
  }, [])
  useEffect(() => void load(), [load])

  if (!supabase) return null
  const sb = supabase
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) window.alert(`うまくいきませんでした：${error.message}`)
    await load()
    return !error
  }

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await sb.rpc('admin_create_code', {
      p_note: note,
      p_max_uses: maxUses ? Number(maxUses) : null,
      p_days: days ? Number(days) : null,
    })
    if (error) return window.alert(`作れませんでした：${error.message}`)
    setNote('')
    await load()
    window.alert(`招待コード ${data} を作りました。下の一覧の「招待文をコピー」で生徒に送れます。`)
  }

  const now = Date.now()
  const usable = (c: Code) => c.active && (!c.expires_at || Date.parse(c.expires_at) > now) && (c.max_uses == null || c.uses < c.max_uses)

  return (
    <div className="admin">
      <div className="list-top">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2>メンバー管理</h2>
      </div>
      {err && (
        <p className="error">
          読み込めませんでした：{err}
          <br />
          Supabase で supabase/members.sql を実行したか確認してください。
        </p>
      )}

      <section>
        <h3>招待コードを作る</h3>
        <p className="fine">クラスごとに1つ作って配るのがおすすめです。生徒は自分でメールアドレスとパスワードを決めて登録します。</p>
        <form className="admin-form" onSubmit={createCode}>
          <label>
            メモ（例：3年A組）
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            使える人数
            <select value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
              {[1, 5, 10, 20, 40, 100].map((n) => (
                <option key={n} value={n}>
                  {n}人まで
                </option>
              ))}
              <option value="">制限なし</option>
            </select>
          </label>
          <label>
            有効期限
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              {[7, 30, 90].map((n) => (
                <option key={n} value={n}>
                  {n}日間
                </option>
              ))}
              <option value="">期限なし</option>
            </select>
          </label>
          <button className="primary">作る</button>
        </form>
      </section>

      <section>
        <h3>招待コード一覧</h3>
        {codes?.length === 0 && <p className="fine">まだありません。</p>}
        <ul className="admin-list">
          {codes?.map((c) => (
            <li key={c.code} className={usable(c) ? '' : 'off'}>
              <div className="row">
                <b className="code">{c.code}</b>
                <span>{c.note}</span>
              </div>
              <div className="fine">
                {c.uses}
                {c.max_uses != null ? ` / ${c.max_uses}` : ''} 人が使用
                {c.expires_at && `・${day(c.expires_at)} まで`}
                {!c.active && '・停止中'}
                {c.active && !usable(c) && '・使えません（期限か人数）'}
              </div>
              <div className="row">
                {usable(c) && (
                  <button className="ghost" onClick={() => void copy(inviteText(c))}>
                    招待文をコピー
                  </button>
                )}
                <button className="ghost" onClick={() => void run(sb.rpc('admin_set_code_active', { p_code: c.code, p_active: !c.active }))}>
                  {c.active ? '停止する' : '再開する'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>メンバー（{members?.length ?? '…'}人）</h3>
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(sb.rpc('admin_add_member', { p_email: newEmail, p_note: newNote }))) {
              window.alert(`${newEmail} を追加しました。本人には、アプリの「はじめての方」から、このメールアドレスで登録してもらってください（招待コードは空欄でOK）。`)
              setNewEmail('')
              setNewNote('')
            }
          }}
        >
          <label>
            メールアドレスで直接追加（家族など）
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoCapitalize="none" />
          </label>
          <label>
            メモ
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          </label>
          <button className="primary">追加</button>
        </form>
        <ul className="admin-list">
          {members?.map((m) => (
            <li key={m.email}>
              <div className="row">
                <b className="email">{m.email}</b>
                {m.is_admin && <span className="badge">管理者</span>}
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
                      onClick={async () => {
                        const pw = tempPassword()
                        if (!window.confirm(`${m.email} のパスワードを、仮のパスワード「${pw}」に変えますか？\n（本人に伝え、ログイン後に設定画面で変えてもらってください）`)) return
                        if (await run(sb.rpc('admin_reset_password', { p_email: m.email, p_password: pw }))) void copy(`仮のパスワード：${pw}\nログイン後、設定画面の「パスワードを変える」で自分のパスワードに変えてください。`)
                      }}
                    >
                      仮パスワードを発行
                    </button>
                  )}
                  <button
                    className="ghost danger-text"
                    onClick={() => {
                      if (window.confirm(`${m.email} の利用を止めますか？\n（学習記録は残ります。もう一度追加すれば元どおり使えます）`))
                        void run(sb.rpc('admin_remove_member', { p_email: m.email }))
                    }}
                  >
                    利用を止める
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
