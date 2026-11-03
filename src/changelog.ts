/**
 * お知らせ（アプリの改善の記録）。新しいものを先頭に足していく。
 * id は重ならない文字列（日付＋連番）。audience: 'teacher' は講師にだけ表示。
 */
export interface NewsItem {
  text: string
  audience?: 'teacher'
}
export interface NewsEntry {
  id: string
  date: string // YYYY-MM-DD
  title: string
  items: NewsItem[]
}

export const NEWS: NewsEntry[] = [
  {
    id: '2026-11-03-1',
    date: '2026-11-03',
    title: 'お知らせ欄ができました',
    items: [
      { text: 'アプリが新しくなったときは、ここ（画面右上のベルのマーク）で何が変わったかを確認できます。新しいお知らせがあるとベルに赤い点が付きます。' },
      { text: 'ボタンのマーク（設定・発音・戻る など）を、すっきりしたデザインに変えました。' },
    ],
  },
  {
    id: '2026-11-02-3',
    date: '2026-11-02',
    title: '修正リクエストを送れるようになりました',
    items: [
      { text: '単語カードの右下「修正リクエスト」（旗のマーク）から、意味・例文・答え・発音などのおかしいところを先生に知らせられます。' },
      { text: '講師用ページに修正リクエストの一覧。「未対応をまとめてコピー」で Claude に渡して直せます。', audience: 'teacher' },
    ],
  },
  {
    id: '2026-11-02-2',
    date: '2026-11-02',
    title: '問題が解きやすくなりました',
    items: [
      { text: '並び替え：語をドラッグして好きな位置に入れたり、入れ替えたりできるようになりました（タップでもこれまでどおり使えます）。' },
      { text: 'スペル：ヒントの頭文字が入力欄に最初から入っているので、続きだけ打てばOK（全部打っても正解になります）。' },
      { text: 'スペル・活用形：入力欄をタップすると英字のキーボードが出るようになりました。' },
    ],
  },
  {
    id: '2026-11-02-1',
    date: '2026-11-02',
    title: 'ログインと音声が快適になりました',
    items: [
      { text: 'ニックネームでも登録・ログインできるようになりました。' },
      { text: '電波が弱い所やオフラインでも、ログインし直さずに開けるようになりました。' },
      { text: '音声を先に読み込むので、すぐ鳴るようになりました。設定画面の「全単語の音声を保存」を Wi-Fi のときに押しておくと、電波がなくても音声が使えます。' },
      { text: '設定画面から自分のパスワードを変えられるようになりました。' },
      { text: '講師用ページ：新規登録の受付（自動承認）／停止（手動承認）、承認待ちの承認、メンバー管理、仮パスワードの発行。', audience: 'teacher' },
    ],
  },
  {
    id: '2026-10-31-1',
    date: '2026-10-31',
    title: '本物の発音で聞けるようになりました',
    items: [{ text: 'すべての単語・意味・例文・和訳に、自然なアメリカ英語と日本語の音声が付きました。設定で女性・男性の声を選べます。' }],
  },
]

const SEEN_KEY = 'news-seen'

/** その人に見せるお知らせ（講師向けの項目は講師だけ） */
export function newsFor(admin: boolean) {
  return NEWS.map((e) => ({ ...e, items: e.items.filter((i) => admin || i.audience !== 'teacher') })).filter((e) => e.items.length)
}

/** まだ見ていないお知らせがあるか（初めて開いた人には、最新の1件だけを新着として扱う） */
export function hasUnread(admin: boolean) {
  const latest = newsFor(admin)[0]
  if (!latest) return false
  try {
    return localStorage.getItem(SEEN_KEY) !== latest.id
  } catch {
    return false
  }
}

/** 最後に見たお知らせ（これより新しいものに「NEW」を付ける） */
export function lastSeen() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markSeen(admin: boolean) {
  const latest = newsFor(admin)[0]
  try {
    if (latest) localStorage.setItem(SEEN_KEY, latest.id)
  } catch {
    /* ignore */
  }
}
