// Google Cloud Text-to-Speech（Chirp 3: HD）の呼び出し。generate-audio / audio-test から使う
import { execFileSync } from 'node:child_process'
import { createSign } from 'node:crypto'

let cred = null
let token = null
let tokenExp = 0

async function accessToken() {
  cred ??= JSON.parse(process.env.GOOGLE_CREDENTIALS ?? 'null')
  if (!cred) throw new Error('GOOGLE_CREDENTIALS がありません')
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

/** WAV → MP3（モノラル・前後の無音を整える） */
export function toMp3(wav, bitrate = '96k') {
  return execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
     '-af', // 前後の長い無音だけを詰める。語頭の s・語尾の t などの小さな音を削らないよう、しきい値を低く（-65dB）し、前0.12秒・後0.25秒は残す
     'silenceremove=start_periods=1:start_threshold=-65dB:start_silence=0.12,areverse,silenceremove=start_periods=1:start_threshold=-65dB:start_silence=0.25,areverse',
     '-ac', '1', '-c:a', 'libmp3lame', '-b:a', bitrate, '-f', 'mp3', 'pipe:1'],
    { input: wav, maxBuffer: 64 * 1024 * 1024 },
  )
}

/**
 * 音声を作る（WAV のバッファを返す）
 * @param {{text: string, lang: string, voice: string, rate?: number, ipa?: {phrase: string, ipa: string}[]}} o
 */
export async function googleSynth({ text, lang, voice, rate = 0.95, ipa, name, ssml }) {
  // name を渡すと Chirp 以外の声（例 en-US-Studio-O、en-US-Neural2-F）。ssml を渡すと SSML で読ませる
  const input = ssml ? { ssml } : { text }
  if (ipa?.length && !ssml)
    input.customPronunciations = {
      pronunciations: ipa.map((p) => ({ phrase: p.phrase, phoneticEncoding: 'PHONETIC_ENCODING_IPA', pronunciation: p.ipa })),
    }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        input,
        voice: { languageCode: lang, name: name ?? `${lang}-Chirp3-HD-${voice}` },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: rate },
      }),
    })
    if (res.ok) return Buffer.from((await res.json()).audioContent, 'base64')
    const body = await res.text()
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      continue
    }
    throw new Error(`Google Text-to-Speech エラー ${res.status}: ${body}`)
  }
}

/** OpenAI の音声合成（指示文で読み方を指定できる）。WAV を返す */
export async function openaiSynth({ text, voice = 'coral', instructions }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY がありません')
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, instructions, response_format: 'wav' }),
  })
  if (!res.ok) throw new Error(`OpenAI エラー ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}
