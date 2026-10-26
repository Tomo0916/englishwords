// 同じ単語をいくつかの方法で音声化して、聞き比べ用に audio/test/ に保存する。
// GitHub Actions の「Audio test」から実行。
//   WORDS  比べる単語の番号（カンマ区切り）。既定 2,10,12,61,68,200（decide, popular, difficult, understand, beautiful, important）
import { createClient } from '@supabase/supabase-js'
import { bookIpaToIpa } from './ipa.mjs'
import { googleSynth, openaiSynth, toMp3 } from './tts-google.mjs'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const ids = (process.env.WORDS || '2,10,12,61,68,200').split(',').map((s) => Number(s.trim())).filter(Boolean)

const { data, error } = await sb.from('words').select('data').in('id', ids)
if (error) throw error
const words = data.map((r) => r.data)

const INSTR =
  'You are a native American English dictionary narrator. Read the single headword clearly and naturally, ' +
  'with correct dictionary stress and a calm falling (statement) intonation. Do not add any other words.'

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
/** SSML の <phoneme> で発音記号を指定（Studio・Neural2 用） */
const ssmlIpa = (w) => `<speak><phoneme alphabet="ipa" ph="${esc(bookIpaToIpa(w.ipa))}">${esc(w.word)}</phoneme>.</speak>`
const chirpIpa = (voice) => (w) => googleSynth({ text: `${w.word}.`, lang: 'en-US', voice, ipa: [{ phrase: w.word, ipa: bookIpaToIpa(w.ipa) }] })

const variants = [
  { key: '1-chirp-kore', note: 'Chirp 3 HD 女性 Kore（前回の3番）', make: chirpIpa('Kore') },
  { key: '2-chirp-aoede', note: 'Chirp 3 HD 女性 Aoede', make: chirpIpa('Aoede') },
  { key: '3-chirp-puck', note: 'Chirp 3 HD 男性 Puck', make: chirpIpa('Puck') },
  { key: '4-studio-f', note: 'Studio 女性（O）＋発音記号', make: (w) => googleSynth({ lang: 'en-US', name: 'en-US-Studio-O', ssml: ssmlIpa(w) }) },
  { key: '5-studio-m', note: 'Studio 男性（Q）＋発音記号', make: (w) => googleSynth({ lang: 'en-US', name: 'en-US-Studio-Q', ssml: ssmlIpa(w) }) },
  { key: '6-neural2-f', note: 'Neural2 女性（F）＋発音記号', make: (w) => googleSynth({ lang: 'en-US', name: 'en-US-Neural2-F', ssml: ssmlIpa(w) }) },
  { key: '7-neural2-m', note: 'Neural2 男性（J）＋発音記号', make: (w) => googleSynth({ lang: 'en-US', name: 'en-US-Neural2-J', ssml: ssmlIpa(w) }) },
]
if (process.env.OPENAI_API_KEY) {
  variants.push(
    { key: '8-openai-f', note: 'OpenAI 女性（coral）：辞書の読み上げとして指示', make: (w) => openaiSynth({ text: w.word, voice: 'coral', instructions: INSTR }) },
    { key: '9-openai-m', note: 'OpenAI 男性（onyx）：同上', make: (w) => openaiSynth({ text: w.word, voice: 'onyx', instructions: INSTR }) },
  )
} else {
  console.log('（OPENAI_API_KEY が未登録なので、OpenAI の比較は省きます）')
}

// 前回の比較ファイルを消す
{
  const { data: old } = await sb.storage.from('audio').list('test', { limit: 1000 })
  if (old?.length) await sb.storage.from('audio').remove(old.map((f) => `test/${f.name}`))
}

for (const w of words) {
  console.log(`\n${w.id} ${w.word}  本の発音記号 [${w.ipa}] → IPA ${bookIpaToIpa(w.ipa)}`)
  for (const v of variants) {
    try {
      const mp3 = toMp3(await v.make(w))
      const path = `test/${w.word}-${v.key}.mp3`
      const { error: e } = await sb.storage.from('audio').upload(path, mp3, { upsert: true, contentType: 'audio/mpeg' })
      if (e) throw e
      console.log(`  ✓ ${path}  … ${v.note}`)
    } catch (e) {
      console.log(`  ✕ ${v.key}: ${e.message}`)
    }
  }
}
console.log('\nSupabase の Storage > audio > test で聞き比べてください')
