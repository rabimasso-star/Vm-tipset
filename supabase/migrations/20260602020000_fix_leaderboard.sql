-- `leaderboard` is a VIEW, so refresh_leaderboard_for_league() (which did
-- INSERT ... ON CONFLICT into it) and the refresh-leaderboard edge function
-- could never run -- inserting into a non-updatable view errors. Drop the dead
-- function; the view is the single source of truth.
drop function if exists public.refresh_leaderboard_for_league(uuid);

-- Redefine the view to also include tournament bonus points. The old view
-- summed only match points, silently ignoring tournament_predictions. Bonus
-- points are currently always 0 (no bonus-scoring function exists yet), but
-- once that is added the standings update automatically with no refresh step.
create or replace view public.leaderboard as
select
  lm.league_id,
  lm.user_id,
  coalesce(pr.full_name, 'Okänd spelare'::text) as full_name,
  coalesce(mp.match_points, 0) + coalesce(bp.bonus_points, 0) as total_points
from league_members lm
left join profiles pr on pr.id = lm.user_id
left join (
  select league_id, user_id, sum(total_points) as match_points
  from points
  group by league_id, user_id
) mp on mp.league_id = lm.league_id and mp.user_id = lm.user_id
left join (
  select league_id, user_id, sum(points) as bonus_points
  from tournament_predictions
  group by league_id, user_id
) bp on bp.league_id = lm.league_id and bp.user_id = lm.user_id;
