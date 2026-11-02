-- 招待コードで生徒が自分で登録できるようにする＋アプリ内の「メンバー管理」画面用。
-- Supabase の SQL Editor に貼り付けて Run（何度実行しても大丈夫）。
-- 実行後、最後の行の「あなたのメールアドレス」を自分のものに変えて、その1行だけもう一度 Run すると管理者になれる。

-- ---------- メンバー（許可リスト）に項目を追加 ----------
alter table public.allowed_users add column if not exists is_admin boolean not null default false;
alter table public.allowed_users add column if not exists note text;

-- ---------- 招待コード ----------
create table if not exists public.invite_codes (
  code text primary key,
  note text,                       -- メモ（例：3年A組）
  max_uses int,                    -- 使える人数（空なら無制限）
  uses int not null default 0,     -- 使われた回数
  expires_at timestamptz,          -- 期限（空なら無期限）
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security; -- 直接は誰も読めない（下の関数経由のみ）

-- ログイン中の人が管理者か
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where lower(email) = lower(auth.jwt() ->> 'email') and is_admin);
$$;

-- コードが今使えるか（登録前の確認用。ログイン前でも呼べる）
create or replace function public.check_invite(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(trim(p_code)) and active
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses)
  );
$$;

-- コードを使って、ログイン中の自分を許可リストに入れる
create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  c public.invite_codes;
begin
  if auth.uid() is null or v_email is null then
    return false;
  end if;
  if exists (select 1 from public.allowed_users where lower(email) = v_email) then
    return true;
  end if;
  select * into c from public.invite_codes where code = upper(trim(p_code)) for update;
  if not found or not c.active
     or (c.expires_at is not null and c.expires_at <= now())
     or (c.max_uses is not null and c.uses >= c.max_uses) then
    return false;
  end if;
  insert into public.allowed_users (email, note) values (v_email, coalesce(c.note, '') || '（コード ' || c.code || '）');
  update public.invite_codes set uses = uses + 1 where code = c.code;
  return true;
end $$;

-- ---------- 管理者用 ----------
create or replace function public.admin_list_members()
returns table (email text, note text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz, registered boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  return query
    select a.email, a.note, a.is_admin, a.created_at, u.last_sign_in_at, (u.id is not null)
    from public.allowed_users a
    left join auth.users u on lower(u.email) = lower(a.email)
    order by a.created_at desc;
end $$;

create or replace function public.admin_list_codes()
returns setof public.invite_codes
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  return query select * from public.invite_codes order by created_at desc;
end $$;

-- 新しい招待コードを作る（紛らわしい文字 0/O・1/I/L を使わない6文字）
create or replace function public.admin_create_code(p_note text, p_max_uses int, p_days int)
returns text language plpgsql security definer set search_path = public as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v text;
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  loop
    v := '';
    for i in 1..6 loop
      v := v || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes where code = v);
  end loop;
  insert into public.invite_codes (code, note, max_uses, expires_at)
  values (v, nullif(trim(p_note), ''), p_max_uses, case when p_days is null then null else now() + make_interval(days => p_days) end);
  return v;
end $$;

create or replace function public.admin_set_code_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  update public.invite_codes set active = p_active where code = p_code;
end $$;

-- メンバーを追加（メールアドレスだけ先に許可しておく。本人はコードなしで登録できる）
create or replace function public.admin_add_member(p_email text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  insert into public.allowed_users (email, note) values (lower(trim(p_email)), nullif(trim(p_note), ''))
  on conflict (email) do update set note = excluded.note;
end $$;

-- 利用を止める（学習記録は残る。もう一度許可すれば元どおり）
create or replace function public.admin_remove_member(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  if lower(p_email) = lower(auth.jwt() ->> 'email') then raise exception '自分自身は外せません'; end if;
  delete from public.allowed_users where lower(email) = lower(p_email);
end $$;

-- パスワードを忘れた生徒に、仮のパスワードを設定する
create or replace function public.admin_reset_password(p_email text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception '管理者のみ'; end if;
  if length(p_password) < 8 then raise exception 'パスワードは8文字以上'; end if;
  if not exists (select 1 from public.allowed_users where lower(email) = lower(p_email)) then raise exception 'メンバーではありません'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email);
end $$;

-- 呼べる人を絞る
revoke all on function public.check_invite(text) from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.admin_list_members() from public, anon;
revoke all on function public.admin_list_codes() from public, anon;
revoke all on function public.admin_create_code(text, int, int) from public, anon;
revoke all on function public.admin_set_code_active(text, boolean) from public, anon;
revoke all on function public.admin_add_member(text, text) from public, anon;
revoke all on function public.admin_remove_member(text) from public, anon;
revoke all on function public.admin_reset_password(text, text) from public, anon;
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_allowed() to authenticated;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.admin_list_codes() to authenticated;
grant execute on function public.admin_create_code(text, int, int) to authenticated;
grant execute on function public.admin_set_code_active(text, boolean) to authenticated;
grant execute on function public.admin_add_member(text, text) to authenticated;
grant execute on function public.admin_remove_member(text) to authenticated;
grant execute on function public.admin_reset_password(text, text) to authenticated;

-- ---------- 自分を管理者にする（メールアドレスを書き換えてこの1行を Run） ----------
-- update public.allowed_users set is_admin = true where lower(email) = lower('あなたのメールアドレス');
