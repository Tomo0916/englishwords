import { useSyncExternalStore } from 'react'
import { getProgress, setLevel, subscribe } from '../progress'
import { cleanForm, highlightJa, wordLabel } from '../quiz'
import { playExample, playWord } from '../speech'
import type { Level, Word } from '../types'

const WARN: Record<string, string> = { accent: 'アクセント', pronunciation: '発音', usage: '語法', polysemy: '多義' }

export function useProgress(id: number) {
  return useSyncExternalStore(subscribe, () => getProgress(id))
}

export function Checks({ id }: { id: number }) {
  const p = useProgress(id)
  const level = p?.level ?? 0
  return (
    <div className="checks" role="group" aria-label="習熟度">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          className={`check ${level >= n ? 'on' : ''}`}
          aria-pressed={level >= n}
          aria-label={`チェック${n}`}
          onClick={(e) => {
            e.stopPropagation()
            setLevel(id, (level >= n ? n - 1 : n) as Level)
          }}
        />
      ))}
    </div>
  )
}

/** 単語（kind="word"）または例文（kind="example"）を再生するボタン */
export function SpeakButton({ w, kind = 'word', withJa = true, label }: { w: Word; kind?: 'word' | 'example'; withJa?: boolean; label?: string }) {
  return (
    <button
      className="speak"
      aria-label={label ?? (kind === 'word' ? '発音を再生' : '例文を再生')}
      onClick={(e) => {
        e.stopPropagation()
        void (kind === 'word' ? playWord(w, withJa) : playExample(w, withJa))
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export function WordCard({ w, compact = false }: { w: Word; compact?: boolean }) {
  const [pre, ans, post] = w.example ? highlightJa(w.example.ja, w.example.answer) : ['', '', '']
  return (
    <article className="card">
      <header className="card-head">
        <div className="card-no">
          <span>{wordLabel(w)}</span>
          {w.mainId && <span>本編 No.{w.mainId}</span>}
          <span className="page">p.{w.page}</span>
        </div>
        <Checks id={w.id} />
      </header>
      <div className="headword">
        <h2 lang="en">{w.word}</h2>
        <SpeakButton w={w} />
      </div>
      <div className="pron">
        {w.ipa && <span className="ipa">[{w.ipa}]</span>}
        <span className="kana">{w.kana}</span>
        {w.warnings.map((k) => (
          <span key={k} className="warn">
            ! {WARN[k] ?? k}
          </span>
        ))}
      </div>
      <ul className="meanings">
        {w.meanings.map((m, i) => (
          <li key={i}>
            <span className="pos">{m.pos}</span>
            {m.ja}
          </li>
        ))}
      </ul>
      {w.note && <p className="note">※ {w.note}</p>}
      {w.forms && (
        <p className="forms">
          <span className="tag">{w.formLabels ? w.formLabels.join('・') : '活用'}</span>
          <span lang="en">{w.forms.map(cleanForm).join(' - ')}</span>
        </p>
      )}
      {w.related.length > 0 && (
        <ul className="related">
          {w.related.map((r, i) => (
            <li key={i}>
              <span className="tag">{r.type === '反' ? '⇔' : r.type}</span>
              {r.pos && <span className="pos small">{r.pos}</span>}
              <span lang="en">{r.en}</span>
              <span className="ja">〔{r.ja}〕</span>
            </li>
          ))}
        </ul>
      )}
      {!compact && w.example && (
        <div className="example">
          <p lang="en" className="ex-en">
            {w.example.en}
            <SpeakButton w={w} kind="example" />
          </p>
          <p className="ex-ja">
            {pre}
            <mark>{ans}</mark>
            {post}
          </p>
        </div>
      )}
      {!compact && w.memo && <p className="memo">MEMO　{w.memo}</p>}
    </article>
  )
}
