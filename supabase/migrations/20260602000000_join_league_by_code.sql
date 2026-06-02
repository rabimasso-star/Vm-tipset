-- Securely join a league using only its invite code.
--
-- The `leagues` table has RLS that only exposes leagues a user already belongs
-- to, so a new invitee cannot look one up by code from the client. Rather than
-- opening SELECT on `leagues` to everyone (which would leak every league name
-- and invite code), we expose a single SECURITY DEFINER function: give it a
-- code, it adds you as a member and returns just that league's id and name.

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

  select id, name
    into v_league_id, v_league_name
  from leagues
  where upper(invite_code) = upper(trim(invite_code_input))
  limit 1;

  -- No matching league: return zero rows; the caller treats this as "not found".
  if v_league_id is null then
    return;
  end if;

  if not exists (
    select 1 from league_members
    where league_id = v_league_id
      and user_id = v_user_id
  ) then
    insert into league_members (league_id, user_id, role)
    values (v_league_id, v_user_id, 'member');
  end if;

  return query select v_league_id, v_league_name;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;
