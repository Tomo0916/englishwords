import { useState } from 'react'
import { wordLabel } from '../quiz'
import { supabase } from '../supabase'
import type { Word } from '../types'

export const REPORT_CATEGORIES = ['意味・訳', '例文', '例文の和訳', '穴埋め・並び替えの答え', '発音・音声', '発音記号・カナ', '活用形・関連語', 'その他'] as const

/** 単語カードの下の「修正リクエスト」ボタンと、送信フォーム */
export function ReportButton({ w, context }: { w: Word; context?: string }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<string>('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)
  if (!supabase) return null
  const sb = supabase

  const close = () => {
    setOpen(false)
    setMsg('')
    if (sent) {
      setSent(false)
      setCategory('')
      setMessage('')
    }
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!category) return setMsg('どこが違うかを選んでください。')
    setBusy(true)
    setMsg('')
    const { error } = await sb.from('reports').insert({ word_id: w.id, category, message: message.trim().slice(0, 1000), context: context ?? null })
    setBusy(false)
    if (error) return setMsg(navigator.onLine ? `送れませんでした：${error.message}` : '電波がないため送れませんでした。つながってからもう一度送ってください。')
    setSent(true)
  }

  return (
    <>
      <button className="report-link" onClick={(e) => (e.stopPropagation(), setOpen(true))}>
        ⚑ 修正リクエスト
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" role="dialog" aria-label="修正リクエスト" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <div className="sheet-done">
                <p className="wait-title">送りました。ありがとう！</p>
                <p className="fine">先生が確認して、必要なら直します。</p>
                <button className="primary wide" onClick={close}>
                  閉じる
                </button>
              </div>
            ) : (
              <form onSubmit={send}>
                <h3>修正リクエスト</h3>
                <p className="fine">
                  {wordLabel(w)}　<b lang="en">{w.word}</b>　の、おかしいと思うところを先生に知らせます。
                </p>
                <div className="seg report-cats">
                  {REPORT_CATEGORIES.map((c) => (
                    <button type="button" key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <label>
                  くわしく（任意）：どう違うか、本ではどうなっているか など
                  <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
                </label>
                {msg && <p className="error">{msg}</p>}
                <div className="row">
                  <button type="button" className="ghost" onClick={close}>
                    やめる
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? '送信中…' : '送る'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
