import { useEffect, useMemo, useState } from 'react'
import { meaningText } from '../quiz'
import { prefetchWords } from '../speech'
import type { Word } from '../types'
import { SaveAudio } from './SaveAudio'
import { Checks, SpeakButton, WordCard } from './WordCard'

export function WordList({ words, round, onBack }: { words: Word[]; round: number; onBack: () => void }) {
  const list = useMemo(() => words.filter((w) => w.round === round), [words, round])
  const [hide, setHide] = useState(true) // 赤シートモード
  const [open, setOpen] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

  // 一覧の単語の発音（英語・意味）を裏で先読み
  useEffect(() => {
    void prefetchWords(list, ['w', 'wj'])
  }, [list])

  return (
    <div className="list">
      <ListTop round={round} onBack={onBack} hide={hide} setHide={(v) => (setHide(v), setRevealed(new Set()))} />
      <SaveAudio list={list} label={round === 13 ? 'この付録の音声を保存' : 'この ROUND の音声を保存'} />

      <ul>
        {list.map((w) => (
          <li key={w.id} className={open === w.id ? 'open' : ''}>
            <div className="list-row" onClick={() => setOpen(open === w.id ? null : w.id)}>
              <span className="no">{round === 13 ? (w.category ?? '').slice(0, 2) : w.id}</span>
              <span className="en" lang="en">
                {w.word}
              </span>
              <SpeakButton w={w} />
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
            {open === w.id && <WordCard w={w} context="単語一覧" />}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ListTop({ round, onBack, hide, setHide }: { round: number; onBack: () => void; hide: boolean; setHide: (v: boolean) => void }) {
  return (
    <div className="list-top">
      <button className="ghost" onClick={onBack}>
        ← 戻る
      </button>
      <h2>{round === 13 ? '付録' : `ROUND ${round}`}</h2>
      <label className="toggle">
        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
        赤シート
      </label>
    </div>
  )
}
