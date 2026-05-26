"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type Tournament = {
  id: string;
  name: string;
  year: number;
};

type MatchStatus =
  | "upcoming"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

type TeamRef = {
  name: string;
} | null;

type Match = {
  id: string;
  round: string;
  kickoff_at: string;
  status: MatchStatus;
  home_goals: number | null;
  away_goals: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

type TournamentResult = {
  winner_team: string;
  runner_up_team: string;
  third_place_team: string;
  top_scorer: string;
};

function normalizeTeamRef(value: unknown): TeamRef {
  if (Array.isArray(value)) {
    return (value[0] as TeamRef) ?? null;
  }

  return (value as TeamRef) ?? null;
}

export default function AdminPage() {
  const router = useRouter();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [savingTournamentResult, setSavingTournamentResult] = useState(false);

  const [tournamentResult, setTournamentResult] = useState<TournamentResult>({
    winner_team: "",
    runner_up_team: "",
    third_place_team: "",
    top_scorer: "",
  });

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      loadMatches();
      loadTournamentResult();
    }
  }, [selectedTournamentId]);

  async function loadTournaments() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.push("/");
      return;
    }

    const userEmail = session.user.email?.toLowerCase().trim();
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase().trim();

    if (userEmail !== adminEmail) {
      router.push("/dashboard");
      return;
    }

    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, year")
      .order("year", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setTournaments(data ?? []);

    if (data?.[0]) {
      setSelectedTournamentId(data[0].id);
    }

    setLoading(false);
  }

  async function loadMatches() {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        id,
        round,
        kickoff_at,
        status,
        home_goals,
        away_goals,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq("tournament_id", selectedTournamentId)
      .order("kickoff_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    const normalizedMatches: Match[] =
      data?.map((match: any) => ({
        id: match.id,
        round: match.round,
        kickoff_at: match.kickoff_at,
        status: match.status,
        home_goals: match.home_goals,
        away_goals: match.away_goals,
        home_team: normalizeTeamRef(match.home_team),
        away_team: normalizeTeamRef(match.away_team),
      })) ?? [];

    setMatches(normalizedMatches);
  }

  async function loadTournamentResult() {
    const { data } = await supabase
      .from("tournament_results")
      .select("*")
      .eq("tournament_id", selectedTournamentId)
      .maybeSingle();

    setTournamentResult({
      winner_team: data?.winner_team ?? "",
      runner_up_team: data?.runner_up_team ?? "",
      third_place_team: data?.third_place_team ?? "",
      top_scorer: data?.top_scorer ?? "",
    });
  }

  function updateMatchField(
    matchId: string,
    field: "home_goals" | "away_goals" | "status",
    value: string
  ) {
    setMatches((prev) =>
      prev.map((match) => {
        if (match.id !== matchId) return match;

        if (field === "home_goals") {
          return {
            ...match,
            home_goals: value === "" ? null : Number(value),
          };
        }

        if (field === "away_goals") {
          return {
            ...match,
            away_goals: value === "" ? null : Number(value),
          };
        }

        return {
          ...match,
          status: value as MatchStatus,
        };
      })
    );
  }

  async function callSupabaseFunction(functionName: string, body: object) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error("Saknar Supabase env.");
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error ?? `Kunde inte köra ${functionName}.`);
    }

    return result;
  }

  async function recalculateLeaguePoints(matchId: string) {
    return callSupabaseFunction("recalculate-league-points", { matchId });
  }

  async function saveMatch(match: Match) {
    setMessage("");
    setSavingMatchId(match.id);

    const payload = {
      home_goals: match.home_goals,
      away_goals: match.away_goals,
      status: match.status,
    };

    const { error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", match.id);

    if (error) {
      setMessage(`Fel vid sparning: ${error.message}`);
      setSavingMatchId(null);
      return;
    }

    try {
      if (match.status === "finished") {
        await recalculateLeaguePoints(match.id);

        setMessage(
          `Match sparad och poäng omräknade! Resultat: ${
            match.home_goals ?? "-"
          } - ${match.away_goals ?? "-"}`
        );
      } else {
        setMessage("Match sparad!");
      }
    } catch (recalculateError) {
      setMessage(
        `Match sparad, men poängräkning misslyckades: ${
          recalculateError instanceof Error
            ? recalculateError.message
            : "Okänt fel"
        }`
      );
    }

    setSavingMatchId(null);
  }

  async function saveTournamentResult() {
    setMessage("");
    setSavingTournamentResult(true);

    const { error } = await supabase.from("tournament_results").upsert(
      {
        tournament_id: selectedTournamentId,
        winner_team: tournamentResult.winner_team,
        runner_up_team: tournamentResult.runner_up_team,
        third_place_team: tournamentResult.third_place_team,
        top_scorer: tournamentResult.top_scorer,
      },
      {
        onConflict: "tournament_id",
      }
    );

    if (error) {
      setMessage(error.message);
      setSavingTournamentResult(false);
      return;
    }

    setMessage("Turneringsresultat sparat! ✅");
    setSavingTournamentResult(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Laddar admin...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-black md:text-5xl">Adminpanel</h1>
          <p className="mt-2 text-slate-400">
            Uppdatera matchresultat, status och turneringens slutresultat.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900 p-4">
            {message}
          </div>
        )}

        <div className="mb-8 rounded-3xl border border-white/10 bg-white/10 p-6">
          <label className="text-sm text-slate-400">Turnering</label>
          <select
            value={selectedTournamentId}
            onChange={(e) => setSelectedTournamentId(e.target.value)}
            className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 outline-none"
          >
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} {tournament.year}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-8 rounded-3xl border border-white/10 bg-white/10 p-6">
          <h2 className="mb-5 text-2xl font-black">Slutresultat turnering</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <input
              value={tournamentResult.winner_team}
              onChange={(e) =>
                setTournamentResult((prev) => ({
                  ...prev,
                  winner_team: e.target.value,
                }))
              }
              placeholder="Vinnare"
              className="rounded-xl bg-slate-900 px-4 py-3 outline-none"
            />

            <input
              value={tournamentResult.runner_up_team}
              onChange={(e) =>
                setTournamentResult((prev) => ({
                  ...prev,
                  runner_up_team: e.target.value,
                }))
              }
              placeholder="Tvåa"
              className="rounded-xl bg-slate-900 px-4 py-3 outline-none"
            />

            <input
              value={tournamentResult.third_place_team}
              onChange={(e) =>
                setTournamentResult((prev) => ({
                  ...prev,
                  third_place_team: e.target.value,
                }))
              }
              placeholder="Trea"
              className="rounded-xl bg-slate-900 px-4 py-3 outline-none"
            />

            <input
              value={tournamentResult.top_scorer}
              onChange={(e) =>
                setTournamentResult((prev) => ({
                  ...prev,
                  top_scorer: e.target.value,
                }))
              }
              placeholder="Skytteligavinnare"
              className="rounded-xl bg-slate-900 px-4 py-3 outline-none"
            />
          </div>

          <button
            onClick={saveTournamentResult}
            disabled={savingTournamentResult}
            className="mt-5 rounded-xl bg-purple-500 px-6 py-3 font-black hover:bg-purple-400 disabled:bg-slate-700"
          >
            {savingTournamentResult ? "Sparar..." : "Spara slutresultat"}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/10 p-6">
          <h2 className="mb-5 text-2xl font-black">Matcher</h2>

          <div className="space-y-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="rounded-2xl border border-white/10 bg-slate-900 p-4"
              >
                <p className="text-xs text-slate-500">
                  {match.round} ·{" "}
                  {new Date(match.kickoff_at).toLocaleString("sv-SE")}
                </p>

                <h3 className="mb-4 mt-2 text-xl font-black">
                  {match.home_team?.name ?? "Ej klart"} -{" "}
                  {match.away_team?.name ?? "Ej klart"}
                </h3>

                <div className="grid gap-3 md:grid-cols-[120px_120px_180px_auto] md:items-end">
                  <input
                    type="number"
                    value={match.home_goals ?? ""}
                    onChange={(e) =>
                      updateMatchField(match.id, "home_goals", e.target.value)
                    }
                    className="rounded-xl bg-slate-800 px-4 py-3"
                  />

                  <input
                    type="number"
                    value={match.away_goals ?? ""}
                    onChange={(e) =>
                      updateMatchField(match.id, "away_goals", e.target.value)
                    }
                    className="rounded-xl bg-slate-800 px-4 py-3"
                  />

                  <select
                    value={match.status}
                    onChange={(e) =>
                      updateMatchField(match.id, "status", e.target.value)
                    }
                    className="rounded-xl bg-slate-800 px-4 py-3"
                  >
                    <option value="upcoming">upcoming</option>
                    <option value="live">live</option>
                    <option value="finished">finished</option>
                    <option value="postponed">postponed</option>
                    <option value="cancelled">cancelled</option>
                  </select>

                  <button
                    onClick={() => saveMatch(match)}
                    disabled={savingMatchId === match.id}
                    className="rounded-xl bg-emerald-500 px-6 py-3 font-black disabled:bg-slate-700"
                  >
                    {savingMatchId === match.id ? "Sparar..." : "Spara"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}