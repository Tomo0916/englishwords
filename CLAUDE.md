# englishwords（英単語1400）— Claude 向けメモ

- 利用者（先生）は GUI 派。手順は画面操作で、細かく書く。返答は日本語
- 変更は `claude/…` ブランチに push してプルリクエストを作る。main に直接 push しない
- PR を作る前に、前の PR が Merge 済みか確認する（Merge 後に同じブランチへ足しても main に入らない → 新しい PR）
- **ユーザーに見える改善をしたら、同じ PR で `src/changelog.ts` の先頭にお知らせを足す**（生徒向けのやさしい言葉で。講師だけの機能は `audience: 'teacher'`）
- 教材データ（data/、words の CSV）は著作物なので GitHub に置かない。secret key・Google の鍵を扱わない
- Supabase の SQL を変えたら `supabase/*.sql` に入れ、ローカルの Postgres で試してから、先生に SQL Editor での実行手順を伝える
