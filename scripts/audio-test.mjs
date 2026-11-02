// 一時的な確認用：ニックネーム形式のアカウントが本物の Supabase で登録できるか
import { createClient } from '@supabase/supabase-js'
const { toAuthEmail } = await import('../src/account.ts')
const url = process.env.SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const anonKey = process.env.ANON_KEY
const email = toAuthEmail('てすとClaude')
const note = (m) => console.log(`::notice::${m}`)
let uid = null
try {
  const sb = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signUp({ email, password: 'test-password-123' })
  if (error) { console.log(`::error::signUp失敗 ${error.status} ${error.code} ${error.message}`); process.exitCode = 1 }
  else {
    uid = data.user?.id
    note(`signUp成功 session=${!!data.session} confirmed=${!!data.user?.email_confirmed_at}`)
    if (data.session) {
      const r = await sb.rpc('request_join')
      note(`request_join=${JSON.stringify(r.data)} err=${r.error?.message ?? ''}`)
      const l = await sb.auth.signInWithPassword({ email, password: 'test-password-123' })
      note(`再ログイン ${l.error ? '失敗 ' + l.error.message : '成功'}`)
    } else { console.log('::error::sessionなし（Confirm email がオンの可能性）'); process.exitCode = 1 }
  }
} finally {
  if (!uid) { const { data } = await admin.auth.admin.listUsers({ perPage: 1000 }); uid = data?.users.find((u) => u.email === email)?.id }
  if (uid) { const d = await admin.auth.admin.deleteUser(uid); note(`試験ユーザー削除 ${d.error ? '失敗 ' + d.error.message : 'OK'}`) }
  await admin.from('join_requests').delete().eq('email', email)
  await admin.from('allowed_users').delete().eq('email', email)
  note('後片付け完了')
}
