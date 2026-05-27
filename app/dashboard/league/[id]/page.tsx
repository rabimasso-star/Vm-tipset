"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type League = {
  id: string;
  name: string;
  invite_code: string;
  tournament_id: string | null;
  tournaments?: {
    name: string;
    year: number;
  } | null;
};

type LeaderboardRow = {
  user_id: string;
  full_name: string;
  total_points: number;
};

type MatchPoint = {
  match_id: string;
  home_goal_points: number | null;
  away_goal_points: number | null;
  sign_points: number | null;
  total_points: number | null;
};

type MatchPointsById = Record<string, MatchPoint>;

type MatchStatus = "upcoming" | "live" | "finished" | "postponed" | "cancelled";

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
  group_name?: string | null;
  group?: string | null;
  group_code?: string | null;
  match_number?: number | string | null;
  match_no?: number | string | null;
  number?: number | string | null;
  fifa_match_number?: number | string | null;
  external_id?: string | null;
  slug?: string | null;
};

type PredictionInputs = {
  [matchId: string]: {
    home: string;
    away: string;
    winner: string;
  };
};

type TournamentPrediction = {
  winner_team: string;
  runner_up_team: string;
  third_place_team: string;
  top_scorer: string;
};

type Filter = "all" | "upcoming" | "finished";

