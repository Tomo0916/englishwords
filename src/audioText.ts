import type { Word } from './types'

/** 1語につき作る音声の種類 */
export type ClipKind = 'w' | 'wj' | 'e' | 'ej'

/** 読み上げ用に記号を整える（～、V、……など） */
function cleanEn(s: string) {
  return s
    .replace(/\[.*?\]/g, '')
    .replace(/[～~]/g, ' ')
    .replace(/\bS V\b/g, ' ')
    .replace(/\bV\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanJa(s: string) {
  return s
    .replace(/[～~]/g, '')
    .replace(/…+|\.{3,}/g, '')
    .replace(/[VＶ]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[，,／/]/g, '、')
    .replace(/、+/g, '、')
    .replace(/^、|、$/g, '')
    .trim()
}

/** その語の音声テキスト。作らない種類は null */
export function clipText(w: Word, kind: ClipKind): { text: string; lang: 'en-US' | 'ja-JP' } | null {
  switch (kind) {
    case 'w':
      return { text: cleanEn(w.word.replace(/[()]/g, '')), lang: 'en-US' }
    case 'wj': {
      const t = cleanJa(w.meanings.map((m) => m.ja).join('、'))
      return t ? { text: t, lang: 'ja-JP' } : null
    }
    case 'e':
      return w.example ? { text: w.example.en, lang: 'en-US' } : null
    case 'ej':
      return w.example ? { text: w.example.ja, lang: 'ja-JP' } : null
  }
}

export const CLIP_KINDS: ClipKind[] = ['w', 'wj', 'e', 'ej']

export const clipPath = (voiceKey: string, id: number, kind: ClipKind) => `${voiceKey}/${id}-${kind}.mp3`
