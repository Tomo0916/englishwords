import { MODE_LABEL } from '../quiz'
import type { Answer } from '../types'

export function Result({ answers, onAgainWrong, onHome }: { answers: Answer[]; onAgainWrong: (ids: number[]) => void; onHome: () => void }) {
  // 1語につき最初の解答で集計
  const first = new Map<number, Answer>()
  answers.forEach((a) => !first.has(a.word.id) && first.set(a.word.id, a))
  const list = [...first.values()]
  const ok = list.filter((a) => a.correct).length
  const wrong = list.filter((a) => !a.correct)
  const avg = list.length ? list.reduce((s, a) => s + a.ms, 0) / list.length / 1000 : 0
  const rate = list.length ? Math.round((ok / list.length) * 100) : 0

  return (
    <div className="result">
      <div className="result-score">
        <div className="big">{rate}%</div>
        <div>
          {ok} / {list.length} 正解　平均 {avg.toFixed(1)} 秒
        </div>
      </div>
      {wrong.length > 0 && (
        <>
          <h3>間違えた単語</h3>
          <ul className="wrong-list">
            {wrong.map((a) => (
              <li key={a.word.id}>
                <span className="no">{a.word.id}</span>
                <span lang="en">{a.word.word}</span>
                <span className="ja">{a.word.meanings.map((m) => m.ja).join('／')}</span>
                <span className="mode-pill small">{MODE_LABEL[a.mode]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        {wrong.length > 0 && (
          <button className="primary" onClick={() => onAgainWrong(wrong.map((a) => a.word.id))}>
            間違えた {wrong.length}語をもう一度
          </button>
        )}
        <button className="ghost" onClick={onHome}>
          ホームへ
        </button>
      </div>
    </div>
  )
}
