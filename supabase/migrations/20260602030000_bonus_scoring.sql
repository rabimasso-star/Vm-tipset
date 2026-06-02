-- Bonus (tournament) prediction scoring.
--
-- Users predict the winner, runner-up, third place and top scorer per league
-- in tournament_predictions. The actual outcome lives in tournament_results.
-- These functions compare the two and write tournament_predictions.points,
-- which the leaderboard view already folds into each member's total.
--
-- Point values: winner 15, runner-up 8, third place 4, top scorer 5 (max 32).
-- Comparison is case-insensitive and whitespace-trimmed.

create or replace function public.calculate_tournament_prediction_points(prediction_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tp record;
  tr record;
  pts integer := 0;
begin
  select * into tp from public.tournament_predictions where id = prediction_id_input;
  if tp.id is null then
    return 0;
  end if;

  select * into tr from public.tournament_results where tournament_id = tp.tournament_id;

  -- No results recorded yet -> ensure points are zeroed.
  if tr.tournament_id is null then
    update public.tournament_predictions
      set points = 0, updated_at = now()
      where id = tp.id;
    return 0;
  end if;

  if tp.winner_team is not null and tr.winner_team is not null
     and lower(trim(tp.winner_team)) = lower(trim(tr.winner_team)) then
    pts := pts + 15;
  end if;

  if tp.runner_up_team is not null and tr.runner_up_team is not null
     and lower(trim(tp.runner_up_team)) = lower(trim(tr.runner_up_team)) then
    pts := pts + 8;
  end if;

  if tp.third_place_team is not null and tr.third_place_team is not null
     and lower(trim(tp.third_place_team)) = lower(trim(tr.third_place_team)) then
    pts := pts + 4;
  end if;

  if tp.top_scorer is not null and tr.top_scorer is not null
     and lower(trim(tp.top_scorer)) = lower(trim(tr.top_scorer)) then
    pts := pts + 5;
  end if;

  update public.tournament_predictions
    set points = pts, updated_at = now()
    where id = tp.id;

  return pts;
end;
$$;

create or replace function public.recalculate_tournament_points(tournament_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.tournament_predictions
    where tournament_id = tournament_id_input
  loop
    perform public.calculate_tournament_prediction_points(r.id);
  end loop;
end;
$$;

create or replace function public.recalculate_tournament_points_after_results_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_tournament_points(new.tournament_id);
  return new;
end;
$$;

drop trigger if exists recalc_bonus_when_results_change on public.tournament_results;
create trigger recalc_bonus_when_results_change
  after insert or update on public.tournament_results
  for each row execute function public.recalculate_tournament_points_after_results_change();
