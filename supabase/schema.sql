-- Supabase の SQL Editor に貼り付けて実行する

-- 利用を許可するユーザー（招待制）
create table if not exists public.allowed_users (
  email text primary key,
  created_at timestamptz not null default now()
);

-- 単語データ（本の内容。許可ユーザーのみ読める）
create table if not exists public.words (
  id integer primary key,
  round integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 学習記録（ユーザーごと）
create table if not exists public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_key text not null,
  data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_key)
);

alter table public.allowed_users enable row level security;
alter table public.words enable row level security;
alter table public.progress enable row level security;

-- ログイン中ユーザーのメールが allowed_users にあるか
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

drop policy if exists "words readable by allowed users" on public.words;
create policy "words readable by allowed users" on public.words
  for select to authenticated using (public.is_allowed());

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress
  for all to authenticated
  using (auth.uid() = user_id and public.is_allowed())
  with check (auth.uid() = user_id and public.is_allowed());

-- allowed_users には誰もアクセスできない（管理は SQL Editor / service role から）

-- 招待の例：
-- insert into public.allowed_users (email) values ('kyodaigooo@gmail.com');
