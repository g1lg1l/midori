-- Reports from apps (a game's crash log): a per-project secret key lets an app add a card to the
-- project's Debug column without an account, through send_report. The same report again (same
-- title) comments on its card instead, and a project takes at most 30 reports an hour.

alter table public.workspaces
  add column report_key text not null unique default replace(gen_random_uuid()::text, '-', '')
    check (char_length(report_key) >= 32);
grant update (report_key) on public.workspaces to authenticated;

-- One row per report taken, for the hourly limit; only send_report reads and writes it.
create table public.report_hits (
  workspace_id uuid not null references public.workspaces on delete cascade,
  at timestamptz not null default now()
);
create index on public.report_hits (workspace_id, at);
alter table public.report_hits enable row level security;

create function public.send_report(key text, title text, body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ws public.workspaces;
  col uuid;
  card uuid;
  named text := left(coalesce(nullif(btrim(title), ''), 'Report'), 200);
begin
  select * into ws from public.workspaces w where w.report_key = key;
  if ws.id is null then
    raise exception 'Invalid report key' using errcode = 'P0002';
  end if;
  if (select count(*) from public.report_hits h
      where h.workspace_id = ws.id and h.at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many reports' using errcode = '54000';
  end if;
  insert into public.report_hits (workspace_id) values (ws.id);

  select c.id into col from public.columns c where c.workspace_id = ws.id and lower(c.name) = 'debug' limit 1;
  if col is null then
    insert into public.columns (workspace_id, name, emoji, color, position)
    values (ws.id, 'Debug', '🐞', 'rose',
      coalesce((select max(c.position) from public.columns c where c.workspace_id = ws.id), 0) + 1)
    returning id into col;
  end if;

  -- The same report again: a comment on its card, newest on top of the thread.
  select t.id into card from public.tasks t where t.column_id = col and t.title = named limit 1;
  if card is not null then
    insert into public.comments (workspace_id, task_id, author_id, body)
    values (ws.id, card, ws.owner_id, left(coalesce(nullif(btrim(body), ''), 'Again.'), 4000));
    return card;
  end if;

  -- A new card, on top of the column, as the master's.
  insert into public.tasks (workspace_id, column_id, title, description, position, created_by)
  values (ws.id, col, named, left(coalesce(body, ''), 10000),
    coalesce((select min(t.position) from public.tasks t where t.column_id = col), 0) - 1, ws.owner_id)
  returning id into card;
  return card;
end $$;

revoke execute on function public.send_report(text, text, text) from public;
grant execute on function public.send_report(text, text, text) to anon, authenticated;
