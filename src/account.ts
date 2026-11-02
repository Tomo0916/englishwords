/**
 * ニックネームでの登録・ログイン。
 * Supabase のログインはメールアドレスが必要なので、ニックネームを「メールアドレスの形」に置き換えて使う
 * （例：たろう → n-e3819fe3828be38186@nick.englishwords.local）。メールは送らないので届かない宛先で問題ない。
 * 入力に @ があればふつうのメールアドレスとして扱う。
 */
const NICK_DOMAIN = 'nick.englishwords.local'

const toHex = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new TextDecoder().decode(new Uint8Array(h.match(/../g)?.map((x) => parseInt(x, 16)) ?? []))

/** ニックネームを整える（全角英数→半角、英字は小文字。大文字小文字は区別しない） */
export const normalizeNick = (s: string) => s.normalize('NFKC').trim().toLowerCase()

/** ニックネームとして使えるか。使えないときは理由を返す */
export function nickProblem(s: string): string | null {
  const n = normalizeNick(s)
  if (n.length < 2) return 'ニックネームは2文字以上にしてください。'
  if (n.length > 20) return 'ニックネームは20文字以内にしてください。'
  if (/\s/.test(n)) return 'ニックネームに空白は使えません。'
  return null
}

export const isEmailInput = (s: string) => s.includes('@')

/** 入力（ニックネームかメールアドレス）→ Supabase に渡すメールアドレス */
export function toAuthEmail(input: string) {
  return isEmailInput(input) ? input.trim().toLowerCase() : `n-${toHex(normalizeNick(input))}@${NICK_DOMAIN}`
}

/** Supabase のメールアドレス → 画面に出す名前（ニックネームなら元に戻す） */
export function displayName(email: string | null | undefined) {
  if (!email) return ''
  const m = email.toLowerCase().match(new RegExp(`^n-([0-9a-f]+)@${NICK_DOMAIN.replace(/\./g, '\\.')}$`))
  return m ? fromHex(m[1]) : email
}

export const isNickAccount = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${NICK_DOMAIN}`)
