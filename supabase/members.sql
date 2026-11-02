-- 生徒の新規登録（受付中は自動承認／停止中は先生が手動で承認）と、講師用ページのための設定。
-- Supabase の SQL Editor に貼り付けて Run（何度実行しても大丈夫）。
-- 実行後、最後の行の「あなたのメールアドレス」を自分のものに変えて、その1行だけもう一度 Run すると講師（管理者）になれる。

-- ---------- 以前の案（招待コード）の片付け ----------
drop function if exists public.check_invite(text);
drop function if exists public.redeem_invite(text);
drop function if exists public.admin_list_codes();
drop function if exists public.admin_create_code(text, int, int);
drop function if exists public.admin_set_code_active(text, boolean);
drop table if exists public.invite_codes;

-- ---------- メンバー（許可リスト）に項目を追加 ----------
alter table public.allowed_users add column if not exists is_admin boolean not null default false;
alter table public.allowed_users add column if not exists note text;

-- ---------- 受付の状態（1行だけ） ----------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  signup_open boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;
alter table public.app_settings enable row level security; -- 直接は誰も読めない（下の関数経由のみ）

-- ---------- 承認待ちの申請 ----------
create table if not exists public.join_requests (
  email text primary key,
  user_id uuid,
  status text not null default 'pending' check (status in ('pending', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.join_requests enable row level security;

-- ログイン中の人が講師（管理者）か
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where lower(email) = lower(auth.jwt() ->> 'email') and is_admin);
$$;

-- 登録した生徒が呼ぶ：受付中なら自動承認、停止中なら承認待ちにする
-- 戻り値 'approved'（使える）／'pending'（先生の確認待ち）
create or replace function public.request_join()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null then
    return 'pending';
  end if;
  if exists (select 1 from public.allowed_users where lower(email) = v_email) then
    return 'approved';
  end if;
  if (select signup_open from public.app_settings where id = 1) then
    insert into public.allowed_users (email, note) values (v_email, '自動承認 ' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI'))
    on conflict (email) do nothing;
    delete from public.join_requests where lower(email) = v_email;
    return 'approved';
  end if;
  insert into public.join_requests (email, user_id) values (v_email, auth.uid())
  on conflict (email) do update set user_id = excluded.user_id; -- 却下済みの人は却下のまま（先生に知らせてもらう）
  return 'pending';
end $$;

-- ---------- 講師用 ----------
create or replace function public.admin_get_signup()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  return (select signup_open from public.app_settings where id = 1);
end $$;

create or replace function public.admin_set_signup(p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  update public.app_settings set signup_open = p_open, updated_at = now() where id = 1;
end $$;

create or replace function public.admin_list_requests()
returns table (email text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  return query
    select r.email, r.status, r.created_at from public.join_requests r
    where not exists (select 1 from public.allowed_users a where lower(a.email) = lower(r.email))
    order by r.status, r.created_at;
end $$;

-- 承認（メールアドレスをまとめて渡せる）
create or replace function public.admin_approve(p_emails text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  insert into public.allowed_users (email, note)
  select lower(e), '手動承認 ' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI') from unnest(p_emails) e
  on conflict (email) do nothing;
  delete from public.join_requests where lower(email) = any (select lower(e) from unnest(p_emails) e);
end $$;

create or replace function public.admin_reject(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  update public.join_requests set status = 'rejected' where lower(email) = lower(p_email);
end $$;

create or replace function public.admin_list_members()
returns table (email text, note text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz, registered boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  return query
    select a.email, a.note, a.is_admin, a.created_at, u.last_sign_in_at, (u.id is not null)
    from public.allowed_users a
    left join auth.users u on lower(u.email) = lower(a.email)
    order by a.created_at desc;
end $$;

-- メールアドレスで直接追加（家族など。本人が登録するとすぐ使える）
create or replace function public.admin_add_member(p_email text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  insert into public.allowed_users (email, note) values (lower(trim(p_email)), nullif(trim(p_note), ''))
  on conflict (email) do update set note = excluded.note;
  delete from public.join_requests where lower(email) = lower(trim(p_email));
end $$;

-- 利用を止める（学習記録は残る。もう一度承認すれば元どおり）
create or replace function public.admin_remove_member(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  if lower(p_email) = lower(auth.jwt() ->> 'email') then raise exception '自分自身は外せません'; end if;
  delete from public.allowed_users where lower(email) = lower(p_email);
end $$;

-- パスワードを忘れた生徒に、仮のパスワードを設定する
create or replace function public.admin_reset_password(p_email text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  if length(p_password) < 8 then raise exception 'パスワードは8文字以上'; end if;
  if not exists (select 1 from public.allowed_users where lower(email) = lower(p_email)) then raise exception 'メンバーではありません'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email);
end $$;

-- 呼べる人を絞る（ログインした人だけ。講師用の関数は中でさらに講師か確かめる）
revoke all on function public.request_join() from public, anon;
revoke all on function public.admin_get_signup() from public, anon;
revoke all on function public.admin_set_signup(boolean) from public, anon;
revoke all on function public.admin_list_requests() from public, anon;
revoke all on function public.admin_approve(text[]) from public, anon;
revoke all on function public.admin_reject(text) from public, anon;
revoke all on function public.admin_list_members() from public, anon;
revoke all on function public.admin_add_member(text, text) from public, anon;
revoke all on function public.admin_remove_member(text) from public, anon;
revoke all on function public.admin_reset_password(text, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_allowed() to authenticated;
grant execute on function public.request_join() to authenticated;
grant execute on function public.admin_get_signup() to authenticated;
grant execute on function public.admin_set_signup(boolean) to authenticated;
grant execute on function public.admin_list_requests() to authenticated;
grant execute on function public.admin_approve(text[]) to authenticated;
grant execute on function public.admin_reject(text) to authenticated;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.admin_add_member(text, text) to authenticated;
grant execute on function public.admin_remove_member(text) to authenticated;
grant execute on function public.admin_reset_password(text, text) to authenticated;

-- ---------- 自分を講師（管理者）にする（メールアドレスを書き換えてこの1行を Run） ----------
-- update public.allowed_users set is_admin = true where lower(email) = lower('あなたのメールアドレス');
