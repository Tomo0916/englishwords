import type { Mode, Word } from './types'

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const meaningText = (w: Word) => w.meanings.map((m) => m.ja).join('／')
export const posText = (w: Word) => [...new Set(w.meanings.map((m) => m.pos))].join('・')

const strip = (t: string) => t.toLowerCase().replace(/[^a-z'-]/g, '')

/** 例文中の見出し語（活用形を含む）の位置を探す */
export function findTarget(w: Word): { tokens: string[]; index: number } | null {
  if (!w.example) return null
  const tokens = w.example.en.split(/\s+/).filter(Boolean)
  const head = w.word.toLowerCase()
  const forms = (w.forms ?? []).map((f) => strip(f.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')))
  const formsFull = (w.forms ?? []).map((f) => strip(f.replace(/\[.*?\]/g, '').replace(/[()]/g, '')))
  // 語尾変化の候補：decide→decid(ed)、study→studi(es)、try→tri(ed)
  const stems = [head, head.replace(/e$/, ''), head.replace(/y$/, 'i'), head.replace(/man$/, 'men')].filter((s) => s.length >= 2)
  const irregular: Record<string, string> = { foot: 'feet', tooth: 'teeth', goose: 'geese', mouse: 'mice', child: 'children', person: 'people', leaf: 'leaves', knife: 'knives', wife: 'wives', life: 'lives' }
  if (irregular[head]) forms.push(irregular[head])
  // 熟語・複数語の見出し（例：table tennis）は対象外
  if (head.includes(' ')) return null
  for (let i = 0; i < tokens.length; i++) {
    const t = strip(tokens[i]).replace(/'s$/, '')
    if (!t) continue
    if (t === head || forms.includes(t) || formsFull.includes(t) || t.split('-').includes(head)) return { tokens, index: i }
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = strip(tokens[i])
    if (stems.some((st) => t.startsWith(st) && t.length - st.length <= 4)) return { tokens, index: i }
  }
  return null
}

/** 例文中の見出し語の実際の形（students, decided など） */
export function targetSurface(w: Word): string | null {
  const t = findTarget(w)
  if (!t) return null
  return t.tokens[t.index].replace(/[^A-Za-z'-]/g, '').replace(/'s$/, '')
}

/** 各モードで出題できる単語か */
export function supports(w: Word, mode: Mode): boolean {
  switch (mode) {
    case 'en2ja':
    case 'ja2en':
      return w.meanings.length > 0
    case 'spell':
      return w.meanings.length > 0 && /^[A-Za-z' -]+$/.test(w.word)
    case 'cloze':
      return !!findTarget(w)
    case 'order':
      return !!w.example && w.example.en.split(/\s+/).length >= 3 && w.example.en.split(/\s+/).length <= 16
    case 'forms':
      return !!w.forms && w.forms.filter((f) => f !== '—').length >= 2
  }
}

/** 誤答の選択肢を選ぶ（同じ品詞を優先） */
export function pickDistractors(target: Word, pool: Word[], n: number, key: (w: Word) => string): Word[] {
  const tKey = key(target)
  const pos = target.meanings[0]?.pos
  const cands = pool.filter((w) => w.id !== target.id && key(w) && key(w) !== tKey)
  const cat = target.category
  const sameCat = cat ? shuffle(cands.filter((w) => w.category === cat)) : []
  const same = shuffle(cands.filter((w) => w.meanings[0]?.pos === pos && (!cat || w.category !== cat)))
  const other = shuffle(cands.filter((w) => w.meanings[0]?.pos !== pos && (!cat || w.category !== cat)))
  const out: Word[] = []
  const seen = new Set<string>([tKey])
  for (const w of [...sameCat, ...same, ...other]) {
    const k = key(w)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(w)
    if (out.length >= n) break
  }
  return out
}

let lowerVocab: Set<string> | null = null
/** 例文中で小文字で使われている語の集合（文頭の大文字を外してよいかの判定用） */
export function setVocab(words: Word[]) {
  lowerVocab = new Set()
  for (const w of words) {
    w.example?.en.split(/\s+/).forEach((t, i) => {
      const c = t.replace(/[^A-Za-z']/g, '')
      if (i > 0 && c && c === c.toLowerCase()) lowerVocab!.add(c)
    })
  }
}

/**
 * 並び替え用：例文を語に分ける。
 * 文頭の大文字と文末の記号はヒントになるので外す（固有名詞・I はそのまま）。
 */
export function orderTokens(sentence: string): { tokens: string[]; end: string } {
  const tokens = sentence.split(/\s+/).filter(Boolean)
  let end = ''
  const last = tokens[tokens.length - 1]
  const m = last?.match(/^(.*?)([.?!]+)$/)
  if (m && m[1]) {
    tokens[tokens.length - 1] = m[1]
    end = m[2]
  }
  const first = tokens[0]
  if (first && !/^I('|$)/.test(first)) {
    const low = first[0].toLowerCase() + first.slice(1)
    const core = low.replace(/[^A-Za-z']/g, '')
    if (!lowerVocab || lowerVocab.has(core)) tokens[0] = low
  }
  return { tokens, end }
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** 活用形の正解判定（"got(ten)" は got / gotten どちらも可、発音記号は無視） */
export function formMatches(answer: string, form: string): boolean {
  const a = normalize(answer)
  const base = form.replace(/\[.*?\]/g, '').trim()
  const variants = new Set<string>()
  const m = base.match(/^(.*)\((.*)\)(.*)$/)
  if (m) {
    variants.add(normalize(m[1] + m[3]))
    variants.add(normalize(m[1] + m[2] + m[3]))
  } else {
    base.split(/[/,]/).forEach((v) => variants.add(normalize(v)))
  }
  return variants.has(a)
}

export const cleanForm = (f: string) => f.replace(/\s*\[.*?\]/g, '')

export const DEFAULT_FORM_LABELS = ['原形', '過去形', '過去分詞形']

/** 番号表示：本編は No.xx、付録はカテゴリ */
export const wordLabel = (w: Word) => (w.round === 13 ? `付録・${w.category ?? ''}` : `No.${w.id}`)

/** 和訳の解答語を【】で示す */
export function highlightJa(ja: string, answer: string): [string, string, string] {
  const i = ja.indexOf(answer)
  if (i < 0 || !answer) return [ja, '', '']
  return [ja.slice(0, i), answer, ja.slice(i + answer.length)]
}

export const MODE_LABEL: Record<Mode, string> = {
  en2ja: '英→日',
  ja2en: '日→英',
  cloze: '例文穴埋め',
  order: '並び替え',
  spell: 'スペル',
  forms: '活用形',
}
