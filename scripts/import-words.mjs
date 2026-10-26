// 単語データ（data/*.json）を Supabase の words テーブルに投入する。
// 使い方：
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-words.mjs
// ※ service role key は管理者専用。絶対にコミットしたり、アプリに埋め込まないこと。
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = new URL('../data/', import.meta.url).pathname
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const words = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))

// 簡単な検証
const ids = new Set()
for (const w of words) {
  if (ids.has(w.id)) throw new Error(`id が重複: ${w.id}`)
  ids.add(w.id)
  for (const k of ['id', 'round', 'page', 'word', 'meanings']) if (w[k] == null) throw new Error(`No.${w.id} に ${k} がない`)
}
console.log(`${files.length} ファイル / ${words.length} 語`)

// ローカル開発用にも書き出す（gitignore 済み）
mkdirSync(new URL('../public/local-data/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/local-data/words.json', import.meta.url), JSON.stringify(words))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定なので、ローカル用の書き出しのみ行いました')
  process.exit(0)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const rows = words.map((w) => ({ id: w.id, round: w.round, data: w, updated_at: new Date().toISOString() }))
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from('words').upsert(rows.slice(i, i + 500))
  if (error) throw error
}
console.log('Supabase に投入しました')
