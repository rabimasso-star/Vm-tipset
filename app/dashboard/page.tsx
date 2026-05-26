"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

type League = {
  id: string;
  name: string;
  invite_code: string;
  type: string;
};

function normalizeInviteCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [leagues, setLeagues] = useState<League[]>([]);
  const [message, setMessage] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/";
      return;
    }

    setUserEmail(user.email ?? "");

    const { data: memberships, error } = await supabase
      .from("league_members")
      .select(`
        leagues (
          id,
          name,
          invite_code,
          type
        )
      `)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    const mappedLeagues =
      memberships?.map((m: any) => m.leagues).filter(Boolean) ?? [];

    setLeagues(mappedLeagues);
  }

  async function joinLeague() {
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const cleanCode = normalizeInviteCode(inviteCode);

    if (!cleanCode) {
      setMessage("Skriv en invite code.");
      return;
    }

    setJoining(true);

    const alreadyJoinedLeague = leagues.find(
      (league) => normalizeInviteCode(league.invite_code) === cleanCode
    );

    if (alreadyJoinedLeague) {
      window.location.href = `/dashboard/league/${alreadyJoinedLeague.id}`;
      return;
    }

    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .select("id, invite_code")
      .ilike("invite_code", cleanCode)
      .maybeSingle();

    if (leagueError) {
      setMessage(leagueError.message);
      setJoining(false);
      return;
    }

    if (!league) {
      setMessage("Ligakod hittades inte.");
      setJoining(false);
      return;
    }

    const { error } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "member",
    });

    if (error) {
      const isDuplicate =
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate");

      if (isDuplicate) {
        window.location.href = `/dashboard/league/${league.id}`;
        return;
      }

      setMessage(error.message);
      setJoining(false);
      return;
    }

    window.location.href = `/dashboard/league/${league.id}`;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6">
          <div>
            <h1 className="text-3xl md:text-5xl font-black">
              VM-tipset Dashboard
            </h1>
            <p className="text-slate-400 mt-2">{userEmail}</p>
          </div>

          <button
            onClick={logout}
            className="w-fit rounded-xl bg-red-500 px-6 py-3 font-bold hover:bg-red-400"
          >
            Logga ut
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-10">
          <Link
            href="/tournaments"
            className="rounded-3xl bg-white/10 border border-white/10 p-6 md:p-8 hover:border-emerald-400 transition"
          >
            <h2 className="text-2xl md:text-3xl font-black">Välj turnering</h2>
            <p className="text-slate-400 mt-3">
              Skapa en ny liga för VM, Premier League eller andra turneringar.
            </p>
          </Link>

          <div className="rounded-3xl bg-white/10 border border-white/10 p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-black">Gå med i liga</h2>

            <input
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) =>
                setInviteCode(normalizeInviteCode(e.target.value))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !joining) {
                  joinLeague();
                }
              }}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 mt-5 outline-none"
            />

            <button
              onClick={joinLeague}
              disabled={joining}
              className="w-full rounded-xl bg-blue-500 py-3 mt-4 font-black hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {joining ? "Går med..." : "Gå med"}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl bg-slate-900 p-4">{message}</div>
        )}

        <div className="mt-10 rounded-3xl bg-white/10 border border-white/10 p-6 md:p-8">
          <h2 className="text-3xl md:text-4xl font-black">Mina ligor</h2>
          <p className="text-slate-400 mt-2">
            Välj en liga för att se matcher, tips och leaderboard.
          </p>

          {leagues.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-slate-900 p-6 text-slate-300">
              Du är inte med i någon liga ännu.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={`/dashboard/league/${league.id}`}
                  className="rounded-2xl bg-slate-900 p-5 border border-transparent hover:border-emerald-400 transition"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black">{league.name}</h3>
                      <p className="text-slate-400">Typ: {league.type}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-400">Kod</p>
                      <p className="text-emerald-300 font-black">
                        {league.invite_code}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}