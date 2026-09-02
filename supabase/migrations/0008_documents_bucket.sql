-- Documents : versionne le bucket Storage et ses policies RLS, créés
-- directement en base lors du chantier "documents" — jamais versionnés
-- jusqu'ici (signalé par une autre session, le repo doit rester la
-- source de vérité). Chaque fichier est stocké sous <user_id>/<nom>,
-- donc storage.foldername(name)[1] = auth.uid() garantit l'isolement.
-- Idempotent : le bucket et les policies existent déjà en prod.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_select_own'
  ) then
    create policy "documents_select_own" on storage.objects
      for select using (
        bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_insert_own'
  ) then
    create policy "documents_insert_own" on storage.objects
      for insert with check (
        bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_delete_own'
  ) then
    create policy "documents_delete_own" on storage.objects
      for delete using (
        bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
