// Re-key a tournament's matches.external_id to real API-Football fixture ids,
// so the result-sync cron (which joins on external_id) can update them.
//
// Matches DB rows to API fixtures by kickoff timestamp, disambiguating by team
// name similarity. DRY-RUN by default; pass --apply to write external_id.
//
//   node scripts/rekey-matches.mjs --tournament <uuid> --season 2026 [--apply]
//   node scripts/rekey-matches.mjs --validate                 (test vs 2022 demo)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes("--apply");
const validate = args.includes("--validate");

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
// rough alias table for name drift between sources
const alias = { korearepublic: "southkorea", unitedstates: "usa", us: "usa", iran: "iran", "côtedivoire": "ivorycoast" };
const canon = (s) => { const n = norm(s); return alias[n] ?? n; };
const teamMatch = (dbName, apiName) => {
  const a = canon(dbName), b = canon(apiName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  return 0;
};

async function fixturesForSeason(season) {
  const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=${env.API_FOOTBALL_WORLD_CUP_LEAGUE_ID}&season=${season}`,
    { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
  const json = await res.json();
  const errs = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length);
  if (errs) throw new Error("API error: " + JSON.stringify(json.errors));
  return (json.response ?? []).map((f) => ({
    id: String(f.fixture.id), ts: new Date(f.fixture.date).getTime(),
    home: f.teams?.home?.name, away: f.teams?.away?.name,
  }));
}

async function dbMatches(tournamentId) {
  const { data, error } = await sb.from("matches")
    .select("id, external_id, kickoff_at, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)")
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: m.id, external_id: m.external_id, ts: new Date(m.kickoff_at).getTime(),
    home: (Array.isArray(m.home_team) ? m.home_team[0] : m.home_team)?.name,
    away: (Array.isArray(m.away_team) ? m.away_team[0] : m.away_team)?.name,
  }));
}

function matchOne(dbm, fixtures) {
  // candidates at the exact same kickoff timestamp
  let cands = fixtures.filter((f) => f.ts === dbm.ts);
  // fallback: same calendar day (UTC)
  if (cands.length === 0) {
    const day = (t) => Math.floor(t / 86400000);
    cands = fixtures.filter((f) => day(f.ts) === day(dbm.ts));
  }
  if (cands.length === 0) return { fixture: null, reason: "no-time-match" };
  if (cands.length === 1) return { fixture: cands[0], reason: "by-time" };
  // disambiguate by team names
  const scored = cands.map((f) => ({ f, s: teamMatch(dbm.home, f.home) + teamMatch(dbm.away, f.away) }))
    .sort((a, b) => b.s - a.s);
  if (scored[0].s > 0 && (scored.length === 1 || scored[0].s > scored[1].s))
    return { fixture: scored[0].f, reason: "by-time+teams" };
  return { fixture: null, reason: "ambiguous", cands: cands.length };
}

async function run(tournamentId, season) {
  console.log(`\nTournament ${tournamentId}, season ${season}, apply=${apply}`);
  const fixtures = await fixturesForSeason(season);
  const matches = await dbMatches(tournamentId);
  console.log(`API fixtures: ${fixtures.length}  |  DB matches: ${matches.length}`);

  let matched = 0, missed = 0, correct = 0, wrong = 0;
  const updates = [];
  for (const m of matches) {
    const { fixture, reason } = matchOne(m, fixtures);
    if (!fixture) { missed++; if (missed <= 8) console.log(`  MISS  ${m.home} vs ${m.away}  (${reason})`); continue; }
    matched++;
    updates.push({ id: m.id, external_id: fixture.id });
    if (m.external_id) { // validation: compare to existing known-correct id
      if (String(m.external_id) === fixture.id) correct++;
      else { wrong++; if (wrong <= 8) console.log(`  WRONG ${m.home} vs ${m.away}: had ${m.external_id}, matched ${fixture.id}`); }
    }
  }
  console.log(`matched ${matched}/${matches.length}, missed ${missed}`);
  if (correct + wrong > 0) console.log(`validation vs existing ids: ${correct} correct, ${wrong} wrong`);

  if (apply && updates.length) {
    let ok = 0;
    for (const u of updates) {
      const { error } = await sb.from("matches").update({ external_id: u.external_id }).eq("id", u.id);
      if (!error) ok++; else console.log("  update failed", u.id, error.message);
    }
    console.log(`APPLIED external_id to ${ok}/${updates.length} matches`);
  } else if (!apply) {
    console.log("(dry run — re-run with --apply to write)");
  }
}

if (validate) {
  // 2022 demo tournament — accessible on the free plan, ids already known-correct
  await run("325eef46-c3c6-44c0-bf9e-9d3a390f0989", 2022);
} else {
  await run(arg("--tournament"), arg("--season"));
}
process.exit(0);
