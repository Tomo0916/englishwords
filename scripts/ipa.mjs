// 本の発音記号（日本の教材式：強勢は母音のアクセント記号 á など）を、
// 音声合成に渡せる標準的な IPA（強勢は ˈ を音節の頭に置く）に変換する。
// 例：disáid → dɪˈsaɪd、impɔ́ːrtənt → ɪmˈpɔːrtənt

const VOWELS = 'aeiouæɑɔəʌɛɪʊ'
// 音節の頭に来られる子音の組み合わせ（2〜3文字）
const ONSETS = ['stj', 'spj', 'skj', 'tj', 'dj', 'sj', 'nj', 'lj', 'θj', 'spr', 'str', 'skr', 'skw', 'spl', 'pr', 'br', 'tr', 'dr', 'kr', 'gr', 'fr', 'θr', 'ʃr', 'pl', 'bl', 'kl', 'gl', 'fl', 'sl',
  'sp', 'st', 'sk', 'sm', 'sn', 'sw', 'kw', 'tw', 'dw', 'gw', 'tʃ', 'dʒ', 'pj', 'bj', 'kj', 'fj', 'mj', 'nj', 'vj', 'hj']

/** 強勢記号を置く位置（子音のかたまりの中で、音節の頭になる所）を探す */
function onsetStart(s, vowelIdx) {
  let i = vowelIdx
  while (i > 0 && !VOWELS.includes(s[i - 1]) && s[i - 1] !== 'ː' && s[i - 1] !== ' ') i--
  const cluster = s.slice(i, vowelIdx)
  for (let k = cluster.length; k > 0; k--) {
    const tail = cluster.slice(cluster.length - k)
    if (k === 1 || ONSETS.includes(tail)) return vowelIdx - k
  }
  return vowelIdx
}

export function bookIpaToIpa(src) {
  if (!src) return null
  let s = src.split(',')[0].trim().normalize('NFC')
  // アクセント付き母音を探して強勢記号に置き換える（第1強勢 ˈ・第2強勢 ˌ）
  const marks = []
  let out = ''
  for (const ch of s.normalize('NFD')) {
    if (ch === '́' || ch === '̀') {
      marks.push({ at: out.length - 1, mark: ch === '́' ? 'ˈ' : 'ˌ' })
      continue
    }
    out += ch
  }
  s = out
  // 後ろから入れていく（位置がずれないように）
  for (const { at, mark } of marks.sort((a, b) => b.at - a.at)) {
    const pos = at > 0 ? onsetStart(s, at) : 0
    s = s.slice(0, pos) + mark + s.slice(pos)
  }
  // 教材式の二重母音・r の表記を標準 IPA に寄せる
  s = s
    .replace(/ai/g, 'aɪ').replace(/ei/g, 'eɪ').replace(/ɔi/g, 'ɔɪ').replace(/au/g, 'aʊ').replace(/ou/g, 'oʊ')
    .replace(/iər/g, 'ɪər').replace(/uər/g, 'ʊər')
    .replace(/(?<![ː])i(?![ː])/g, 'ɪ').replace(/(?<![ː])u(?![ː])/g, 'ʊ')
    .replace(/ɪː/g, 'iː').replace(/ʊː/g, 'uː')
    .replace(/r/g, 'ɹ')
    .replace(/g/g, 'ɡ')
    .replace(/\([^)]*\)/g, '') // 省略可能な音 (ː)(i) は省く（アメリカ英語寄り）
    .replace(/e(?!ɪ)/g, 'ɛ') // 短い「エ」は ɛ（eɪ はそのまま）
  return s
}

// 動作確認：node scripts/ipa.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const x of ['disáid', 'hǽv', 'ríːd', 'impɔ́ːrtənt', 'kwáiət', 'stjúːdnt', 'pɑ́pjələr', 'dífikʌlt', 'ìntərnǽʃənəl', 'ǽksədənt', 'kɑ́ntest'])
    console.log(x.padEnd(14), bookIpaToIpa(x))
}
