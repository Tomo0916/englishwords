/**
 * 音声のバリエーション（Google Cloud Text-to-Speech）。
 * 英語は聞き比べで一番安定していた「Studio」、日本語は Studio に声がないため「Chirp 3: HD」を使う。
 * 声を増やすときは、ここに1行足して GitHub Actions の「Generate audio」を実行するだけ。
 *   英語 Studio（en-US）: Studio-O（女性）、Studio-Q（男性）
 *   日本語 Chirp 3: HD（ja-JP）: 女性 Kore Aoede Leda Zephyr …／男性 Charon Puck Fenrir Orus …
 *   pitch は英語の高さを半音単位で上下（例 +2 で少し高め、-2 で少し低め）
 * scripts/generate-audio.mjs もこのファイルを読む
 */
export interface VoiceDef {
  /** 保存フォルダ名（変えると作り直しになる） */
  key: string
  /** 設定画面での表示名 */
  label: string
  /** 英語の声（Google の voice name） */
  en: string
  /** 日本語の声（Google の voice name） */
  ja: string
  /** 英語の声の高さ（半音。省略で 0） */
  pitch?: number
}

export const VOICES: VoiceDef[] = [
  { key: 'female', label: '女性', en: 'en-US-Studio-O', ja: 'ja-JP-Chirp3-HD-Kore' },
  { key: 'male', label: '男性', en: 'en-US-Studio-Q', ja: 'ja-JP-Chirp3-HD-Charon' },
  // 例：{ key: 'female-high', label: '女性（高め）', en: 'en-US-Studio-O', ja: 'ja-JP-Chirp3-HD-Leda', pitch: 2 },
  // 例：{ key: 'male-low', label: '男性（低め）', en: 'en-US-Studio-Q', ja: 'ja-JP-Chirp3-HD-Orus', pitch: -2 },
]
