-- 単語帳の絵：招待されたユーザーだけが images バケットを読めるようにする
-- Supabase の SQL Editor に貼り付けて Run（何度実行しても大丈夫）。members.sql を先に実行しておくこと。
-- 絵のファイル（{番号}.webp と index.json）は、ダッシュボードの Storage から images バケットにアップロードする。
-- 本の絵は著作物なので、GitHub には置かない。

insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "images readable by allowed users" on storage.objects;
create policy "images readable by allowed users" on storage.objects
  for select to authenticated
  using (bucket_id = 'images' and public.is_allowed());
