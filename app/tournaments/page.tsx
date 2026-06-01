"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

type Tournament = {
  id: string;
  name: string;
  year: number;
  external_id: string | null;
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, year, external_id")
      .order("year", { ascending: false });

    if (!error) {
      setTournaments(data ?? []);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Laddar turneringar...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,.15),transparent_30%),#0f172a] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard" className="text-emerald-300 hover:underline">
          ← Tillbaka till dashboard
        </Link>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-400">
            Turneringar
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">
            Välj turnering
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Skapa eller gå med i en tipstävling kopplad till en specifik turnering.
          </p>
        </div>

        {tournaments.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-800/90 p-8 text-slate-300">
            Inga turneringar finns ännu.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {tournaments.map((tournament) => (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.id}`}
                className="group rounded-3xl border border-white/10 bg-slate-800/90 p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-amber-400/60 hover:bg-slate-800"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-300">
                      Turnering
                    </p>
                    <h2 className="mt-3 text-3xl font-black">
                      {tournament.name}
                    </h2>
                  </div>
                  <span className="rounded-2xl bg-amber-400/20 px-4 py-3 text-3xl">
                    🏆
                  </span>
                </div>

                <p className="mt-4 w-fit rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-black text-emerald-300">
                  {tournament.year}
                </p>

                <p className="mt-6 text-sm text-slate-400">
                  Klicka för att skapa liga eller se matcher.
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
