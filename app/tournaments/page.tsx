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
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Laddar turneringar...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/dashboard" className="text-emerald-300 hover:underline">
          ← Tillbaka till dashboard
        </Link>

        <div className="mt-8 mb-10">
          <h1 className="text-5xl font-black">Välj turnering</h1>
          <p className="text-slate-400 mt-3">
            Skapa eller gå med i en tipstävling kopplad till en specifik
            turnering.
          </p>
        </div>

        {tournaments.length === 0 ? (
          <div className="rounded-3xl bg-white/10 border border-white/10 p-8">
            Inga turneringar finns ännu.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {tournaments.map((tournament) => (
              <Link
                key={tournament.id}
                href={`/tournaments/${tournament.id}`}
                className="rounded-3xl bg-white/10 border border-white/10 p-6 hover:border-emerald-400 transition"
              >
                <p className="text-sm text-slate-400">Turnering</p>
                <h2 className="text-2xl font-black mt-2">
                  {tournament.name}
                </h2>

                <p className="mt-2 text-emerald-300 font-bold">
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