type GroupRow = {
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type GroupTables = Record<string, GroupRow[]>;

type KnockoutResult = {
  winner: string;
  loser: string;
};

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.id as string;

  const [league, setLeague] = useState<League | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictionInputs, setPredictionInputs] = useState<PredictionInputs>(
    {},
  );
  const [matchPointsById, setMatchPointsById] = useState<MatchPointsById>({});
  const [showGroupTables, setShowGroupTables] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const [bracketMode, setBracketMode] = useState<"predictions" | "actual">(
  "predictions",
  );
  const [tournamentPrediction, setTournamentPrediction] =
    useState<TournamentPrediction>({
      winner_team: "",
      runner_up_team: "",
      third_place_team: "",
      top_scorer: "",
    });
  const [savedTournamentPrediction, setSavedTournamentPrediction] =
    useState<TournamentPrediction>({
      winner_team: "",
      runner_up_team: "",
      third_place_team: "",
      top_scorer: "",
    });

  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBonus, setSavingBonus] = useState(false);
  const [savingPredictionId, setSavingPredictionId] = useState<string | null>(null);
  const [bonusLocked, setBonusLocked] = useState(false);
  const [leavingLeague, setLeavingLeague] = useState(false);

  useEffect(() => {
    if (leagueId) {
      loadLeaguePage();
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId || !league?.tournament_id) return;

    const interval = window.setInterval(() => {
      loadMatchesOnly(league.tournament_id);
      loadLeaderboardOnly();
      loadMatchPointsOnly();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [leagueId, league?.tournament_id]);

  const filteredMatches = useMemo(() => {
    if (filter === "all") return matches;
    return matches.filter((match) => match.status === filter);
  }, [matches, filter]);

  const bonusHasChanged = useMemo(() => {
    return (
      tournamentPrediction.winner_team !==
        savedTournamentPrediction.winner_team ||
      tournamentPrediction.runner_up_team !==
        savedTournamentPrediction.runner_up_team ||
      tournamentPrediction.third_place_team !==
        savedTournamentPrediction.third_place_team ||
      tournamentPrediction.top_scorer !== savedTournamentPrediction.top_scorer
    );
  }, [tournamentPrediction, savedTournamentPrediction]);

  function isPlaceholderTeam(name: string) {
    const cleanName = name.trim().toLowerCase();
    const trimmedName = name.trim();

    return (
      /^[0-9]+[a-z]+$/i.test(trimmedName) ||
      /^w[0-9]+$/i.test(trimmedName) ||
      /^l[0-9]+$/i.test(trimmedName) ||
      /^ru[0-9]+$/i.test(trimmedName) ||
      cleanName.includes("winner") ||
      cleanName.includes("runner") ||
      cleanName.includes("playoff") ||
      cleanName.includes("group")
    );
  }

  function isKnockoutMatch(match: Match) {
    return match.round !== "Group Stage";
  }

  function getMatchGroup(match: Match) {
    const groupValue =
      match.group_name ?? match.group ?? match.group_code ?? "";
    const matchResult = String(groupValue).match(/group\s*([a-z])/i);
    return matchResult?.[1]?.toUpperCase() ?? null;
  }

  function getPrediction(matchId: string) {
    const prediction = predictionInputs[matchId];

    if (!prediction) return null;
    if (prediction.home === "" || prediction.away === "") return null;

    const home = Number(prediction.home);
    const away = Number(prediction.away);

    if (Number.isNaN(home) || Number.isNaN(away)) return null;

    return {
      home,
      away,
      winnerTeam: prediction.winner,
    };
  }

const groupTables = useMemo<GroupTables>(() => {
  const tables: Record<string, Record<string, GroupRow>> = {};

  matches.forEach((match) => {
    if (match.round !== "Group Stage") return;
    if (match.status !== "finished") return;

    const groupLetter = getMatchGroup(match);
    if (!groupLetter) return;

    const homeName = match.home_team?.name;
    const awayName = match.away_team?.name;

    if (!homeName || !awayName) return;

    if (!tables[groupLetter]) {
      tables[groupLetter] = {};
    }

    if (!tables[groupLetter][homeName]) {
      tables[groupLetter][homeName] = {
        team: homeName,
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      };
    }

    if (!tables[groupLetter][awayName]) {
      tables[groupLetter][awayName] = {
        team: awayName,
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      };
    }

    if (
      match.home_goals === null ||
      match.away_goals === null
    ) {
      return;
    }

    const homeGoals = Number(match.home_goals);
    const awayGoals = Number(match.away_goals);

    const homeRow = tables[groupLetter][homeName];
    const awayRow = tables[groupLetter][awayName];

    homeRow.played += 1;
    awayRow.played += 1;

    homeRow.goalsFor += homeGoals;
    homeRow.goalsAgainst += awayGoals;

    awayRow.goalsFor += awayGoals;
    awayRow.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      homeRow.points += 3;
    } else if (homeGoals < awayGoals) {
      awayRow.points += 3;
    } else {
      homeRow.points += 1;
      awayRow.points += 1;
    }

    homeRow.goalDifference =
      homeRow.goalsFor - homeRow.goalsAgainst;

    awayRow.goalDifference =
      awayRow.goalsFor - awayRow.goalsAgainst;
  });

  const sortedTables: GroupTables = {};

  Object.entries(tables).forEach(([groupLetter, rows]) => {
    sortedTables[groupLetter] = Object.values(rows).sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }

      if (b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }

      return a.team.localeCompare(b.team);
    });
  });

  return sortedTables;
}, [matches]);

  const groupTableEntries = useMemo(() => {
    return Object.entries(groupTables).sort(([a], [b]) => a.localeCompare(b));
  }, [groupTables]);

  const bestThirdPlacedTeams = useMemo(() => {
    return Object.entries(groupTables)
      .map(([groupLetter, rows]) => ({
        groupLetter,
        row: rows[2],
      }))
      .filter((item) => item.row)
      .sort((a, b) => {
        if (b.row.points !== a.row.points) return b.row.points - a.row.points;
        if (b.row.goalDifference !== a.row.goalDifference) {
          return b.row.goalDifference - a.row.goalDifference;
        }
        if (b.row.goalsFor !== a.row.goalsFor) {
          return b.row.goalsFor - a.row.goalsFor;
        }
        return a.row.team.localeCompare(b.row.team);
      });
  }, [groupTables]);

  function getMatchNumber(match: Match) {
    const raw =
      match.match_number ??
      match.match_no ??
      match.number ??
      match.fifa_match_number ??
      null;

    if (raw === null || raw === undefined) return null;

    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function resolveGroupPlaceholder(name: string) {
    const trimmedName = name.trim().toUpperCase();

    const firstOrSecond = trimmedName.match(/^([12])([A-Z])$/);
    if (firstOrSecond) {
      const position = Number(firstOrSecond[1]) - 1;
      const groupLetter = firstOrSecond[2];
      const groupRows = groupTables[groupLetter];

      if (!groupRows || groupRows.length < 4) return name;

      const groupIsComplete = groupRows.every((row) => row.played === 3);

      if (!groupIsComplete) return name;

      return groupRows[position]?.team ?? name;
    }

    const thirdPlace = trimmedName.match(/^3([A-Z]+)$/);
    if (thirdPlace) {
      const allowedGroups = thirdPlace[1].split("");

      const allAllowedGroupsAreComplete = allowedGroups.every((groupLetter) => {
        const rows = groupTables[groupLetter];
        return (
          rows && rows.length === 4 && rows.every((row) => row.played === 3)
        );
      });

      if (!allAllowedGroupsAreComplete) return name;

      const selectedThird = bestThirdPlacedTeams.find((item) =>
        allowedGroups.includes(item.groupLetter),
      );

      return selectedThird?.row.team ?? name;
    }

    return name;
  }

  function resolveTeamNameWithResults(
    name: string | null | undefined,
    results: Record<number, KnockoutResult>,
  ) {
    if (!name) return "";

    const trimmedName = name.trim();

    const winnerMatch = trimmedName.match(/^W([0-9]+)$/i);
    if (winnerMatch) {
      const matchNumber = Number(winnerMatch[1]);
      return results[matchNumber]?.winner ?? trimmedName;
    }

    const loserMatch = trimmedName.match(/^L([0-9]+)$/i);
    if (loserMatch) {
      const matchNumber = Number(loserMatch[1]);
      return results[matchNumber]?.loser ?? trimmedName;
    }

    const runnerUpMatch = trimmedName.match(/^RU([0-9]+)$/i);
    if (runnerUpMatch) {
      const matchNumber = Number(runnerUpMatch[1]);
      return results[matchNumber]?.loser ?? trimmedName;
    }

    return resolveGroupPlaceholder(trimmedName);
  }

  const knockoutResults = useMemo<Record<number, KnockoutResult>>(() => {
  const results: Record<number, KnockoutResult> = {};

  const knockoutMatches = matches
    .filter((match) => match.round !== "Group Stage")
    .sort((a, b) => {
      const aNumber = getMatchNumber(a) ?? 0;
      const bNumber = getMatchNumber(b) ?? 0;
      return aNumber - bNumber;
    });

  knockoutMatches.forEach((match) => {
    const matchNumber = getMatchNumber(match);
    if (!matchNumber) return;

    const homeNameRaw = match.home_team?.name;
    const awayNameRaw = match.away_team?.name;

    if (!homeNameRaw || !awayNameRaw) return;

    const homeName = resolveTeamNameWithResults(homeNameRaw, results);
    const awayName = resolveTeamNameWithResults(awayNameRaw, results);

    if (!homeName || !awayName) return;

    let homeGoals: number | null = null;
    let awayGoals: number | null = null;
    let winnerTeam = "";

    if (bracketMode === "actual") {
      if (match.status !== "finished") return;
      if (match.home_goals === null || match.away_goals === null) return;

      homeGoals = Number(match.home_goals);
      awayGoals = Number(match.away_goals);
    } else {
      const prediction = getPrediction(match.id);
      if (!prediction) return;

      homeGoals = prediction.home;
      awayGoals = prediction.away;
      winnerTeam = prediction.winnerTeam;
    }

    if (homeGoals > awayGoals) {
      results[matchNumber] = {
        winner: homeName,
        loser: awayName,
      };
      return;
    }

    if (homeGoals < awayGoals) {
      results[matchNumber] = {
        winner: awayName,
        loser: homeName,
      };
      return;
    }

    if (winnerTeam) {
      const winner =
        winnerTeam === homeName ? homeName : awayName;

      const loser =
        winner === homeName ? awayName : homeName;

      results[matchNumber] = {
        winner,
        loser,
      };
    }
  });

  return results;
}, [
  matches,
  predictionInputs,
  groupTables,
  bestThirdPlacedTeams,
  bracketMode,
]);

  const bracketRounds = useMemo(() => {
    const roundOrder = [
      "Round of 32",
      "Round of 16",
      "Quarterfinals",
      "Quarter-finals",
      "Quarter Finals",
      "Semifinals",
      "Semi-finals",
      "Semi Finals",
      "Third Place Playoff",
      "Third place",
      "Third Place",
      "Final",
    ];

    return roundOrder
      .map((roundName) => {
        const roundMatches = matches
          .filter((match) => {
            if (match.round !== roundName) return false;

            if (bracketMode === "actual") {
              return true;
            }

            return (
              predictionInputs[match.id]?.home !== "" &&
              predictionInputs[match.id]?.away !== ""
            );
          })
          .sort((a, b) => {
            const aNumber = getMatchNumber(a) ?? 0;
            const bNumber = getMatchNumber(b) ?? 0;
            return aNumber - bNumber;
          });

        return {
          roundName,
          matches: roundMatches,
        };
      })
      .filter((round) => round.matches.length > 0);
  }, [matches, knockoutResults, bracketMode, predictionInputs]);

  function resolveTeamName(name?: string | null): string {
    return resolveTeamNameWithResults(name, knockoutResults);
  }

  const teamOptions = useMemo(() => {
    const names = new Set<string>();

    matches.forEach((match) => {
      const homeName = match.home_team?.name;
      const awayName = match.away_team?.name;

      if (homeName && !isPlaceholderTeam(homeName)) {
        names.add(homeName);
      }

      if (awayName && !isPlaceholderTeam(awayName)) {
        names.add(awayName);
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  async function loadLeaguePage() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentUserId(user?.id ?? null);

    const { data: leagueData, error: leagueError } = await supabase
      .from("leagues")
      .select(
        `
        id,
        name,
        invite_code,
        tournament_id,
        tournaments (
          name,
          year
        )
      `,
      )
      .eq("id", leagueId)
      .single();

    if (leagueError) {
      setMessage(leagueError.message);
      setLoading(false);
      return;
    }

    const normalizedLeague: League = {
      id: leagueData.id,
      name: leagueData.name,
      invite_code: leagueData.invite_code,
      tournament_id: leagueData.tournament_id,
      tournaments: Array.isArray(leagueData.tournaments)
        ? leagueData.tournaments[0] ?? null
        : leagueData.tournaments,
    };

    setLeague(normalizedLeague);

    const { data: leaderboardData } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("league_id", leagueId)
      .order("total_points", { ascending: false });

    setLeaderboard(leaderboardData ?? []);

    const { count: membersCount } = await supabase
      .from("league_members")
      .select("user_id", { count: "exact", head: true })
      .eq("league_id", leagueId);

    setMemberCount(membersCount ?? leaderboardData?.length ?? 0);

    let matchQuery = supabase
      .from("matches")
      .select(
        `
        *,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `,
      )
      .order("kickoff_at", { ascending: true });

    if (leagueData?.tournament_id) {
      matchQuery = matchQuery.eq("tournament_id", leagueData.tournament_id);
    }

    const { data: matchesData, error: matchesError } = await matchQuery;

    if (matchesError) {
      setMessage(matchesError.message);
    }

    const loadedMatches =
      matchesData?.map((match: any) => ({
        ...match,
        home_team: Array.isArray(match.home_team)
          ? match.home_team[0] ?? null
          : match.home_team,
        away_team: Array.isArray(match.away_team)
          ? match.away_team[0] ?? null
          : match.away_team,
      })) ?? [];

    setMatches(loadedMatches);

    const tournamentStarted = loadedMatches.some((match) => {
      if (!match.kickoff_at) return false;
      return new Date(match.kickoff_at).getTime() <= Date.now();
    });

    setBonusLocked(tournamentStarted);

    if (user) {
      const { data: predictions } = await supabase
        .from("predictions")
        .select("*")
        .eq("league_id", leagueId)
        .eq("user_id", user.id);

      const inputMap: PredictionInputs = {};

      predictions?.forEach((prediction: any) => {
        inputMap[prediction.match_id] = {
          home: String(prediction.predicted_home_goals),
          away: String(prediction.predicted_away_goals),
          winner: prediction.predicted_winner_team ?? "",
        };
      });

      setPredictionInputs(inputMap);
      await loadMatchPointsOnly(user.id);

      if (leagueData?.tournament_id) {
        const { data: bonusPrediction } = await supabase
          .from("tournament_predictions")
          .select("*")
          .eq("league_id", leagueId)
          .eq("user_id", user.id)
          .eq("tournament_id", leagueData.tournament_id)
          .maybeSingle();

        const loadedBonusPrediction = bonusPrediction
          ? {
              winner_team: bonusPrediction.winner_team ?? "",
              runner_up_team: bonusPrediction.runner_up_team ?? "",
              third_place_team: bonusPrediction.third_place_team ?? "",
              top_scorer: bonusPrediction.top_scorer ?? "",
            }
          : {
              winner_team: "",
              runner_up_team: "",
              third_place_team: "",
              top_scorer: "",
            };

        setTournamentPrediction(loadedBonusPrediction);
        setSavedTournamentPrediction(loadedBonusPrediction);
      }
    }

    setLoading(false);
  }

  async function loadLeaderboardOnly() {
    if (!leagueId) return;

    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("league_id", leagueId)
      .order("total_points", { ascending: false });

    if (error) {
      console.error("Kunde inte uppdatera leaderboard", error.message);
      return;
    }

    setLeaderboard(data ?? []);
  }

  async function loadMatchesOnly(tournamentId: string) {
    const { data, error } = await supabase
      .from("matches")
      .select(
        `
        *,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `,
      )
      .eq("tournament_id", tournamentId)
      .order("kickoff_at", { ascending: true });

    if (error) {
      console.error("Kunde inte uppdatera matcher", error.message);
      return;
    }

    const loadedMatches =
      data?.map((match: any) => ({
        ...match,
        home_team: Array.isArray(match.home_team)
          ? match.home_team[0] ?? null
          : match.home_team,
        away_team: Array.isArray(match.away_team)
          ? match.away_team[0] ?? null
          : match.away_team,
      })) ?? [];

    setMatches(loadedMatches);

    const tournamentStarted = loadedMatches.some((match) => {
      if (!match.kickoff_at) return false;
      return new Date(match.kickoff_at).getTime() <= Date.now();
    });

    setBonusLocked(tournamentStarted);
  }

  async function loadMatchPointsOnly(userIdOverride?: string) {
    const userId = userIdOverride ?? currentUserId;

    if (!leagueId || !userId) return;

    const { data, error } = await supabase
      .from("points")
      .select(
        "match_id, home_goal_points, away_goal_points, sign_points, total_points",
      )
      .eq("league_id", leagueId)
      .eq("user_id", userId);

    if (error) {
      console.error("Kunde inte uppdatera matchpoäng", error.message);
      return;
    }

    const pointsMap: MatchPointsById = {};

    data?.forEach((row: any) => {
      if (!row.match_id) return;

      pointsMap[row.match_id] = {
        match_id: row.match_id,
        home_goal_points: row.home_goal_points,
        away_goal_points: row.away_goal_points,
        sign_points: row.sign_points,
        total_points: row.total_points,
      };
    });

    setMatchPointsById(pointsMap);
  }

  async function saveTournamentPrediction() {
    setMessage("");
    setSavingBonus(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Du måste vara inloggad.");
      setSavingBonus(false);
      return;
    }

    if (!league?.tournament_id) {
      setMessage("Den här ligan saknar turnering.");
      setSavingBonus(false);
      return;
    }

    const { error } = await supabase.from("tournament_predictions").upsert(
      {
        league_id: leagueId,
        user_id: user.id,
        tournament_id: league.tournament_id,
        winner_team: tournamentPrediction.winner_team,
        runner_up_team: tournamentPrediction.runner_up_team,
        third_place_team: tournamentPrediction.third_place_team,
        top_scorer: tournamentPrediction.top_scorer,
      },
      {
        onConflict: "league_id,user_id,tournament_id",
      },
    );

    if (error) {
      setMessage(error.message);
      setSavingBonus(false);
      return;
    }

    setSavedTournamentPrediction(tournamentPrediction);
    setMessage("Bonus-tips sparat! ✅");
    await loadLeaguePage();
    setSavingBonus(false);
  }

  async function savePrediction(match: Match) {
    setMessage("");
    setSavingPredictionId(match.id);

    if (match.status !== "upcoming") {
      setMessage("Matchen är låst och kan inte längre tippas.");
      setSavingPredictionId(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSavingPredictionId(null);
      return;
    }

    const prediction = predictionInputs[match.id];

    if (!prediction?.home || !prediction?.away) {
      setMessage("Fyll i båda resultaten.");
      setSavingPredictionId(null);
      return;
    }

    const predictedHomeGoals = Number(prediction.home);
    const predictedAwayGoals = Number(prediction.away);

    if (
      isKnockoutMatch(match) &&
      predictedHomeGoals === predictedAwayGoals &&
      !prediction.winner
    ) {
      setMessage("Välj vinnare när en slutspelsmatch slutar oavgjort.");
      setSavingPredictionId(null);
      return;
    }

    const { error } = await supabase.from("predictions").upsert(
      {
        league_id: leagueId,
        user_id: user.id,
        match_id: match.id,
        predicted_home_goals: predictedHomeGoals,
        predicted_away_goals: predictedAwayGoals,
        predicted_winner_team:
          isKnockoutMatch(match) && predictedHomeGoals === predictedAwayGoals
            ? prediction.winner
            : null,
        lock_status: "open",
      },
      {
        onConflict: "league_id,user_id,match_id",
      },
    );

    if (error) {
      setMessage(error.message);
      setSavingPredictionId(null);
      return;
    }

    setMessage("Tips sparat! ✅");
    await loadLeaguePage();
    setSavingPredictionId(null);
  }

  function updatePrediction(
    matchId: string,
    side: "home" | "away",
    value: string,
  ) {
    setPredictionInputs((prev) => ({
      ...prev,
      [matchId]: {
        home: prev[matchId]?.home ?? "",
        away: prev[matchId]?.away ?? "",
        winner: prev[matchId]?.winner ?? "",
        [side]: value,
      },
    }));
  }

  function updatePredictionWinner(matchId: string, value: string) {
    setPredictionInputs((prev) => ({
      ...prev,
      [matchId]: {
        home: prev[matchId]?.home ?? "",
        away: prev[matchId]?.away ?? "",
        winner: value,
      },
    }));
  }

  function updateTournamentPrediction(
    field: keyof TournamentPrediction,
    value: string,
  ) {
    setTournamentPrediction((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function getStatusText(status: MatchStatus) {
    if (status === "upcoming") return "Kommande";
    if (status === "live") return "Live";
    if (status === "finished") return "Färdig";
    if (status === "postponed") return "Uppskjuten";
    return "Inställd";
  }

  function getStatusClass(status: MatchStatus) {
    if (status === "upcoming") return "bg-blue-500/20 text-blue-300";
    if (status === "live") return "bg-red-500/20 text-red-300";
    if (status === "finished") return "bg-emerald-500/20 text-emerald-300";
    return "bg-slate-700 text-slate-300";
  }

  function getInviteLink() {
    if (!league?.invite_code) return "";
    return `${window.location.origin}/join/${league.invite_code}`;
  }

  async function copyToClipboard(value: string, label: string) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} kopierad!`);
    } catch {
      setMessage("Kunde inte kopiera. Kopiera manuellt istället.");
    }
  }

  async function leaveLeague() {
    setMessage("");

    const confirmed = window.confirm(
      "Är du säker på att du vill lämna ligan? Dina tips ligger kvar i databasen, men du tas bort från ligan.",
    );

    if (!confirmed) return;

    setLeavingLeague(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Du måste vara inloggad.");
      setLeavingLeague(false);
      return;
    }

    const { error } = await supabase
      .from("league_members")
      .delete()
      .eq("league_id", leagueId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
      setLeavingLeague(false);
      return;
    }

    router.push("/dashboard");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Laddar liga...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/dashboard" className="text-emerald-300 hover:underline">
          ← Tillbaka till dashboard
        </Link>

        <div className="mt-6 mb-8 rounded-3xl bg-white/10 border border-white/10 p-6">
          <p className="text-slate-400 text-sm">
            {league?.tournaments?.name} {league?.tournaments?.year}
          </p>

          <h1 className="text-3xl md:text-5xl font-black mt-2">
            {league?.name}
          </h1>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="rounded-2xl bg-slate-900/70 px-4 py-3">
              <p className="text-xs text-slate-400">Invite code</p>
              <p className="text-emerald-300 font-black">
                {league?.invite_code}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                copyToClipboard(league?.invite_code ?? "", "Invite code")
              }
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-black hover:bg-slate-800"
            >
              Kopiera kod
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(getInviteLink(), "Invite-länk")}
              className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400"
            >
              Kopiera invite-länk
            </button>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-slate-900 p-4">{message}</div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <section className="space-y-6">
            <div className="rounded-3xl bg-white/10 border border-white/10 p-4 md:p-6">
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl font-black">Bonus-tips</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Tippa slutplaceringar och skytteligavinnare.
                </p>
                {bonusLocked && (
                  <p className="mt-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-sm font-bold text-yellow-300">
                    Bonus-tips är låsta eftersom turneringen har startat.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400">Vinnare</label>
                  <select
                    disabled={bonusLocked}
                    value={tournamentPrediction.winner_team}
                    onChange={(e) =>
                      updateTournamentPrediction("winner_team", e.target.value)
                    }
                    className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <option value="">Välj lag</option>
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Andraplats</label>
                  <select
                    disabled={bonusLocked}
                    value={tournamentPrediction.runner_up_team}
                    onChange={(e) =>
                      updateTournamentPrediction(
                        "runner_up_team",
                        e.target.value,
                      )
                    }
                    className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <option value="">Välj lag</option>
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Tredjeplats</label>
                  <select
                    disabled={bonusLocked}
                    value={tournamentPrediction.third_place_team}
                    onChange={(e) =>
                      updateTournamentPrediction(
                        "third_place_team",
                        e.target.value,
                      )
                    }
                    className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <option value="">Välj lag</option>
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-slate-400">
                    Skytteligavinnare
                  </label>
                  <input
                    type="text"
                    disabled={bonusLocked}
                    value={tournamentPrediction.top_scorer}
                    onChange={(e) =>
                      updateTournamentPrediction("top_scorer", e.target.value)
                    }
                    placeholder="Ex: Kylian Mbappé"
                    className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={saveTournamentPrediction}
                  disabled={bonusLocked || !bonusHasChanged || savingBonus}
                  className="rounded-xl bg-purple-500 px-6 py-3 font-black hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {bonusLocked
                    ? "Bonus låst"
                    : savingBonus
                      ? "Sparar..."
                      : bonusHasChanged
                        ? "Spara bonus-tips"
                        : "Bonus sparat ✅"}
                </button>

                {!bonusHasChanged && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-300">
                    Uppdaterat
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-white/10 border border-white/10 p-4 md:p-6">
              <button
                type="button"
                onClick={() => setShowGroupTables((prev) => !prev)}
                className="w-full flex items-start sm:items-center justify-between gap-4 text-left"
              >
                <div>
                  <h2 className="text-2xl md:text-3xl font-black">
                    Grupptabeller
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Tabellerna räknas automatiskt ut från dina tips i
                    gruppspelet.
                  </p>
                </div>

                <span className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold">
                  {showGroupTables ? "Dölj" : "Visa"}
                </span>
              </button>

              {showGroupTables && (
                <div className="mt-6">
                  {groupTableEntries.length === 0 ? (
                    <div className="rounded-2xl bg-slate-900 p-6 text-slate-300">
                      Inga grupptabeller ännu.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                      {groupTableEntries.map(([groupLetter, rows]) => (
                        <div
                          key={groupLetter}
                          className="rounded-2xl bg-slate-900 p-4 md:p-5"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-black">
                              Grupp {groupLetter}
                            </h3>
                            <span className="text-xs text-slate-400">
                              {rows.length} lag
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-slate-400 border-b border-white/10">
                                  <th className="text-left py-2 pr-3">#</th>
                                  <th className="text-left py-2 pr-3">Lag</th>
                                  <th className="text-right py-2 px-2">M</th>
                                  <th className="text-right py-2 px-2">GM</th>
                                  <th className="text-right py-2 px-2">IM</th>
                                  <th className="text-right py-2 px-2">+/-</th>
                                  <th className="text-right py-2 pl-2">P</th>
                                </tr>
                              </thead>

                              <tbody>
                                {rows.map((row, index) => {
                                  const qualifiesDirectly = index < 2;
                                  const isThird = index === 2;

                                  return (
                                    <tr
                                      key={row.team}
                                      className="border-b border-white/5 last:border-b-0"
                                    >
                                      <td className="py-2 pr-3">
                                        <span
                                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                            qualifiesDirectly
                                              ? "bg-emerald-500/20 text-emerald-300"
                                              : isThird
                                                ? "bg-yellow-500/20 text-yellow-300"
                                                : "bg-slate-800 text-slate-400"
                                          }`}
                                        >
                                          {index + 1}
                                        </span>
                                      </td>

                                      <td className="py-2 pr-3 font-bold">
                                        {row.team}
                                      </td>

                                      <td className="text-right py-2 px-2">
                                        {row.played}
                                      </td>

                                      <td className="text-right py-2 px-2">
                                        {row.goalsFor}
                                      </td>

                                      <td className="text-right py-2 px-2">
                                        {row.goalsAgainst}
                                      </td>

                                      <td className="text-right py-2 px-2">
                                        {row.goalDifference > 0
                                          ? `+${row.goalDifference}`
                                          : row.goalDifference}
                                      </td>

                                      <td className="text-right py-2 pl-2 font-black text-emerald-300">
                                        {row.points}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white/10 border border-white/10 p-4 md:p-6">
              <div className="w-full flex items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black">
                    Slutspelsträd
                  </h2>

                  <p className="text-slate-400 text-sm mt-1">
                    Uppdateras automatiskt baserat på dina tips.
                  </p>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBracketMode("predictions")}
                      className={`rounded-xl px-4 py-2 text-sm font-black ${
                        bracketMode === "predictions"
                          ? "bg-white text-slate-950"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      Mina tips
                    </button>

                    <button
                      type="button"
                      onClick={() => setBracketMode("actual")}
                      className={`rounded-xl px-4 py-2 text-sm font-black ${
                        bracketMode === "actual"
                          ? "bg-white text-slate-950"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      Resultat
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBracket((prev) => !prev)}
                  className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold hover:bg-slate-800"
                >
                  {showBracket ? "Dölj" : "Visa"}
                </button>
              </div>

              {showBracket && (
                <div className="mt-6 w-full max-w-full overflow-x-auto pb-4">
                  {(() => {
                    const getRound = (names: string[]) =>
                      bracketRounds
                        .filter((round) => names.includes(round.roundName))
                        .flatMap((round) => round.matches);

                    const round32 = getRound(["Round of 32"]);
                    const round16 = getRound(["Round of 16"]);
                    const quarters = getRound([
                      "Quarterfinals",
                      "Quarter-finals",
                      "Quarter Finals",
                    ]);
                    const semis = getRound([
                      "Semifinals",
                      "Semi-finals",
                      "Semi Finals",
                    ]);
                    const thirdPlace = getRound([
                      "Third Place Playoff",
                      "Third place",
                      "Third Place",
                    ]);
                    const finals = getRound(["Final"]);

                    const split = <T,>(items: T[]) => {
                      const middle = Math.ceil(items.length / 2);
                      return [items.slice(0, middle), items.slice(middle)];
                    };

                    const [round32Left, round32Right] = split(round32);
                    const [round16Left, round16Right] = split(round16);
                    const [quartersLeft, quartersRight] = split(quarters);
                    const [semisLeft, semisRight] = split(semis);

                    function MatchCard({
                      match,
                      compact = false,
                    }: {
                      match: Match;
                      compact?: boolean;
                    }) {
                      const homeDisplayName = resolveTeamName(
                        match.home_team?.name,
                      );
                      const awayDisplayName = resolveTeamName(
                        match.away_team?.name,
                      );

                      const visibleHomeName =
                        homeDisplayName && !isPlaceholderTeam(homeDisplayName)
                          ? homeDisplayName
                          : "";

                      const visibleAwayName =
                        awayDisplayName && !isPlaceholderTeam(awayDisplayName)
                          ? awayDisplayName
                          : "";

                      const matchNumber = getMatchNumber(match);
                      const result = matchNumber
                        ? knockoutResults[matchNumber]
                        : null;

                      const homeIsWinner =
                        visibleHomeName && result?.winner === visibleHomeName;
                      const awayIsWinner =
                        visibleAwayName && result?.winner === visibleAwayName;

                      return (
                        <div
                          className={`rounded-xl bg-slate-900 border border-white/10 ${
                            compact ? "p-2" : "p-3"
                          }`}
                        >
                          <p className="text-[10px] text-slate-500 mb-2">
                            Match {matchNumber ?? "-"}
                          </p>

                          <div
                            className={`rounded-lg px-2 py-1.5 mb-1.5 flex justify-between gap-2 ${
                              homeIsWinner
                                ? "bg-emerald-500/20 text-emerald-300 font-black"
                                : "bg-slate-800 text-white"
                            }`}
                          >
                            <span className="truncate text-xs">
                              {visibleHomeName || "\u00A0"}
                            </span>
                            {homeIsWinner && <span className="text-xs">✓</span>}
                          </div>

                          <div
                            className={`rounded-lg px-2 py-1.5 flex justify-between gap-2 ${
                              awayIsWinner
                                ? "bg-emerald-500/20 text-emerald-300 font-black"
                                : "bg-slate-800 text-white"
                            }`}
                          >
                            <span className="truncate text-xs">
                              {visibleAwayName || "\u00A0"}
                            </span>
                            {awayIsWinner && <span className="text-xs">✓</span>}
                          </div>
                        </div>
                      );
                    }

                    function RoundColumn({
                      title,
                      matches,
                      align = "start",
                      compact = false,
                    }: {
                      title: string;
                      matches: Match[];
                      align?: "start" | "center" | "end";
                      compact?: boolean;
                    }) {
                      return (
                        <div className="w-44 shrink-0">
                          <h3 className="text-center text-xs font-black text-slate-300 mb-3">
                            {title}
                          </h3>

                          <div
                            className={`flex flex-col gap-3 ${
                              align === "center"
                                ? "justify-center"
                                : align === "end"
                                  ? "justify-end"
                                  : "justify-start"
                            }`}
                          >
                            {matches.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                                Saknas
                              </div>
                            ) : (
                              matches.map((match) => (
                                <MatchCard
                                  key={match.id}
                                  match={match}
                                  compact={compact}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="min-w-[1600px]">
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_260px_1fr_1fr_1fr_1fr] gap-4 items-center">
                          <RoundColumn
                            title="Round of 32"
                            matches={round32Left}
                            compact
                          />

                          <RoundColumn
                            title="Round of 16"
                            matches={round16Left}
                            align="center"
                            compact
                          />

                          <RoundColumn
                            title="Kvartsfinaler"
                            matches={quartersLeft}
                            align="center"
                            compact
                          />

                          <RoundColumn
                            title="Semifinal"
                            matches={semisLeft}
                            align="center"
                          />

                          <div className="w-64 shrink-0">
                            <div className="text-center mb-4">
                              <div className="text-4xl mb-2">🏆</div>
                              <h3 className="text-sm font-black text-white">
                                Final & 3:e pris
                              </h3>
                            </div>

                            <div className="space-y-5">
                              <div>
                                <h4 className="text-center text-xs font-black text-slate-300 mb-3">
                                  Final
                                </h4>
                                {finals.length > 0 ? (
                                  finals.map((match) => (
                                    <MatchCard key={match.id} match={match} />
                                  ))
                                ) : (
                                  <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                                    Final saknas
                                  </div>
                                )}
                              </div>

                              <div>
                                <h4 className="text-center text-xs font-black text-slate-300 mb-3">
                                  3:e pris
                                </h4>
                                {thirdPlace.length > 0 ? (
                                  thirdPlace.map((match) => (
                                    <MatchCard key={match.id} match={match} />
                                  ))
                                ) : (
                                  <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                                    Bronsmatch saknas
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <RoundColumn
                            title="Semifinal"
                            matches={semisRight}
                            align="center"
                          />

                          <RoundColumn
                            title="Kvartsfinaler"
                            matches={quartersRight}
                            align="center"
                            compact
                          />

                          <RoundColumn
                            title="Round of 16"
                            matches={round16Right}
                            align="center"
                            compact
                          />

                          <RoundColumn
                            title="Round of 32"
                            matches={round32Right}
                            compact
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            
            </div>

            <div className="rounded-3xl bg-white/10 border border-white/10 p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black">
                    Matcher & Tips
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Vid oavgjort i slutspel måste du välja vinnare.
                  </p>
                </div>

                <div className="flex gap-2">
                  {[
                    ["all", "Alla"],
                    ["upcoming", "Kommande"],
                    ["finished", "Färdiga"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key as Filter)}
                      className={`rounded-xl px-4 py-2 text-sm font-bold ${
                        filter === key
                          ? "bg-white text-slate-950"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredMatches.length === 0 ? (
                <div className="rounded-2xl bg-slate-900 p-6 text-slate-300">
                  Inga matcher hittades för denna liga.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredMatches.map((match) => {
                    const hasStarted = new Date(match.kickoff_at) <= new Date();
                    const isLocked = match.status !== "upcoming" || hasStarted;
                    const homeDisplayName = resolveTeamName(
                      match.home_team?.name,
                    );
                    const awayDisplayName = resolveTeamName(
                      match.away_team?.name,
                    );
                    const currentPrediction = predictionInputs[match.id];
                    const matchPoint = matchPointsById[match.id];
                    const homeScore = Number(currentPrediction?.home);
                    const awayScore = Number(currentPrediction?.away);

                    const showWinnerSelect =
                      isKnockoutMatch(match) &&
                      currentPrediction?.home !== "" &&
                      currentPrediction?.away !== "" &&
                      !Number.isNaN(homeScore) &&
                      !Number.isNaN(awayScore) &&
                      homeScore === awayScore;

                    return (
                      <div
                        key={match.id}
                        className="rounded-2xl bg-slate-900 p-4 md:p-5"
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
                          <div>
                            <p className="text-slate-400 text-sm">
                              {match.round} ·{" "}
                              {new Date(match.kickoff_at).toLocaleString(
                                "sv-SE",
                              )}
                            </p>

                            <h3 className="text-xl md:text-3xl font-black mt-3">
                              {homeDisplayName || "Ej klart"} -{" "}
                              {awayDisplayName || "Ej klart"}
                            </h3>

                            {(homeDisplayName !== match.home_team?.name ||
                              awayDisplayName !== match.away_team?.name) && (
                              <p className="text-xs text-emerald-300 mt-2">
                                Uträknat från dina tips
                              </p>
                            )}
                          </div>

                          <span
                            className={`h-fit rounded-full px-3 py-1 text-xs font-black ${getStatusClass(
                              match.status,
                            )}`}
                          >
                            {getStatusText(match.status)}
                          </span>
                        </div>

                        {match.status === "finished" && (
                          <div className="mt-3 space-y-2">
                            <p className="text-emerald-300 font-bold">
                              Resultat: {match.home_goals} - {match.away_goals}
                            </p>

                            {currentPrediction?.home !== undefined &&
                              currentPrediction?.away !== undefined && (
                                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-slate-400">
                                      Ditt tips:
                                    </span>
                                    <span className="font-black text-white">
                                      {currentPrediction.home || "-"} -{" "}
                                      {currentPrediction.away || "-"}
                                    </span>

                                    {matchPoint ? (
                                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-300">
                                        +{matchPoint.total_points ?? 0} poäng
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-300">
                                        Poäng räknas...
                                      </span>
                                    )}
                                  </div>

                                  {matchPoint && (
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                                      <span>
                                        Hemmamål:{" "}
                                        {matchPoint.home_goal_points ?? 0}p
                                      </span>
                                      <span>
                                        Bortamål:{" "}
                                        {matchPoint.away_goal_points ?? 0}p
                                      </span>
                                      <span>
                                        Tecken: {matchPoint.sign_points ?? 0}p
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        )}

                        <div className="mt-5">
                          <p className="text-sm text-slate-400 mb-2">
                            Ditt tips
                          </p>

                          <div className="flex flex-wrap gap-3">
                            <input
                              type="number"
                              disabled={isLocked}
                              value={predictionInputs[match.id]?.home ?? ""}
                              onChange={(e) =>
                                updatePrediction(
                                  match.id,
                                  "home",
                                  e.target.value,
                                )
                              }
                              className="w-20 rounded-xl bg-slate-800 px-3 py-2 disabled:opacity-40"
                            />

                            <input
                              type="number"
                              disabled={isLocked}
                              value={predictionInputs[match.id]?.away ?? ""}
                              onChange={(e) =>
                                updatePrediction(
                                  match.id,
                                  "away",
                                  e.target.value,
                                )
                              }
                              className="w-20 rounded-xl bg-slate-800 px-3 py-2 disabled:opacity-40"
                            />

                            <button
                              disabled={isLocked || savingPredictionId === match.id}
                              onClick={() => savePrediction(match)}
                              className="rounded-xl bg-emerald-500 px-5 font-bold disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                            >
                              {savingPredictionId === match.id
                                ? "Sparar..."
                                : isLocked
                                  ? "Låst"
                                  : "Spara tips"}
                            </button>
                          </div>

                          {showWinnerSelect && (
                            <div className="mt-4">
                              <label className="text-sm text-slate-400">
                                Välj vinnare efter förlängning/straffar
                              </label>

                              <select
                                disabled={isLocked}
                                value={predictionInputs[match.id]?.winner ?? ""}
                                onChange={(e) =>
                                  updatePredictionWinner(
                                    match.id,
                                    e.target.value,
                                  )
                                }
                                className="mt-2 w-full max-w-md rounded-xl bg-slate-800 px-4 py-3 outline-none disabled:opacity-40"
                              >
                                <option value="">Välj vinnare</option>
                                <option value={homeDisplayName}>
                                  {homeDisplayName}
                                </option>
                                <option value={awayDisplayName}>
                                  {awayDisplayName}
                                </option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        
          <aside className="rounded-3xl bg-white/10 border border-white/10 p-4 md:p-6 h-fit">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl md:text-3xl font-black">Leaderboard</h2>
                <p className="text-sm text-slate-400">
                  {memberCount} deltagare
                </p>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="rounded-2xl bg-slate-900 p-5 text-slate-300">
                Inga poäng ännu.
              </div>
            ) : (
              leaderboard.map((row, index) => {
                const isCurrentUser = row.user_id === currentUserId;

                return (
                  <div
                    key={row.user_id}
                    className={`rounded-2xl p-4 flex justify-between mb-3 border ${
                      isCurrentUser
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-slate-900 border-transparent"
                    }`}
                  >
                    <span className="font-bold">
                      #{index + 1} {row.full_name}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-emerald-300">
                          du
                        </span>
                      )}
                    </span>

                    <span className="text-emerald-300 font-black">
                      {row.total_points}
                    </span>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={leaveLeague}
              disabled={leavingLeague}
              className="mt-4 w-full rounded-xl bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {leavingLeague ? "Lämnar..." : "Lämna liga"}
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}
