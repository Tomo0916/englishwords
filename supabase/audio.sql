-- 音声ファイル用：招待されたユーザーだけが audio バケットを読めるようにする
-- （バケット自体は音声生成ワークフローが自動で作る。先にこの SQL を実行しておいて問題ない）

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

drop policy if exists "audio readable by allowed users" on storage.objects;
create policy "audio readable by allowed users" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and public.is_allowed());
