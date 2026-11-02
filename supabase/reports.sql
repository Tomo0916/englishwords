-- 修正リクエスト（生徒が単語の誤りを報告し、講師用ページで確認する）。
-- Supabase の SQL Editor に貼り付けて Run（何度実行しても大丈夫）。members.sql を先に実行しておくこと。

create table if not exists public.reports (
  id bigserial primary key,
  word_id int not null,
  user_id uuid not null default auth.uid(),
  email text not null default lower(auth.jwt() ->> 'email'),
  category text not null,
  message text not null default '',
  context text,                       -- どの画面から送ったか（クイズのモードなど）
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- 承認済みのメンバーは、自分の名前で送れる（読む・消すは講師用の関数経由のみ）
drop policy if exists "members can report" on public.reports;
create policy "members can report" on public.reports
  for insert to authenticated
  with check (
    public.is_allowed()
    and user_id = auth.uid()
    and email = lower(auth.jwt() ->> 'email')
    and status = 'open'
    and length(message) <= 1000
    and length(category) <= 40
  );
grant insert on public.reports to authenticated;
grant usage, select on sequence public.reports_id_seq to authenticated;

create or replace function public.admin_list_reports(p_status text)
returns setof public.reports
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  return query
    select * from public.reports
    where p_status is null or status = p_status
    order by created_at desc
    limit 300;
end $$;

create or replace function public.admin_set_report_status(p_ids bigint[], p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '講師のみ'; end if;
  update public.reports
  set status = p_status, resolved_at = case when p_status = 'open' then null else now() end
  where id = any (p_ids);
end $$;

revoke all on function public.admin_list_reports(text) from public, anon;
revoke all on function public.admin_set_report_status(bigint[], text) from public, anon;
grant execute on function public.admin_list_reports(text) to authenticated;
grant execute on function public.admin_set_report_status(bigint[], text) to authenticated;
