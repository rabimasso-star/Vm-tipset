"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Tournament = {
  id: string;
  name: string;
  year: number;
};

type Match = {
  id: string;
  round: string;
  kickoff_at: string;
  status: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

export default function TournamentPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [leagueType, setLeagueType] = useState("private");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingLeague, setCreatingLeague] = useState(false);

  useEffect(() => {
    if (tournamentId) loadTournament();
  }, [tournamentId]);

  async function loadTournament() {
    setLoading(true);

    const { data: tournamentData, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, year")
      .eq("id", tournamentId)
      .single();

    if (tournamentError) {
      setMessage(tournamentError.message);
      setLoading(false);
      return;
    }

    setTournament(tournamentData);

    const { data: matchesData, error: matchesError } = await supabase
      .from("matches")
      .select(
        `
        id,
        round,
        kickoff_at,
        status,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `,
      )
      .eq("tournament_id", tournamentId)
      .order("kickoff_at", { ascending: true });

    if (matchesError) {
      setMessage(matchesError.message);
    }

    const normalizedMatches: Match[] =
      matchesData?.map((match: any) => ({
        ...match,
        home_team: Array.isArray(match.home_team)
          ? match.home_team[0] ?? null
          : match.home_team,
        away_team: Array.isArray(match.away_team)
          ? match.away_team[0] ?? null
          : match.away_team,
      })) ?? [];

    setMatches(normalizedMatches);
    setLoading(false);
  }

  function generateInviteCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async function ensureProfile(user: {
    id: string;
    email?: string | null;
    user_metadata?: { full_name?: string; name?: string };
  }) {
    const email = user.email ?? "";
    const fallbackName = email ? email.split("@")[0] : "Användare";
    const fullName =
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? fallbackName;

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email,
        full_name: fullName,
      },
      { onConflict: "id" },
    );

    return error;
  }

  async function createLeague() {
    setMessage("");
    setCreatingLeague(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Du måste vara inloggad.");
      setCreatingLeague(false);
      return;
    }

    if (!leagueName.trim()) {
      setMessage("Ange ett namn på ligan.");
      setCreatingLeague(false);
      return;
    }

    const profileError = await ensureProfile(user);

    if (profileError) {
      setMessage(profileError.message);
      setCreatingLeague(false);
      return;
    }

    const inviteCode = generateInviteCode();

    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .insert({
        name: leagueName.trim(),
        type: leagueType,
        invite_code: inviteCode,
        owner_id: user.id,
        tournament_id: tournamentId,
        is_private: leagueType === "private",
      })
      .select()
      .single();

    if (leagueError) {
      setMessage(leagueError.message);
      setCreatingLeague(false);
      return;
    }

    const { error: memberError } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "admin",
    });

    if (memberError) {
      setMessage(memberError.message);
      setCreatingLeague(false);
      return;
    }

    router.push(`/dashboard/league/${league.id}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-white">
        <div className="rounded-3xl border border-emerald-100 bg-slate-800/90 px-6 py-4 font-black shadow-xl">
          Laddar turnering...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/tournaments"
          className="inline-flex items-center rounded-full bg-slate-800/90 px-4 py-2 text-sm font-black text-emerald-300 shadow-sm ring-1 ring-emerald-100 hover:bg-emerald-50"
        >
          ← Tillbaka till turneringar
        </Link>

        <div className="mt-8 mb-10 overflow-hidden rounded-[2rem] border border-emerald-100 bg-slate-800/90 shadow-xl">
          <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-500 p-6 text-white md:p-8">
            <p className="text-sm font-black uppercase tracking-[0.3em] text-emerald-50">
              🏆 Fotbolls-VM
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              {tournament?.name} {tournament?.year}
            </h1>
            <p className="mt-3 max-w-2xl text-base font-medium text-emerald-50 md:text-lg">
              Skapa en tipstävling, bjud in vänner och följ matcherna hela vägen till finalen.
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-4 font-bold text-red-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="h-fit rounded-3xl border border-white/10 bg-slate-800/90 p-6 shadow-xl">
            <div className="mb-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">
                Ny liga
              </p>
              <h2 className="mt-2 text-3xl font-black text-white">
                Skapa liga
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Starta en privat eller företagsbaserad tipstävling.
              </p>
            </div>

            <label className="text-sm font-bold text-slate-600">
              Liganamn
            </label>
            <input
              type="text"
              placeholder="Mitt VM-tips"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="mt-2 mb-4 w-full rounded-2xl border border-white/10 bg-slate-950 border border-white/10 px-4 py-3 text-white font-bold text-white outline-none border border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition focus:border-emerald-400 focus:bg-slate-800/90 focus:ring-4 focus:ring-emerald-100"
            />

            <label className="text-sm font-bold text-slate-600">
              Typ av liga
            </label>
            <select
              value={leagueType}
              onChange={(e) => setLeagueType(e.target.value)}
              className="mt-2 mb-5 w-full rounded-2xl border border-white/10 bg-slate-950 border border-white/10 px-4 py-3 text-white font-bold text-white outline-none border border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition focus:border-emerald-400 focus:bg-slate-800/90 focus:ring-4 focus:ring-emerald-100"
            >
              <option value="private">Privat liga</option>
              <option value="company">Företagsliga</option>
            </select>

            <button
              onClick={createLeague}
              disabled={creatingLeague}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-4 font-black text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingLeague ? "Skapar liga..." : "Skapa liga"}
            </button>

            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800 ring-1 ring-amber-100">
              Tips: välj privat liga för kompisgänget och dela invite-länken efteråt.
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-800/90 p-6 shadow-xl">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">
                  Spelschema
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                  Matcher
                </h2>
              </div>
              <span className="w-fit rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-300 ring-1 ring-emerald-100">
                {matches.length} matcher
              </span>
            </div>

            {matches.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-900 p-8 text-center font-bold text-slate-400">
                Inga matcher finns ännu för denna turnering.
              </div>
            ) : (
              <div className="max-h-[700px] space-y-4 overflow-auto pr-2">
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-3xl border border-white/10 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-400">
                          {match.round} · {new Date(match.kickoff_at).toLocaleString("sv-SE")}
                        </p>
                        <h3 className="mt-2 text-xl font-black text-white md:text-2xl">
                          {match.home_team?.name ?? "Ej klart"} - {match.away_team?.name ?? "Ej klart"}
                        </h3>
                      </div>

                      <span className="w-fit rounded-full bg-slate-900 px-3 py-1 text-xs font-black uppercase text-white">
                        {match.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
