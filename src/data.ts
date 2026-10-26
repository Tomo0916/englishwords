import { supabase } from './supabase'
import type { Word } from './types'

const CACHE_KEY = 'words-cache-v1'

function readCache(): Word[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Word[]) : null
  } catch {
    return null
  }
}

function writeCache(words: Word[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(words))
  } catch {
    /* 容量超過などは無視 */
  }
}

/**
 * 単語データを読み込む。
 * - Supabase 設定あり：ログイン済みユーザーのみ words テーブルを読める（RLS）
 * - 未設定：public/local-data/words.json（開発用）
 * 取得できればキャッシュし、オフライン時はキャッシュを返す。
 */
export async function loadWords(): Promise<Word[]> {
  try {
    let words: Word[]
    if (supabase) {
      const all: Word[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('words')
          .select('data')
          .order('id')
          .range(from, from + 999)
        if (error) throw error
        all.push(...data.map((r) => r.data as Word))
        if (data.length < 1000) break
      }
      words = all
    } else {
      const res = await fetch(`${import.meta.env.BASE_URL}local-data/words.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      words = (await res.json()) as Word[]
    }
    words.sort((a, b) => a.id - b.id)
    writeCache(words)
    return words
  } catch (e) {
    const cached = readCache()
    if (cached) return cached
    throw e
  }
}
