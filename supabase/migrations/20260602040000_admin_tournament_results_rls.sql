-- The admin panel writes tournament_results from the browser (authenticated
-- client), but the table had RLS enabled with no policies, so every write was
-- blocked by row-level security. Mirror the existing matches-admin policy:
-- allow the admin email to read / insert / update tournament_results.
--
-- NOTE: the admin email is hardcoded to match the existing matches policy and
-- NEXT_PUBLIC_ADMIN_EMAIL. If the admin changes, update all three.

create policy "Admin can read tournament results" on public.tournament_results
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rabimasso@hotmail.com');

create policy "Admin can insert tournament results" on public.tournament_results
  for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'rabimasso@hotmail.com');

create policy "Admin can update tournament results" on public.tournament_results
  for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rabimasso@hotmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rabimasso@hotmail.com');
