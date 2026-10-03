-- New projects don't auto-grant table access to API roles; RLS still decides which rows.
-- No insert on workspaces/members: those go through create_workspace / join_workspace.
grant select, delete on public.workspaces to authenticated;
grant select on public.members to authenticated;
grant select, insert, delete on public.columns, public.tasks, public.comments to authenticated;
