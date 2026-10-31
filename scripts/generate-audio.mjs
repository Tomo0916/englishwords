// 単語・例文・日本語訳の音声を Google Cloud Text-to-Speech で作り、
// Supabase Storage の非公開バケット「audio」に保存する。GitHub Actions の「Generate audio」から実行。
//
//   英単語   Studio ＋ 本の発音記号（SSML の <phoneme>）で読み方を指定、語尾に「.」で言い切りの抑揚
//   英語例文 Studio
//   日本語   Chirp 3: HD（日本語）
//
// 必要な環境変数
//   SUPABASE_URL / SUPABASE_SECRET_KEY / GOOGLE_CREDENTIALS
// 任意
//   VOICES   作る声の key をカンマ区切り（空ならすべて）  例: female
//   LIMIT    作る最大ファイル数（試しに少しだけ作るとき）  例: 20
//   FORCE    true なら変更がなくても作り直す
//   CONCURRENCY 同時に作る数（既定 8）
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { bookIpaToIpa } from './ipa.mjs'
import { googleSynth, toMp3 } from './tts-google.mjs'

// src の設定を読み込む（Node 22 の型除去で .ts を直接 import）
const { VOICES } = await import('../src/voices.ts')
const { clipText, clipPath, CLIP_KINDS } = await import('../src/audioText.ts')

const env = (k, d) => process.env[k] ?? d
const SUPABASE_URL = env('SUPABASE_URL')
const SECRET = env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL || !SECRET || !env('GOOGLE_CREDENTIALS')) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY / GOOGLE_CREDENTIALS が必要です')
  process.exit(1)
}
const onlyVoices = (env('VOICES', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const LIMIT = Number(env('LIMIT', '0')) || Infinity
const FORCE = env('FORCE', '') === '1' || env('FORCE', '') === 'true'
const CONCURRENCY = Number(env('CONCURRENCY', '8')) || 8 // 同時に作る数（Google の上限に当たると自動で待って再試行）
const BUCKET = 'audio'
const VERSION = 'v4-studio-keeptail' // 作り方を変えたら上げる（全部作り直しになる）
const RATE_EN = 0.95
const RATE_JA = 1.0

const sb = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } })

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const langOf = (name) => name.slice(0, 5)

/** その語・種類・声の合成リクエスト（ハッシュ計算にも使う） */
function request(w, kind, v) {
  const c = clipText(w, kind)
  if (!c || !c.text) return null
  if (c.lang === 'ja-JP') return { name: v.ja, text: c.text, rate: RATE_JA }
  const pitch = v.pitch ? ` pitch="${v.pitch > 0 ? '+' : ''}${v.pitch}st"` : ''
  const wrap = (inner) => (pitch ? `<speak><prosody${pitch}>${inner}</prosody></speak>` : `<speak>${inner}</speak>`)
  if (kind === 'w') {
    const ipa = !c.text.includes(' ') && w.ipa ? bookIpaToIpa(w.ipa) : null
    const body = ipa ? `<phoneme alphabet="ipa" ph="${esc(ipa)}">${esc(c.text)}</phoneme>.` : `${esc(c.text)}.`
    return { name: v.en, ssml: wrap(body), rate: RATE_EN }
  }
  return { name: v.en, ssml: wrap(esc(c.text)), rate: RATE_EN }
}

// --- 準備：バケットと単語データ ---
{
  const { data } = await sb.storage.getBucket(BUCKET)
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false })
    if (error) throw error
    console.log('バケット audio を作成しました')
  }
}
const words = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('words').select('data').order('id').range(from, from + 999)
  if (error) throw error
  words.push(...data.map((r) => r.data))
  if (data.length < 1000) break
}
console.log(`単語データ ${words.length} 件`)

// 前回作った内容（リクエストのハッシュ）。変わったものだけ作り直す
let manifest = {}
{
  const { data } = await sb.storage.from(BUCKET).download('manifest.json')
  if (data) manifest = JSON.parse(await data.text())
}
const saveManifest = () =>
  sb.storage.from(BUCKET).upload('manifest.json', JSON.stringify(manifest), { upsert: true, contentType: 'application/json' })

const voices = VOICES.filter((v) => !onlyVoices.length || onlyVoices.includes(v.key))
let made = 0
let skipped = 0
let failed = 0
let chars = 0
const started = Date.now()

// 作るものの一覧（変更がないものは飛ばす）
const todo = []
for (const v of voices) {
  for (const w of words) {
    for (const kind of CLIP_KINDS) {
      const req = request(w, kind, v)
      if (!req) continue
      const path = clipPath(v.key, w.id, kind)
      const hash = createHash('sha1').update(VERSION + JSON.stringify(req)).digest('hex').slice(0, 12)
      if (!FORCE && manifest[path] === hash) skipped++
      else if (todo.length < LIMIT) todo.push({ w, req, path, hash })
    }
  }
}
console.log(`作成予定 ${todo.length} 件（変更なし ${skipped} 件）／同時に ${CONCURRENCY} 件ずつ`)

// 途中で止められても、そこまでの記録は残す
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    if (stopping) return
    stopping = true
    console.log('\n中断の合図を受けたので、ここまでの記録を保存します')
    await saveManifest()
    process.exit(1)
  })

let next = 0
let saving = Promise.resolve()
async function worker() {
  while (!stopping && next < todo.length) {
    const { w, req, path, hash } = todo[next++]
    try {
      const wav = await googleSynth({ lang: langOf(req.name), name: req.name, text: req.text, ssml: req.ssml, rate: req.rate })
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path, toMp3(wav), { upsert: true, contentType: 'audio/mpeg', cacheControl: '31536000' })
      if (error) throw error
      manifest[path] = hash
      made++
      chars += (req.ssml ?? req.text).length
      if (made % 200 === 0) {
        saving = saving.then(saveManifest)
        await saving
        console.log(`  ${made} / ${todo.length} 件作成（${Math.round((Date.now() - started) / 1000)} 秒）`)
      }
    } catch (e) {
      failed++
      console.log(`  ✕ ${path}（${w.word}）: ${e.message.slice(0, 200)}`)
      if (failed > 30) {
        stopping = true
        console.log('失敗が多すぎるので中断します')
      }
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
await saving
await saveManifest()
// アプリが「どの声が使えるか」を知るための一覧
{
  const ready = {}
  for (const v of VOICES) ready[v.key] = Object.keys(manifest).some((p) => p.startsWith(`${v.key}/`))
  await sb.storage.from(BUCKET).upload('voices.json', JSON.stringify(ready), { upsert: true, contentType: 'application/json' })
}
console.log(`\n完了：新規 ${made} 件／変更なし ${skipped} 件／失敗 ${failed} 件／今回の文字数 ${chars.toLocaleString()} 文字`)
if (failed) process.exitCode = 1
