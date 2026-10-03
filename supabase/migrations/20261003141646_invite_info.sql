-- Lets the join screen show which project an invite link points to before joining.
create function public.invite_info(code text) returns table (id uuid, name text, is_member boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, public.is_member(w.id) from public.workspaces w where w.invite_code = code
$$;

revoke execute on function public.invite_info(text) from public, anon;
grant execute on function public.invite_info(text) to authenticated;
