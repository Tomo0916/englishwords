import { useMemo, useState } from 'react'
import { meaningText } from '../quiz'
import type { Word } from '../types'
import { Checks, SpeakButton, WordCard } from './WordCard'

export function WordList({ words, round, onBack }: { words: Word[]; round: number; onBack: () => void }) {
  const list = useMemo(() => words.filter((w) => w.round === round), [words, round])
  const [hide, setHide] = useState(true) // 赤シートモード
  const [open, setOpen] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  return (
    <div className="list">
      <div className="list-top">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2>ROUND {round}</h2>
        <label className="toggle">
          <input type="checkbox" checked={hide} onChange={(e) => (setHide(e.target.checked), setRevealed(new Set()))} />
          赤シート
        </label>
      </div>
      <ul>
        {list.map((w) => (
          <li key={w.id} className={open === w.id ? 'open' : ''}>
            <div className="list-row" onClick={() => setOpen(open === w.id ? null : w.id)}>
              <span className="no">{w.id}</span>
              <span className="en" lang="en">
                {w.word}
              </span>
              <SpeakButton text={w.word} />
              <span
                className={`ja ${hide && !revealed.has(w.id) ? 'sheet' : ''}`}
                onClick={(e) => {
                  if (!hide) return
                  e.stopPropagation()
                  setRevealed(new Set(revealed).add(w.id))
                }}
              >
                {meaningText(w)}
              </span>
              <Checks id={w.id} />
            </div>
            {open === w.id && <WordCard w={w} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
