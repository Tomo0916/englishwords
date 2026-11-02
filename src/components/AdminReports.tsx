import { useCallback, useEffect, useState } from 'react'
import { displayName } from '../account'
import { meaningText, wordLabel } from '../quiz'
import { supabase } from '../supabase'
import type { Word } from '../types'

type Report = {
  id: number
  word_id: number
  email: string
  category: string
  message: string
  context: string | null
  status: 'open' | 'done' | 'dismissed'
  created_at: string
}

const time = (s: string) => new Date(s).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const STATUS: Record<Report['status'], string> = { open: '未対応', done: '対応済み', dismissed: '対応しない' }

/** 講師用ページ：生徒からの修正リクエスト */
export function AdminReports({ words }: { words: Word[] | null }) {
  const [list, setList] = useState<Report[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const byId = new Map((words ?? []).map((w) => [w.id, w]))

  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('admin_list_reports', { p_status: showAll ? null : 'open' })
    if (!error) setList(data as Report[])
  }, [showAll])
  useEffect(() => {
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30000)
    return () => clearInterval(t)
  }, [load])

  if (!supabase) return null
  const sb = supabase
  const setStatus = async (ids: number[], status: Report['status']) => {
    setBusy(true)
    const { error } = await sb.rpc('admin_set_report_status', { p_ids: ids, p_status: status })
    setBusy(false)
    if (error) window.alert(`うまくいきませんでした：${error.message}`)
    await load()
  }

  const open = list?.filter((r) => r.status === 'open') ?? []

  /** Claude にそのまま渡せる形でコピー */
  const copyOpen = async () => {
    const text = [
      `英単語1400 修正リクエスト（未対応 ${open.length}件）`,
      ...open.map((r) => {
        const w = byId.get(r.word_id)
        return [
          `■ ${w ? wordLabel(w) : `No.${r.word_id}`} ${w?.word ?? ''}（p.${w?.page ?? '?'}）`,
          `  種類：${r.category}${r.context ? `（${r.context}）` : ''}`,
          r.message ? `  内容：${r.message.replace(/\n/g, ' ')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      }),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      window.alert('コピーしました。Claude に貼り付けて「本で確認して直して」と頼めます。')
    } catch {
      window.prompt('コピーして使ってください', text)
    }
  }

  return (
    <section>
      <div className="section-head">
        <h3>修正リクエスト（未対応 {list ? open.length : '…'}件）</h3>
        <button className="ghost small" onClick={() => setShowAll(!showAll)}>
          {showAll ? '未対応だけ' : '対応済みも見る'}
        </button>
      </div>
      {open.length > 0 && (
        <div className="row">
          <button className="ghost small" onClick={() => void copyOpen()}>
            未対応をまとめてコピー（Claude に送る用）
          </button>
        </div>
      )}
      {list && list.length === 0 && <p className="fine">{showAll ? 'まだありません。' : '未対応のリクエストはありません。'}</p>}
      <ul className="admin-list">
        {list?.map((r) => {
          const w = byId.get(r.word_id)
          return (
            <li key={r.id} className={r.status === 'open' ? '' : 'off'}>
              <div className="row">
                <b>
                  {w ? wordLabel(w) : `No.${r.word_id}`}　<span lang="en">{w?.word}</span>
                </b>
                <span className="badge warn">{r.category}</span>
                {r.status !== 'open' && <span className="badge">{STATUS[r.status]}</span>}
              </div>
              {w && (
                <div className="fine">
                  p.{w.page}　{meaningText(w)}
                </div>
              )}
              {r.message && <p className="report-msg">{r.message}</p>}
              <div className="fine">
                {displayName(r.email)}・{time(r.created_at)}
                {r.context && `・${r.context}`}
              </div>
              <div className="row">
                {r.status === 'open' ? (
                  <>
                    <button className="primary small" disabled={busy} onClick={() => void setStatus([r.id], 'done')}>
                      対応済み
                    </button>
                    <button className="ghost" disabled={busy} onClick={() => void setStatus([r.id], 'dismissed')}>
                      対応しない
                    </button>
                  </>
                ) : (
                  <button className="ghost" disabled={busy} onClick={() => void setStatus([r.id], 'open')}>
                    未対応に戻す
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
