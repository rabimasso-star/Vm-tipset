-- Fix: "column reference \"league_id\" is ambiguous".
-- The RETURNS TABLE output columns (league_id, league_name) share names with
-- columns in league_members, so unqualified references inside the function body
-- are ambiguous. Qualify every table column reference to disambiguate.

create or replace function public.join_league_by_code(invite_code_input text)
returns table (league_id uuid, league_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_league_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select l.id, l.name
    into v_league_id, v_league_name
  from leagues l
  where upper(l.invite_code) = upper(trim(invite_code_input))
  limit 1;

  -- No matching league: return zero rows; the caller treats this as "not found".
  if v_league_id is null then
    return;
  end if;

  if not exists (
    select 1 from league_members lm
    where lm.league_id = v_league_id
      and lm.user_id = v_user_id
  ) then
    insert into league_members (league_id, user_id, role)
    values (v_league_id, v_user_id, 'member');
  end if;

  return query select v_league_id, v_league_name;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;
