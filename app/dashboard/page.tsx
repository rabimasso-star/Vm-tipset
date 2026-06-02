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
      (league) => normalizeInviteCode(league.invite_code) === cleanCode,
    );

    if (alreadyJoinedLeague) {
      window.location.href = `/dashboard/league/${alreadyJoinedLeague.id}`;
      return;
    }

    // RLS hides leagues you aren't a member of, so join via a SECURITY DEFINER
    // function that looks up the code and adds you (idempotent on re-join).
    const { data, error } = await supabase.rpc("join_league_by_code", {
      invite_code_input: cleanCode,
    });

    if (error) {
      setMessage(error.message);
      setJoining(false);
      return;
    }

    const joined = Array.isArray(data) ? data[0] : data;

    if (!joined?.league_id) {
      setMessage("Ligakod hittades inte.");
      setJoining(false);
      return;
    }

    window.location.href = `/dashboard/league/${joined.league_id}`;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,.18),transparent_30%),#0f172a] text-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 md:p-8 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-400">
                VM 2026
              </p>
              <h1 className="mt-3 text-4xl font-black md:text-6xl">
                Prediction Center
              </h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                Skapa ligor, bjud in vänner och följ poäng, matcher och slutspel i realtid.
              </p>
              <p className="mt-3 text-sm text-slate-400">{userEmail}</p>
            </div>

            <button
              onClick={logout}
              className="w-fit rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-3 font-black text-red-200 hover:bg-red-500/20"
            >
              Logga ut
            </button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-3xl">🏆</p>
              <p className="mt-2 text-2xl font-black">48</p>
              <p className="text-sm text-slate-400">lag</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-3xl">⚽</p>
              <p className="mt-2 text-2xl font-black">104</p>
              <p className="text-sm text-slate-400">matcher</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-3xl">👥</p>
              <p className="mt-2 text-2xl font-black">{leagues.length}</p>
              <p className="text-sm text-slate-400">mina ligor</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Link
            href="/tournaments"
            className="group rounded-3xl border border-white/10 bg-slate-800/90 p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-emerald-400/60 hover:bg-slate-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-300">
                  Starta tävling
                </p>
                <h2 className="mt-3 text-3xl font-black">Välj turnering</h2>
                <p className="mt-3 text-slate-300">
                  Skapa en ny liga för VM, Premier League eller andra turneringar.
                </p>
              </div>
              <span className="rounded-2xl bg-amber-400/20 px-4 py-3 text-3xl">
                🏟️
              </span>
            </div>
          </Link>

          <div className="rounded-3xl border border-white/10 bg-slate-800/90 p-6 shadow-xl shadow-black/20">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-amber-300">
              Invite
            </p>
            <h2 className="mt-3 text-3xl font-black">Gå med i liga</h2>

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
              className="mt-5 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />

            <button
              onClick={joinLeague}
              disabled={joining}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 py-3 font-black text-white hover:from-emerald-400 hover:to-green-500 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400"
            >
              {joining ? "Går med..." : "Gå med"}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            {message}
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-800/90 p-6 md:p-8 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-300">
                Mina tävlingar
              </p>
              <h2 className="mt-2 text-3xl font-black md:text-4xl">Mina ligor</h2>
              <p className="mt-2 text-slate-400">
                Välj en liga för att se matcher, tips och leaderboard.
              </p>
            </div>
          </div>

          {leagues.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/60 p-6 text-slate-300">
              Du är inte med i någon liga ännu.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {leagues.map((league, index) => (
                <Link
                  key={league.id}
                  href={`/dashboard/league/${league.id}`}
                  className="group rounded-2xl border border-white/10 bg-slate-950/70 p-5 transition hover:-translate-y-1 hover:border-amber-400/60 hover:bg-slate-900"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-2xl">{index === 0 ? "🥇" : "🏆"}</p>
                      <h3 className="mt-2 text-2xl font-black">{league.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        Typ: {league.type}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-widest text-slate-500">
                        Kod
                      </p>
                      <p className="mt-1 rounded-xl bg-emerald-400/10 px-3 py-1 font-black text-emerald-300">
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
