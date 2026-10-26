/**
 * 音声のバリエーション。Google Cloud Text-to-Speech「Chirp 3: HD」の声を使う。
 * 声を増やすときは、ここに1行足して GitHub Actions の「Generate audio」を実行するだけ。
 * 候補（2026年時点）
 *   女性: Achernar Aoede Autonoe Callirrhoe Despina Erinome Gacrux Kore Laomedeia Leda Pulcherrima Sulafat Vindemiatrix Zephyr
 *   男性: Achird Algenib Algieba Alnilam Charon Enceladus Fenrir Iapetus Orus Puck Rasalgethi Sadachbia Sadaltager Schedar Umbriel Zubenelgenubi
 * scripts/generate-audio.mjs もこのファイルを読む（key・voice・enabled を使用）
 */
export interface VoiceDef {
  /** 保存フォルダ名（変えると作り直しになる） */
  key: string
  /** 設定画面での表示名 */
  label: string
  /** Chirp 3: HD の声の名前（英語・日本語とも同じ声を使う） */
  voice: string
}

export const VOICES: VoiceDef[] = [
  { key: 'female', label: '女性', voice: 'Kore' },
  { key: 'male', label: '男性', voice: 'Charon' },
  // 例：{ key: 'female-high', label: '女性（高め）', voice: 'Leda' },
  // 例：{ key: 'male-low', label: '男性（低め）', voice: 'Algenib' },
]
