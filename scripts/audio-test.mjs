// 同じ単語をいくつかの方法で音声化して、聞き比べ用に audio/test/ に保存する。
// GitHub Actions の「Audio test」から実行。
//   WORDS  比べる単語の番号（カンマ区切り）。既定 2,4,5（decide, have, read）
import { createClient } from '@supabase/supabase-js'
import { bookIpaToIpa } from './ipa.mjs'
import { googleSynth, openaiSynth, toMp3 } from './tts-google.mjs'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const ids = (process.env.WORDS || '2,4,5').split(',').map((s) => Number(s.trim())).filter(Boolean)

const { data, error } = await sb.from('words').select('data').in('id', ids)
if (error) throw error
const words = data.map((r) => r.data)

const INSTR =
  'You are a native American English dictionary narrator. Read the single headword clearly and naturally, ' +
  'with correct dictionary stress and a calm falling (statement) intonation. Do not add any other words.'

const variants = [
  { key: '1-google-plain', note: 'Google：今までと同じ（単語だけ）', make: (w) => googleSynth({ text: w.word, lang: 'en-US', voice: 'Kore' }) },
  { key: '2-google-period', note: 'Google：単語の後ろに「.」', make: (w) => googleSynth({ text: `${w.word}.`, lang: 'en-US', voice: 'Kore' }) },
  {
    key: '3-google-ipa',
    note: 'Google：「.」＋本の発音記号で読み方を指定',
    make: (w) => googleSynth({ text: `${w.word}.`, lang: 'en-US', voice: 'Kore', ipa: [{ phrase: w.word, ipa: bookIpaToIpa(w.ipa) }] }),
  },
  {
    key: '4-google-ipa-male',
    note: 'Google 男性（Charon）：3と同じ方法',
    make: (w) => googleSynth({ text: `${w.word}.`, lang: 'en-US', voice: 'Charon', ipa: [{ phrase: w.word, ipa: bookIpaToIpa(w.ipa) }] }),
  },
]
if (process.env.OPENAI_API_KEY) {
  variants.push(
    { key: '5-openai-female', note: 'OpenAI 女性（coral）：辞書の読み上げとして指示', make: (w) => openaiSynth({ text: w.word, voice: 'coral', instructions: INSTR }) },
    { key: '6-openai-male', note: 'OpenAI 男性（onyx）：同上', make: (w) => openaiSynth({ text: w.word, voice: 'onyx', instructions: INSTR }) },
  )
} else {
  console.log('（OPENAI_API_KEY が未登録なので、OpenAI の比較は省きます）')
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
