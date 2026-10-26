import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { record } from '../progress'
import {
  cleanForm,
  findTarget,
  formMatches,
  highlightJa,
  meaningText,
  MODE_LABEL,
  normalize,
  orderTokens,
  pickDistractors,
  posText,
  shuffle,
  targetSurface,
} from '../quiz'
import { useSettings } from '../settings'
import { speak, stopSpeaking } from '../speech'
import type { Answer, Mode, Question, Word } from '../types'
import { SpeakButton, WordCard } from './WordCard'

interface Props {
  questions: Question[]
  pool: Word[]
  onFinish: (answers: Answer[]) => void
  onQuit: (answers: Answer[]) => void
}

type Phase = { kind: 'ask' } | { kind: 'feedback'; correct: boolean; chosen?: string }

export function Quiz({ questions, pool, onFinish, onQuit }: Props) {
  const settings = useSettings()
  const [queue, setQueue] = useState<Question[]>(questions)
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const [answers, setAnswers] = useState<Answer[]>([])
  const retries = useRef(new Map<number, number>())
  const started = useRef(Date.now())
  const q = queue[pos]

  useEffect(() => {
    started.current = Date.now()
    setPhase({ kind: 'ask' })
    if (q && settings.autoSpeak && (q.mode === 'en2ja' || q.mode === 'spell')) speak(q.word.word)
    return () => stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, q])

  const next = useCallback(
    (all: Answer[]) => {
      if (pos + 1 >= queue.length) onFinish(all)
      else setPos(pos + 1)
    },
    [pos, queue.length, onFinish],
  )

  const answer = useCallback(
    (correct: boolean, chosen?: string) => {
      if (phase.kind !== 'ask' || !q) return
      const ms = Date.now() - started.current
      const slow = correct && ms > settings.slowSec * 1000
      record(q.word.id, correct, slow)
      const a: Answer = { word: q.word, mode: q.mode, correct, ms }
      const all = [...answers, a]
      setAnswers(all)
      if (!correct) {
        // 間違えた語は3問後にもう一度（1語につき2回まで）
        const n = retries.current.get(q.word.id) ?? 0
        if (n < 2) {
          retries.current.set(q.word.id, n + 1)
          setQueue((qs) => {
            const c = [...qs]
            c.splice(Math.min(pos + 4, c.length), 0, q)
            return c
          })
        }
      }
      setPhase({ kind: 'feedback', correct, chosen })
      if (q.mode === 'en2ja' || q.mode === 'ja2en' || q.mode === 'cloze') {
        if (!settings.autoSpeak) return
        if (q.mode === 'cloze' && q.word.example) speak(q.word.example.en)
        else if (q.mode === 'ja2en') speak(q.word.word)
      } else if (q.word.example && settings.autoSpeak && q.mode === 'order') speak(q.word.example.en)
    },
    [phase, q, answers, pos, settings],
  )

  // 正解ならすぐ次へ（高速モード）
  useEffect(() => {
    if (phase.kind === 'feedback' && phase.correct) {
      const t = window.setTimeout(() => next(answers), q?.mode === 'order' || q?.mode === 'cloze' ? 1400 : 650)
      return () => window.clearTimeout(t)
    }
  }, [phase, next, answers, q])

  // キーボード：Enter / Space で次へ
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (phase.kind === 'feedback' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        next(answers)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, next, answers])

  if (!q) return null
  const done = answers.filter((a) => a.correct).length
  const fb = phase.kind === 'feedback' ? phase : null

  return (
    <div className="quiz">
      <div className="quiz-top">
        <button className="ghost" onClick={() => onQuit(answers)} aria-label="中断">
          ✕
        </button>
        <div className="bar" aria-hidden>
          <div style={{ width: `${(pos / queue.length) * 100}%` }} />
        </div>
        <span className="count">
          {pos + 1}/{queue.length}
        </span>
      </div>
      <div className="quiz-meta">
        <span className="mode-pill">{MODE_LABEL[q.mode]}</span>
        <span>
          No.{q.word.id}・p.{q.word.page}
        </span>
        <span className="score">正解 {done}</span>
      </div>

      <QuestionView key={`${pos}-${q.word.id}-${q.mode}`} q={q} pool={pool} phase={phase} onAnswer={answer} timeLimit={settings.timeLimit} />

      {fb && (
        <div className={`feedback ${fb.correct ? 'ok' : 'ng'}`}>
          <div className="verdict">{fb.correct ? '◯ 正解' : '✕ 不正解'}</div>
          {!fb.correct && (
            <>
              <WordCard w={q.word} />
              <button className="primary wide" onClick={() => next(answers)} autoFocus>
                次へ
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface QProps {
  q: Question
  pool: Word[]
  phase: Phase
  onAnswer: (correct: boolean, chosen?: string) => void
  timeLimit: number
}

function QuestionView(props: QProps) {
  switch (props.q.mode) {
    case 'en2ja':
    case 'ja2en':
    case 'cloze':
      return <ChoiceQ {...props} />
    case 'order':
      return <OrderQ {...props} />
    case 'spell':
      return <SpellQ {...props} />
    case 'forms':
      return <FormsQ {...props} />
  }
}

// ---------- 4択（英→日・日→英・例文穴埋め） ----------

function ChoiceQ({ q, pool, phase, onAnswer, timeLimit }: QProps) {
  const w = q.word
  const mode: Mode = q.mode
  const { prompt, options, correctKey } = useMemo(() => {
    if (mode === 'en2ja') {
      const ds = pickDistractors(w, pool, 3, meaningText)
      return { prompt: null, correctKey: meaningText(w), options: shuffle([w, ...ds]).map(meaningText) }
    }
    if (mode === 'ja2en') {
      const ds = pickDistractors(w, pool, 3, (x) => x.word)
      return { prompt: null, correctKey: w.word, options: shuffle([w, ...ds]).map((x) => x.word) }
    }
    // cloze：例文の見出し語を空欄に。選択肢は他の例文中の形（活用・複数形のまま）
    const surface = targetSurface(w) ?? w.word
    const ds = pickDistractors(w, pool.filter((x) => targetSurface(x)), 3, (x) => targetSurface(x) ?? '')
    return {
      prompt: findTarget(w),
      correctKey: surface,
      options: shuffle([surface, ...ds.map((x) => targetSurface(x) ?? x.word)]),
    }
  }, [w, pool, mode])

  const answered = phase.kind === 'feedback'
  const chosen = answered ? phase.chosen : undefined

  // キーボード 1〜4
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (!answered && n >= 1 && n <= options.length) onAnswer(options[n - 1] === correctKey, options[n - 1])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [answered, options, correctKey, onAnswer])

  return (
    <div className="question">
      {mode === 'en2ja' && (
        <div className="prompt">
          <div className="prompt-word" lang="en">
            {w.word}
            <SpeakButton text={w.word} />
          </div>
          <div className="prompt-sub">[{w.ipa}]</div>
        </div>
      )}
      {mode === 'ja2en' && (
        <div className="prompt">
          <div className="prompt-ja">{meaningText(w)}</div>
          <div className="prompt-sub">{posText(w)}</div>
        </div>
      )}
      {mode === 'cloze' && prompt && w.example && (
        <div className="prompt">
          <p className="cloze" lang="en">
            {prompt.tokens.map((t, i) =>
              i === prompt.index ? (
                <span key={i} className={`blank ${answered ? 'filled' : ''}`}>
                  {answered ? t : ' '.repeat(8)}
                </span>
              ) : (
                <span key={i}>{t} </span>
              ),
            )}
          </p>
          <ClozeJa w={w} />
        </div>
      )}
      {timeLimit > 0 && !answered && <TimeBar sec={timeLimit} onTimeout={() => onAnswer(false)} />}
      <div className={`choices ${mode === 'ja2en' || mode === 'cloze' ? 'en' : ''}`}>
        {options.map((o, i) => {
          const cls = !answered ? '' : o === correctKey ? 'right' : o === chosen ? 'wrong' : 'dim'
          return (
            <button key={o + i} className={`choice ${cls}`} disabled={answered} onClick={() => onAnswer(o === correctKey, o)}>
              <span className="key">{i + 1}</span>
              <span lang={mode === 'en2ja' ? 'ja' : 'en'}>{o}</span>
            </button>
          )
        })}
        {!answered && (
          <button className="choice idk" onClick={() => onAnswer(false)}>
            わからない
          </button>
        )}
      </div>
    </div>
  )
}

function ClozeJa({ w }: { w: Word }) {
  if (!w.example) return null
  const [pre, ans, post] = highlightJa(w.example.ja, w.example.answer)
  return (
    <p className="ex-ja">
      {pre}
      <mark>{ans}</mark>
      {post}
    </p>
  )
}

function TimeBar({ sec, onTimeout }: { sec: number; onTimeout: () => void }) {
  const cb = useRef(onTimeout)
  cb.current = onTimeout
  useEffect(() => {
    const t = window.setTimeout(() => cb.current(), sec * 1000)
    return () => window.clearTimeout(t)
  }, [sec])
  return (
    <div className="timebar" aria-hidden>
      <div style={{ animationDuration: `${sec}s` }} />
    </div>
  )
}

// ---------- 並び替え ----------

function OrderQ({ q, phase, onAnswer }: QProps) {
  const w = q.word
  const ex = w.example!
  const { tokens: correct, end } = useMemo(() => orderTokens(ex.en), [ex.en])
  const initial = useMemo(() => {
    const idx = correct.map((_, i) => i)
    let s = shuffle(idx)
    for (let k = 0; k < 5 && s.every((v, i) => v === i); k++) s = shuffle(idx)
    return s
  }, [correct])
  const [picked, setPicked] = useState<number[]>([])
  const answered = phase.kind === 'feedback'
  const built = picked.map((i) => correct[i])

  const check = () => onAnswer(normalize(built.join(' ')) === normalize(correct.join(' ')))

  return (
    <div className="question">
      <div className="prompt">
        <ClozeJa w={w} />
      </div>
      <div className={`order-line ${answered ? (phase.correct ? 'right' : 'wrong') : ''}`} lang="en">
        {picked.length === 0 && <span className="placeholder">下の語をタップして英文を作ろう</span>}
        {picked.map((i, k) => (
          <button key={k} className="chip placed" disabled={answered} onClick={() => setPicked(picked.filter((_, j) => j !== k))}>
            {correct[i]}
          </button>
        ))}
        {picked.length > 0 && <span className="end-punct">{end}</span>}
      </div>
      {answered && !phase.correct && (
        <p className="answer-line" lang="en">
          正解：{ex.en}
        </p>
      )}
      <div className="chips" lang="en">
        {initial.map((i) => (
          <button key={i} className="chip" disabled={answered || picked.includes(i)} onClick={() => setPicked([...picked, i])}>
            {correct[i]}
          </button>
        ))}
      </div>
      {!answered && (
        <div className="row">
          <button className="ghost" onClick={() => setPicked(picked.slice(0, -1))} disabled={!picked.length}>
            1つ戻す
          </button>
          <button className="ghost" onClick={() => onAnswer(false)}>
            わからない
          </button>
          <button className="primary" disabled={picked.length !== correct.length} onClick={check}>
            答え合わせ
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- スペル入力 ----------

function SpellQ({ q, phase, onAnswer }: QProps) {
  const w = q.word
  const [val, setVal] = useState('')
  const [hint, setHint] = useState(1)
  const answered = phase.kind === 'feedback'
  const ok = normalize(val) === normalize(w.word)
  const shown = w.word
    .split('')
    .map((c, i) => (i < hint || c === ' ' ? c : '_'))
    .join(' ')
  return (
    <div className="question">
      <div className="prompt">
        <div className="prompt-ja">{meaningText(w)}</div>
        <div className="prompt-sub">
          {posText(w)}　{w.kana}
          <SpeakButton text={w.word} />
        </div>
        <div className="hint" lang="en">
          {shown}
        </div>
      </div>
      <form
        className="spell"
        onSubmit={(e) => {
          e.preventDefault()
          if (!answered && val.trim()) onAnswer(ok, val)
        }}
      >
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={answered}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          lang="en"
          placeholder="スペルを入力"
          className={answered ? (ok ? 'right' : 'wrong') : ''}
        />
        {!answered && (
          <div className="row">
            <button type="button" className="ghost" onClick={() => setHint(Math.min(w.word.length, hint + 1))}>
              ヒント
            </button>
            <button type="button" className="ghost" onClick={() => onAnswer(false)}>
              わからない
            </button>
            <button className="primary" disabled={!val.trim()}>
              答え合わせ
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

// ---------- 活用形 ----------

function FormsQ({ q, phase, onAnswer }: QProps) {
  const w = q.word
  const forms = w.forms!
  const [past, setPast] = useState('')
  const [pp, setPp] = useState('')
  const answered = phase.kind === 'feedback'
  const ok1 = formMatches(past, forms[1])
  const ok2 = formMatches(pp, forms[2])
  return (
    <div className="question">
      <div className="prompt">
        <div className="prompt-word" lang="en">
          {cleanForm(forms[0])}
          <SpeakButton text={w.word} />
        </div>
        <div className="prompt-sub">{meaningText(w)}</div>
      </div>
      <form
        className="forms-q"
        onSubmit={(e) => {
          e.preventDefault()
          if (!answered && past.trim() && pp.trim()) onAnswer(ok1 && ok2)
        }}
      >
        <label>
          過去形
          <input autoFocus value={past} onChange={(e) => setPast(e.target.value)} disabled={answered} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} lang="en" className={answered ? (ok1 ? 'right' : 'wrong') : ''} />
          {answered && !ok1 && <span className="fix">{cleanForm(forms[1])}</span>}
        </label>
        <label>
          過去分詞形
          <input value={pp} onChange={(e) => setPp(e.target.value)} disabled={answered} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} lang="en" className={answered ? (ok2 ? 'right' : 'wrong') : ''} />
          {answered && !ok2 && <span className="fix">{cleanForm(forms[2])}</span>}
        </label>
        {!answered && (
          <div className="row">
            <button type="button" className="ghost" onClick={() => onAnswer(false)}>
              わからない
            </button>
            <button className="primary" disabled={!past.trim() || !pp.trim()}>
              答え合わせ
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
