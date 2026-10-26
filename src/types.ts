export type Warning = 'accent' | 'pronunciation' | 'usage' | 'polysemy'

export interface Meaning {
  pos: string // 名・動・形・副 など
  ja: string
}

export interface Related {
  type: '派' | '熟' | '反' | '関' | string
  pos?: string
  en: string
  ja: string
}

export interface Example {
  en: string
  ja: string
  /** 本の解答欄の語（和訳の空欄に入る語） */
  answer: string
}

export interface Word {
  id: number
  round: number
  page: number
  word: string
  ipa: string
  kana: string
  warnings: Warning[]
  meanings: Meaning[]
  related: Related[]
  forms: string[] | null
  note: string | null
  example: Example | null
  memo: string | null
  image: string | null
}

export type Mode = 'en2ja' | 'ja2en' | 'cloze' | 'order' | 'spell' | 'forms'

/** 本の □□□ に対応する習熟度 0〜3 */
export type Level = 0 | 1 | 2 | 3

export interface Progress {
  level: Level
  /** 次回の出題予定（epoch ms） */
  due: number
  /** 間隔（日） */
  interval: number
  correct: number
  wrong: number
  updatedAt: number
}

export interface Question {
  word: Word
  mode: Mode
}

export interface Answer {
  word: Word
  mode: Mode
  correct: boolean
  ms: number
}
