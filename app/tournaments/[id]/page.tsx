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
      .select(`
        id,
        round,
        kickoff_at,
        status,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
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

  async function createLeague() {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Du måste vara inloggad.");
      return;
    }

    if (!leagueName.trim()) {
      setMessage("Ange ett namn på ligan.");
      return;
    }

    const inviteCode = generateInviteCode();

    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .insert({
        name: leagueName,
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
      return;
    }

    const { error: memberError } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "admin",
    });

    if (memberError) {
      setMessage(memberError.message);
      return;
    }

    router.push(`/dashboard/league/${league.id}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Laddar turnering...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/tournaments" className="text-emerald-300 hover:underline">
          ← Tillbaka till turneringar
        </Link>

        <div className="mt-8 mb-10">
          <h1 className="text-5xl font-black">{tournament?.name}</h1>
          <p className="text-slate-400 mt-3">
            Skapa en tipstävling för denna turnering.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-red-500/20 border border-red-500/30 p-4">
            {message}
          </div>
        )}

        <div className="grid lg:grid-cols-[380px_1fr] gap-6">
          <section className="rounded-3xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-2xl font-black mb-5">Skapa liga</h2>

            <input
              type="text"
              placeholder="Mitt VM-tips"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 mb-4 outline-none"
            />

            <select
              value={leagueType}
              onChange={(e) => setLeagueType(e.target.value)}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 mb-4 outline-none"
            >
              <option value="private">Privat liga</option>
              <option value="company">Företagsliga</option>
            </select>

            <button
              onClick={createLeague}
              className="w-full rounded-xl bg-emerald-500 py-3 font-black hover:bg-emerald-400"
            >
              Skapa liga
            </button>
          </section>

          <section className="rounded-3xl bg-white/10 border border-white/10 p-6">
            <h2 className="text-2xl font-black mb-5">Matcher</h2>

            {matches.length === 0 ? (
              <div className="rounded-2xl bg-slate-900 p-6 text-slate-300">
                Inga matcher finns ännu för denna turnering.
              </div>
            ) : (
              <div className="space-y-4 max-h-[700px] overflow-auto pr-2">
                {matches.map((match) => (
                  <div key={match.id} className="rounded-2xl bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">
                      {match.round} ·{" "}
                      {new Date(match.kickoff_at).toLocaleString("sv-SE")}
                    </p>

                    <h3 className="text-xl font-black mt-2">
                      {match.home_team?.name} - {match.away_team?.name}
                    </h3>
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