# englishwords

単語帳（全1400語）と連動して覚える英単語 PWA。

- 学習モード：英→日（4択）／日→英（4択）／例文穴埋め／並び替え／スペル入力／活用形／ミックス
- 本と同じ番号・掲載ページ・□□□チェック、赤シート風の一覧
- 正解はすぐ次へ、間違いは解説を表示して数問後に再出題、さらに間隔反復で後日復習
- 合成音声で発音・例文を再生
- 学習記録は Supabase で端末間同期（オフライン時は端末に保存し、オンライン復帰時に同期）

**本の内容（単語データ）はこのリポジトリに含めません。** Supabase の `words` テーブルに置き、招待したユーザーだけが読めるようにしています。

## 構成

| | |
|---|---|
| フロント | React 19 + TypeScript + Vite、vite-plugin-pwa |
| 公開 | GitHub Pages（GitHub Actions でビルド） |
| データ・認証・同期 | Supabase（メールのワンタイムコードでログイン、RLS で招待制） |

```
src/
  App.tsx            画面遷移・出題セットの作成
  components/        Home / Quiz / Result / WordList / WordCard / Login
  quiz.ts            出題ロジック（誤答選択肢、例文の見出し語検出、並び替え、活用形判定）
  progress.ts        習熟度・間隔反復・Supabase 同期
  data.ts            単語データの取得とキャッシュ
  speech.ts          読み上げ（将来、音声ファイルに差し替え可能）
supabase/schema.sql  テーブルと RLS
scripts/import-words.mjs  data/*.json を Supabase に投入
data/                単語データ（gitignore）
```

## セットアップ

### 1. Supabase

1. SQL Editor で `supabase/schema.sql` を実行
2. 利用者を招待：`insert into public.allowed_users (email) values ('you@example.com');`
3. Authentication > Users で同じメールのユーザーを作成（Invite user）
   - アプリ側は `shouldCreateUser: false` なので、ここで作ったユーザーしかログインできません
4. Authentication > URL Configuration
   - Site URL：`https://tomo0916.github.io/englishwords/`
   - Redirect URLs に同じ URL と `http://localhost:5173/` を追加
5. Authentication > Emails > Magic Link のテンプレートに `{{ .Token }}` を入れると、6桁コードでもログインできます（ホーム画面に追加した PWA ではリンクより便利）

### 2. 単語データの投入

```sh
npm install
# data/round01.json など（形式は src/types.ts の Word）を置いて
SUPABASE_URL=https://ulsnntrtbclygydczmys.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=（API Keys の secret key：sb_secret_...） \
node scripts/import-words.mjs
```

環境変数なしで実行すると `public/local-data/words.json` だけ書き出します（ローカル開発用）。

### 3. ローカル開発

```sh
cp .env.example .env.local   # anon key を記入。空ならローカルデータでログインなしで動く
npm run dev
```

### 4. GitHub Pages

1. Settings > Pages > Source を **GitHub Actions** に
2. Settings > Secrets and variables > Actions > **Variables** に
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`（publishable key：sb_publishable_...。公開前提の鍵で、データは RLS で守られる）
3. `main` に push すると自動デプロイ

## データ形式

`src/types.ts` の `Word` を参照。1ファイル＝1 ROUND（`data/round01.json`〜）。
