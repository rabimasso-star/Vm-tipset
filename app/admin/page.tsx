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

type Match = {
  id: string;
  round: string;
  kickoff_at: string;
  status: MatchStatus;
  home_goals: number | null;
  away_goals: number | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

type TournamentResult = {
  winner_team: string;
  runner_up_team: string;
  third_place_team: string;
  top_scorer: string;
};

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
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      router.push("/dashboard");
      return;
    }

    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, year")
      .order("year", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setTournaments(data ?? []);
      if (data?.[0]) {
        setSelectedTournamentId(data[0].id);
      }
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

    setMatches((data as Match[]) ?? []);
  }

  async function loadTournamentResult() {
    const { data } = await supabase
      .from("tournament_results")
      .select("*")
      .eq("tournament_id", selectedTournamentId)
      .maybeSingle();

    if (data) {
      setTournamentResult({
        winner_team: data.winner_team ?? "",
        runner_up_team: data.runner_up_team ?? "",
        third_place_team: data.third_place_team ?? "",
        top_scorer: data.top_scorer ?? "",
      });
    } else {
      setTournamentResult({
        winner_team: "",
        runner_up_team: "",
        third_place_team: "",
        top_scorer: "",
      });
    }
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

  async function saveMatch(
    matchId: string,
    homeGoals: number | null,
    awayGoals: number | null,
    status: MatchStatus
  ) {
    setMessage("");
    setSavingMatchId(matchId);

    const { error } = await supabase
      .from("matches")
      .update({
        home_goals: homeGoals,
        away_goals: awayGoals,
        status,
      })
      .eq("id", matchId);

    if (error) {
      setMessage(error.message);
      setSavingMatchId(null);
      return;
    }

    setMessage("Match uppdaterad! ✅");
    await loadMatches();
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
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Laddar admin...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-5xl font-black">Adminpanel</h1>
          <p className="text-slate-400 mt-2">
            Uppdatera matchresultat, status och turneringens slutresultat.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-slate-900 border border-white/10 p-4">
            {message}
          </div>
        )}

        <div className="mb-8 rounded-3xl bg-white/10 border border-white/10 p-6">
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

        <div className="mb-8 rounded-3xl bg-white/10 border border-white/10 p-6">
          <h2 className="text-2xl font-black mb-5">Slutresultat turnering</h2>

          <div className="grid md:grid-cols-2 gap-4">
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
            className="mt-5 rounded-xl bg-purple-500 px-6 py-3 font-black hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {savingTournamentResult ? "Sparar..." : "Spara slutresultat"}
          </button>
        </div>

        <div className="rounded-3xl bg-white/10 border border-white/10 p-6">
          <h2 className="text-2xl font-black mb-5">Matcher</h2>

          <div className="space-y-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="rounded-2xl bg-slate-900 border border-white/10 p-4"
              >
                <p className="text-xs text-slate-500">
                  {match.round} ·{" "}
                  {new Date(match.kickoff_at).toLocaleString("sv-SE")}
                </p>

                <h3 className="text-xl font-black mt-2 mb-4">
                  {match.home_team?.name} - {match.away_team?.name}
                </h3>

                <div className="grid md:grid-cols-[120px_120px_180px_auto] gap-3 items-end">
                  <div>
                    <label className="text-xs text-slate-400">Hemmalag</label>
                    <input
                      type="number"
                      value={match.home_goals ?? ""}
                      onChange={(e) =>
                        updateMatchField(match.id, "home_goals", e.target.value)
                      }
                      className="mt-1 w-full rounded-xl bg-slate-800 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Bortalag</label>
                    <input
                      type="number"
                      value={match.away_goals ?? ""}
                      onChange={(e) =>
                        updateMatchField(match.id, "away_goals", e.target.value)
                      }
                      className="mt-1 w-full rounded-xl bg-slate-800 px-4 py-3 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Status</label>
                    <select
                      value={match.status}
                      onChange={(e) =>
                        updateMatchField(match.id, "status", e.target.value)
                      }
                      className="mt-1 w-full rounded-xl bg-slate-800 px-4 py-3 outline-none"
                    >
                      <option value="upcoming">upcoming</option>
                      <option value="live">live</option>
                      <option value="finished">finished</option>
                      <option value="postponed">postponed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </div>

                  <button
                    onClick={() =>
                      saveMatch(
                        match.id,
                        match.home_goals,
                        match.away_goals,
                        match.status
                      )
                    }
                    disabled={savingMatchId === match.id}
                    className="rounded-xl bg-emerald-500 px-6 py-3 font-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
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