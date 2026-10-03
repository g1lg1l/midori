-- Midori schema. Every visitor is a Supabase anonymous user, so auth.uid() is their persistent member id.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id uuid not null references auth.users on delete cascade,
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', '') check (char_length(invite_code) >= 32),
  created_at timestamptz not null default now()
);

create table public.members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- unique names keep @mentions unambiguous
create unique index members_name_key on public.members (workspace_id, lower(name));
create index on public.members (user_id);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position double precision not null default 0,
  unique (workspace_id, id)
);

-- composite FKs keep a task's column (and a comment's task) inside the same workspace
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  column_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  position double precision not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, column_id) references public.columns (workspace_id, id) on delete cascade
);
create index on public.tasks (workspace_id, column_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid not null,
  author_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (workspace_id, task_id) references public.tasks (workspace_id, id) on delete cascade
);
create index on public.comments (workspace_id, task_id);

-- security definer so policies on members don't recurse into members' own RLS
create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where workspace_id = ws and user_id = auth.uid())
$$;

create function public.is_master(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces where id = ws and owner_id = auth.uid())
$$;

-- workspaces and memberships are only created through these two functions
create function public.create_workspace(workspace_name text, member_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  insert into public.workspaces (name, owner_id) values (workspace_name, auth.uid()) returning id into ws;
  insert into public.members (workspace_id, user_id, name) values (ws, auth.uid(), member_name);
  insert into public.columns (workspace_id, name, position) values (ws, 'To do', 1), (ws, 'Doing', 2), (ws, 'Done', 3);
  return ws;
end $$;

create function public.join_workspace(code text, member_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select id into ws from public.workspaces where invite_code = code;
  if ws is null then
    raise exception 'Invalid invite link' using errcode = 'P0002';
  end if;
  insert into public.members (workspace_id, user_id, name) values (ws, auth.uid(), member_name)
  on conflict (workspace_id, user_id) do nothing;
  return ws;
end $$;

revoke execute on function public.is_member(uuid), public.is_master(uuid),
  public.create_workspace(text, text), public.join_workspace(text, text) from public, anon;
grant execute on function public.is_member(uuid), public.is_master(uuid),
  public.create_workspace(text, text), public.join_workspace(text, text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.columns enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;

create policy "members read" on public.workspaces for select to authenticated using (public.is_member(id));
create policy "master updates" on public.workspaces for update to authenticated using (owner_id = (select auth.uid()));
create policy "master deletes" on public.workspaces for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members read" on public.members for select to authenticated using (public.is_member(workspace_id));
create policy "rename self" on public.members for update to authenticated using (user_id = (select auth.uid()));

create policy "members read" on public.columns for select to authenticated using (public.is_member(workspace_id));
create policy "master manages" on public.columns for all to authenticated
  using (public.is_master(workspace_id)) with check (public.is_master(workspace_id));

create policy "members read" on public.tasks for select to authenticated using (public.is_member(workspace_id));
create policy "members create own" on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(workspace_id));
create policy "author or master updates" on public.tasks for update to authenticated
  using ((created_by = (select auth.uid()) and public.is_member(workspace_id)) or public.is_master(workspace_id));
create policy "author or master deletes" on public.tasks for delete to authenticated
  using ((created_by = (select auth.uid()) and public.is_member(workspace_id)) or public.is_master(workspace_id));

create policy "members read" on public.comments for select to authenticated using (public.is_member(workspace_id));
create policy "members comment" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(workspace_id));
create policy "author edits" on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and public.is_member(workspace_id));
create policy "author or master deletes" on public.comments for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_member(workspace_id)) or public.is_master(workspace_id));

-- ownership columns (owner_id, workspace_id, created_by, author_id) are immutable
revoke update on public.workspaces, public.members, public.columns, public.tasks, public.comments from anon, authenticated;
grant update (name, invite_code) on public.workspaces to authenticated;
grant update (name) on public.members to authenticated;
grant update (name, position) on public.columns to authenticated;
grant update (column_id, title, description, position) on public.tasks to authenticated;
grant update (body, mentions) on public.comments to authenticated;

alter publication supabase_realtime add table public.workspaces, public.members, public.columns, public.tasks, public.comments;
