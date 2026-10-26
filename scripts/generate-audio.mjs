// 単語・例文・日本語訳の音声を Google Cloud Text-to-Speech（Chirp 3: HD）で作り、
// Supabase Storage の非公開バケット「audio」に保存する。GitHub Actions から実行する想定。
//
// 必要な環境変数
//   SUPABASE_URL                 https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY          sb_secret_...（管理者用。GitHub Secrets に置く）
//   GOOGLE_CREDENTIALS           サービスアカウントの JSON（中身をそのまま）
// 任意
//   VOICES   作る声の key をカンマ区切り（空ならすべて）  例: female
//   LIMIT    作る最大ファイル数（試しに少しだけ作るとき）    例: 20
//   FORCE    1 なら変更がなくても作り直す
//   RATE     話す速さ（0.25〜2.0、既定 0.95）
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { createHash, createSign } from 'node:crypto'

// --- src の設定を読み込む（Node 22 の型除去で .ts を直接 import） ---
const { VOICES } = await import('../src/voices.ts')
const { clipText, clipPath, CLIP_KINDS } = await import('../src/audioText.ts')

const env = (k, d) => process.env[k] ?? d
const SUPABASE_URL = env('SUPABASE_URL')
const SECRET = env('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY')
const CRED = env('GOOGLE_CREDENTIALS')
if (!SUPABASE_URL || !SECRET || !CRED) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY / GOOGLE_CREDENTIALS が必要です')
  process.exit(1)
}
const onlyVoices = (env('VOICES', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const LIMIT = Number(env('LIMIT', '0')) || Infinity
const FORCE = env('FORCE', '') === '1' || env('FORCE', '') === 'true'
const RATE = Number(env('RATE', '0.95')) || 0.95
const BUCKET = 'audio'
const BITRATE = env('BITRATE', '96k')
const QUALITY = `wav24k-mp3-${BITRATE}`

/** WAV → MP3（モノラル・96kbps・前後の無音を短く整える） */
function toMp3(wav) {
  return execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0',
     '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,adelay=60|60,apad=pad_dur=0.12',
     '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-f', 'mp3', 'pipe:1'],
    { input: wav, maxBuffer: 64 * 1024 * 1024 },
  )
}

const sb = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } })

// --- Google の認証（サービスアカウント → アクセストークン） ---
const cred = JSON.parse(CRED)
let token = null
let tokenExp = 0
async function accessToken() {
  if (token && Date.now() < tokenExp - 60_000) return token
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: cred.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(cred.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`Google 認証エラー: ${JSON.stringify(j)}`)
  token = j.access_token
  tokenExp = Date.now() + j.expires_in * 1000
  return token
}

async function synth(text, lang, voice) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lang, name: `${lang}-Chirp3-HD-${voice}` },
        // MP3 で受け取ると 32kbps 固定で音質が落ちるため、無圧縮（WAV）で受け取って自前で変換する
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: RATE },
      }),
    })
    if (res.ok) return toMp3(Buffer.from((await res.json()).audioContent, 'base64'))
    const body = await res.text()
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      continue
    }
    throw new Error(`Text-to-Speech エラー ${res.status}: ${body}`)
  }
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

// 前回作った内容（テキストのハッシュ）。変わったものだけ作り直す
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
let chars = 0
const started = Date.now()

outer: for (const v of voices) {
  console.log(`\n=== 声: ${v.label}（${v.voice}） ===`)
  for (const w of words) {
    for (const kind of CLIP_KINDS) {
      const c = clipText(w, kind)
      if (!c || !c.text) continue
      const path = clipPath(v.key, w.id, kind)
      const hash = createHash('sha1').update(`${v.voice}|${c.lang}|${RATE}|${QUALITY}|${c.text}`).digest('hex').slice(0, 12)
      if (!FORCE && manifest[path] === hash) {
        skipped++
        continue
      }
      if (made >= LIMIT) break outer
      const mp3 = await synth(c.text, c.lang, v.voice)
      const { error } = await sb.storage.from(BUCKET).upload(path, mp3, { upsert: true, contentType: 'audio/mpeg', cacheControl: '31536000' })
      if (error) throw error
      manifest[path] = hash
      made++
      chars += c.text.length
      if (made % 100 === 0) {
        await saveManifest()
        console.log(`  ${made} 件作成（${Math.round((Date.now() - started) / 1000)} 秒）`)
      }
    }
  }
}
await saveManifest()
// アプリが「どの声が使えるか」を知るための一覧
{
  const ready = {}
  for (const v of VOICES) ready[v.key] = Object.keys(manifest).some((p) => p.startsWith(`${v.key}/`))
  await sb.storage.from(BUCKET).upload('voices.json', JSON.stringify(ready), { upsert: true, contentType: 'application/json' })
}
console.log(`\n完了：新規 ${made} 件／変更なし ${skipped} 件／今回の文字数 ${chars.toLocaleString()} 文字`)
