-- Board configuration: per-column look and lock, project-wide edit rule, tiny image uploads.

alter table public.workspaces
  add column members_edit_all boolean not null default false;

alter table public.columns
  add column emoji text not null default '' check (char_length(emoji) <= 16),
  add column color text not null default 'mint' check (color in ('mint', 'sky', 'peach', 'lilac', 'lemon', 'rose')),
  add column locked boolean not null default false;

grant update (members_edit_all) on public.workspaces to authenticated;
grant update (emoji, color, locked) on public.columns to authenticated;

-- The master can do anything. Members need the column unlocked, and the task to be
-- their own unless the project lets members edit everyone's tasks.
create function public.can_write_task(ws uuid, col uuid, author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_master(ws) or (
    public.is_member(ws)
    and not coalesce((select locked from public.columns where id = col), true)
    and (author = auth.uid() or coalesce((select members_edit_all from public.workspaces where id = ws), false))
  )
$$;

drop policy "members create own" on public.tasks;
drop policy "author or master updates" on public.tasks;
drop policy "author or master deletes" on public.tasks;

create policy "members create own" on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_write_task(workspace_id, column_id, created_by));
-- using checks the column a task leaves, with check the column it lands in
create policy "allowed members update" on public.tasks for update to authenticated
  using (public.can_write_task(workspace_id, column_id, created_by))
  with check (public.can_write_task(workspace_id, column_id, created_by));
create policy "allowed members delete" on public.tasks for delete to authenticated
  using (public.can_write_task(workspace_id, column_id, created_by));

create or replace function public.create_workspace(workspace_name text, member_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  insert into public.workspaces (name, owner_id) values (workspace_name, auth.uid()) returning id into ws;
  insert into public.members (workspace_id, user_id, name) values (ws, auth.uid(), member_name);
  insert into public.columns (workspace_id, name, emoji, color, position) values
    (ws, 'Ideas', '💡', 'lemon', 1),
    (ws, 'To do', '📋', 'sky', 2),
    (ws, 'Doing', '🔨', 'peach', 3),
    (ws, 'Done', '🎉', 'mint', 4);
  return ws;
end $$;

-- Images: public bucket, 150 KB per file, webp/jpeg only (the client shrinks before upload),
-- stored as <project id>/<uuid>, and at most 300 per project to protect the free tier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 153600, array['image/webp', 'image/jpeg']);

create function public.image_count(ws uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from storage.objects where bucket_id = 'images' and name like ws::text || '/%'
$$;

create policy "members upload small images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'images'
    and public.is_member(((storage.foldername(name))[1])::uuid)
    and public.image_count(((storage.foldername(name))[1])::uuid) < 300
  );

revoke execute on function public.can_write_task(uuid, uuid, uuid), public.image_count(uuid) from public, anon;
grant execute on function public.can_write_task(uuid, uuid, uuid), public.image_count(uuid) to authenticated;
