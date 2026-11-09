import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { record } from '../progress'
import {
  cleanForm,
  DEFAULT_FORM_LABELS,
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
  wordLabel,
} from '../quiz'
import { setSettings, useSettings } from '../settings'
import { playExample, playWord, playbackProgress, prefetchWords, stopSpeaking } from '../speech'
import type { Answer, Mode, Question, Word } from '../types'
import { SpeakButton, WordCard } from './WordCard'
import { ChevronRight, CircleCheck, CircleX, X } from '../icons'

interface Props {
  questions: Question[]
  pool: Word[]
  onFinish: (answers: Answer[]) => void
  onQuit: (answers: Answer[]) => void
}

/** 読み上げが終わってから次へ進むまでの間（ミリ秒） */
const PAUSE_AFTER_AUDIO = { fast: 300, normal: 800, slow: 1600 }
/** 読み上げがないときに次へ進むまでの時間（ミリ秒）。例文の問題は1.5倍 */
const WAIT_NO_AUDIO = { fast: 800, normal: 1600, slow: 3000 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 自動で次へ進むまでの残りを、ボタンの色が左から満ちていく形で見せる。押せばすぐ次へ。
 * 読み上げがあるときは、読み上げの進み具合で8割まで満ち、残り2割が読み上げ後の間。
 */
function AutoNextButton({ audio, waitMs, waitStart, onSkip }: { audio: boolean; waitMs: number; waitStart: number | null; onSkip: () => void }) {
  const fill = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      let f: number
      const audioPart = audio ? 0.8 : 0
      if (waitStart == null) {
        const p = playbackProgress()
        f = p ? audioPart * Math.min(1, p.t / p.d) : 0
      } else f = audioPart + (1 - audioPart) * Math.min(1, (performance.now() - waitStart) / waitMs)
      if (fill.current) fill.current.style.transform = `scaleX(${f})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audio, waitMs, waitStart])
  return (
    <button className="primary wide auto-next" onClick={onSkip}>
      <span className="auto-next-fill" ref={fill} aria-hidden />
      <span className="auto-next-label">
        次へ<ChevronRight size={18} />
      </span>
    </button>
  )
}

type Phase = { kind: 'ask' } | { kind: 'feedback'; correct: boolean; chosen?: string }

export function Quiz({ questions, pool, onFinish, onQuit }: Props) {
  const settings = useSettings()
  const [queue, setQueue] = useState<Question[]>(questions)
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const [answers, setAnswers] = useState<Answer[]>([])
  const retries = useRef(new Map<number, number>())
  const afterAudio = useRef<Promise<void> | null>(null)
  // 自動で次へ：読み上げ中か、読み上げ後の待ち時間に入ったか（ボタンの進み具合の表示用）
  const [auto, setAuto] = useState<{ audio: boolean; waitMs: number; waitStart: number | null } | null>(null)
  const started = useRef(Date.now())
  const q = queue[pos]

  // このセットの単語の音声を最初に裏で読み込んでおく（出題のたびに待たないように）
  useEffect(() => {
    void prefetchWords([...new Map(questions.map((x) => [x.word.id, x.word])).values()])
  }, [questions])

  useEffect(() => {
    started.current = Date.now()
    setPhase({ kind: 'ask' })
    if (q && settings.autoSpeak && (q.mode === 'en2ja' || q.mode === 'spell')) void playWord(q.word, false)
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
      // 答えのあとの読み上げ（日→英は単語、穴埋め・並び替えは例文）。「自動で次へ」はこれが終わるのを待つ
      afterAudio.current = null
      if (settings.autoSpeak) {
        if ((q.mode === 'cloze' || q.mode === 'order') && q.word.example) afterAudio.current = playExample(q.word, false)
        else if (q.mode === 'ja2en') afterAudio.current = playWord(q.word, false)
      }
      setPhase({ kind: 'feedback', correct, chosen })
    },
    [phase, q, answers, pos, settings],
  )

  // 正解なら自動で次へ。読み上げがあれば最後まで聞いてから、少し間をおいて進む。
  // 「自動で次へ」がオフなら、次へボタンを待つ
  useEffect(() => {
    if (!(phase.kind === 'feedback' && phase.correct && settings.autoNext)) return setAuto(null)
    let off = false
    const audio = afterAudio.current
    const sentence = q?.mode === 'order' || q?.mode === 'cloze'
    const waitMs = audio ? PAUSE_AFTER_AUDIO[settings.autoNextSpeed] : WAIT_NO_AUDIO[settings.autoNextSpeed] * (sentence ? 1.5 : 1)
    setAuto({ audio: !!audio, waitMs, waitStart: audio ? null : performance.now() })
    void (async () => {
      if (audio) {
        await Promise.race([audio, sleep(15000)]) // 万一終わらなくても15秒で進む
        if (off) return
        setAuto({ audio: true, waitMs, waitStart: performance.now() })
      }
      await sleep(waitMs)
      if (!off) next(answers)
    })()
    return () => {
      off = true
    }
  }, [phase, next, answers, q, settings.autoNext, settings.autoNextSpeed])

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
          <X />
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
          {wordLabel(q.word)}・p.{q.word.page}
        </span>
        <label className="switch-label">
          自動で次へ
          <span className="switch">
            <input type="checkbox" role="switch" checked={settings.autoNext} onChange={(e) => setSettings({ autoNext: e.target.checked })} />
            <span aria-hidden />
          </span>
        </label>
        <span className="score">正解 {done}</span>
      </div>

      <QuestionView key={`${pos}-${q.word.id}-${q.mode}`} q={q} pool={pool} phase={phase} onAnswer={answer} timeLimit={settings.timeLimit} />

      {fb && (
        <div className={`feedback ${fb.correct ? 'ok' : 'ng'}`}>
          <div className="verdict">
            {fb.correct ? <CircleCheck size={22} /> : <CircleX size={22} />}
            {fb.correct ? '正解' : '不正解'}
          </div>
          {(!fb.correct || !settings.autoNext) && (
            <>
              <WordCard w={q.word} context={`クイズ：${MODE_LABEL[q.mode]}`} />
              <button className="primary wide" onClick={() => next(answers)} autoFocus>
                次へ
              </button>
            </>
          )}
        </div>
      )}
      {fb && fb.correct && auto && <AutoNextButton {...auto} onSkip={() => next(answers)} />}
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
            <SpeakButton w={w} withJa={false} />
          </div>
          {w.ipa && <div className="prompt-sub">[{w.ipa}]</div>}
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

type Drag = {
  token: number // 動かしている語（correct の番号）
  from: number | null // 並べた列の何番目から持ち上げたか（下の語群からなら null）
  x: number
  y: number
  dx: number // 指と語の左上のずれ
  dy: number
  w: number
  over: number | null // 並べた列に落とすなら、その挿入位置
  lift: number // 指で隠れないよう、語を指より上に浮かせる量（タッチのみ）
}

/**
 * 並び替え。タップで順に並べるほか、ドラッグでも操作できる。
 * - 下の語を上の列の好きな位置へドラッグして入れる
 * - 並べた語をドラッグして入れ替える／列の外へドラッグして戻す
 */
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
  const [drag, setDrag] = useState<Drag | null>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ token: number; from: number | null; x: number; y: number; el: HTMLElement; id: number; touch: boolean } | null>(null)
  const justDragged = useRef(false)
  const answered = phase.kind === 'feedback'
  const built = picked.map((i) => correct[i])

  const check = () => onAnswer(normalize(built.join(' ')) === normalize(correct.join(' ')))

  /** 指の位置から、並べた列のどこに入るかを求める（列の外なら null） */
  const dropIndex = (x: number, y: number, from: number | null): number | null => {
    const line = lineRef.current
    if (!line) return null
    const r = line.getBoundingClientRect()
    const pad = 24 // 列の少し外でも入れられるように
    if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null
    const chips = [...line.querySelectorAll<HTMLElement>('[data-k]')].filter((el) => Number(el.dataset.k) !== from)
    for (let n = 0; n < chips.length; n++) {
      const c = chips[n].getBoundingClientRect()
      if (y < c.top) return n
      if (y <= c.bottom && x < c.left + c.width / 2) return n
    }
    return chips.length
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p || e.pointerId !== p.id) return
      if (!drag) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return // 小さな動きはタップ扱い
        const r = p.el.getBoundingClientRect()
        const lift = p.touch ? 36 : 0
        setDrag({ token: p.token, from: p.from, x: e.clientX, y: e.clientY, dx: p.x - r.left, dy: p.y - r.top, w: r.width, lift, over: dropIndex(e.clientX, e.clientY - lift, p.from) })
        return
      }
      e.preventDefault()
      setDrag({ ...drag, x: e.clientX, y: e.clientY, over: dropIndex(e.clientX, e.clientY - drag.lift, drag.from) })
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      if (!p || e.pointerId !== p.id) return
      press.current = null
      if (!drag) return
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
      const rest = drag.from == null ? picked : picked.filter((_, j) => j !== drag.from)
      if (drag.over != null) setPicked([...rest.slice(0, drag.over), drag.token, ...rest.slice(drag.over)])
      else if (drag.from != null) setPicked(rest) // 列の外に出したら戻す
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, picked])

  const startPress = (token: number, from: number | null) => (e: React.PointerEvent<HTMLElement>) => {
    if (answered || e.button > 0) return
    press.current = { token, from, x: e.clientX, y: e.clientY, el: e.currentTarget, id: e.pointerId, touch: e.pointerType !== 'mouse' }
  }
  const tap = (fn: () => void) => () => {
    if (!justDragged.current) fn()
  }

  // 並べた列の表示（ドラッグ中は、持ち上げた語を抜き、落とす位置に印を入れる）
  const lineItems: ({ k: number; token: number } | 'mark')[] = picked.map((token, k) => ({ k, token })).filter((it) => !drag || it.k !== drag.from)
  if (drag?.over != null) lineItems.splice(drag.over, 0, 'mark')

  return (
    <div className="question">
      <div className="prompt">
        <ClozeJa w={w} />
      </div>
      <div ref={lineRef} className={`order-line ${answered ? (phase.correct ? 'right' : 'wrong') : ''} ${drag?.over != null ? 'drop' : ''}`} lang="en">
        {picked.length === 0 && !drag && <span className="placeholder">下の語をタップかドラッグして英文を作ろう</span>}
        {lineItems.map((it) =>
          it === 'mark' ? (
            <span key="mark" className="drop-mark" />
          ) : (
            <button
              key={`p${it.k}`}
              data-k={it.k}
              className="chip placed"
              disabled={answered}
              onPointerDown={startPress(it.token, it.k)}
              onClick={tap(() => setPicked(picked.filter((_, j) => j !== it.k)))}
            >
              {correct[it.token]}
            </button>
          ),
        )}
        {picked.length > 0 && <span className="end-punct">{end}</span>}
      </div>
      {answered && !phase.correct && (
        <p className="answer-line" lang="en">
          正解：{ex.en}
        </p>
      )}
      <div className="chips" lang="en">
        {initial.map((i) => (
          <button
            key={i}
            className={`chip ${drag?.token === i && drag.from == null ? 'lifted' : ''}`}
            disabled={answered || picked.includes(i)}
            onPointerDown={startPress(i, null)}
            onClick={tap(() => setPicked([...picked, i]))}
          >
            {correct[i]}
          </button>
        ))}
      </div>
      {drag && (
        <div className="chip drag-ghost" lang="en" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy - drag.lift, minWidth: drag.w }}>
          {correct[drag.token]}
        </div>
      )}
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
  // ヒントで見せている文字は入力欄の頭に固定で表示し、続きだけを打てばよいようにする。
  // 最初から全部打った場合（d を見て desk と打つ）も正解にする
  const prefix = w.word.slice(0, hint)
  const typed = prefix + val
  const ok = normalize(typed) === normalize(w.word) || normalize(val) === normalize(w.word)
  const shown = w.word
    .split('')
    .map((c, i) => (i < hint || c === ' ' ? c : '_'))
    .join(' ')
  const moreHint = () => {
    const next = Math.min(w.word.length, hint + 1)
    const added = w.word.slice(hint, next)
    // すでに打っていた文字がヒントで出た文字と同じなら、二重にならないよう入力から外す
    if (added && val.toLowerCase().startsWith(added.toLowerCase())) setVal(val.slice(added.length))
    setHint(next)
  }
  return (
    <div className="question">
      <div className="prompt">
        <div className="prompt-ja">{meaningText(w)}</div>
        <div className="prompt-sub">
          {posText(w)}　{w.kana}
          <SpeakButton w={w} withJa={false} />
        </div>
        <div className="hint" lang="en">
          {shown}
        </div>
      </div>
      <form
        className="spell"
        onSubmit={(e) => {
          e.preventDefault()
          if (!answered && val.trim()) onAnswer(ok, ok ? w.word : typed)
        }}
      >
        <label className={`spell-box ${answered ? (ok ? 'right' : 'wrong') : ''}`}>
          <span className="spell-prefix" lang="en" aria-hidden>
            {prefix}
          </span>
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            disabled={answered}
            autoCapitalize="none"
            inputMode="email" /* 英字のキーボードを出す（iPhone はかな入力を候補から外す）。type は text のまま */
            enterKeyHint="done"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            lang="en"
            aria-label={`${prefix} に続けてスペルを入力`}
            placeholder={val ? '' : '続きを入力'}
          />
        </label>
        {!answered && (
          <div className="row">
            <button type="button" className="ghost" onClick={moreHint} disabled={hint >= w.word.length}>
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
  const labels = w.formLabels ?? DEFAULT_FORM_LABELS
  // 1つ目を問題として見せ、残り（「—」以外）を答えさせる
  const asks = forms.map((f, i) => ({ f, i })).filter(({ f, i }) => i > 0 && f !== '—')
  const [vals, setVals] = useState<string[]>(() => asks.map(() => ''))
  const answered = phase.kind === 'feedback'
  const oks = asks.map(({ f }, k) => formMatches(vals[k], f))
  const filled = vals.every((v) => v.trim())
  return (
    <div className="question">
      <div className="prompt">
        <div className="prompt-sub">{labels[0]}</div>
        <div className="prompt-word" lang="en">
          {cleanForm(forms[0])}
          <SpeakButton w={w} withJa={false} />
        </div>
        <div className="prompt-sub">{meaningText(w)}</div>
      </div>
      <form
        className="forms-q"
        onSubmit={(e) => {
          e.preventDefault()
          if (!answered && filled) onAnswer(oks.every(Boolean))
        }}
      >
        {asks.map(({ f, i }, k) => (
          <label key={i}>
            {labels[i] ?? ''}
            <input
              autoFocus={k === 0}
              value={vals[k]}
              onChange={(e) => setVals(vals.map((v, j) => (j === k ? e.target.value : v)))}
              disabled={answered}
              autoCapitalize="none"
              inputMode="email" /* 英字のキーボードを出す */
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              lang="en"
              className={answered ? (oks[k] ? 'right' : 'wrong') : ''}
            />
            {answered && !oks[k] && <span className="fix">{cleanForm(f)}</span>}
          </label>
        ))}
        {!answered && (
          <div className="row">
            <button type="button" className="ghost" onClick={() => onAnswer(false)}>
              わからない
            </button>
            <button className="primary" disabled={!filled}>
              答え合わせ
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
