"use client";

import { useState } from "react";
import Link from "next/link";

const sampleJson = `[
  {
    "tournament_external_id": "world_cup_2026",
    "round": "Gruppspel",
    "group_name": "Group A",
    "home_team": "Sverige",
    "away_team": "Tyskland",
    "kickoff_at": "2026-06-12T19:00:00Z",
    "status": "upcoming"
  },
  {
    "tournament_external_id": "world_cup_2026",
    "round": "Gruppspel",
    "group_name": "Group B",
    "home_team": "Argentina",
    "away_team": "Japan",
    "kickoff_at": "2026-06-13T16:00:00Z",
    "status": "upcoming"
  }
]`;

export default function ImportMatchesPage() {
  const [jsonInput, setJsonInput] = useState(sampleJson);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function importMatches() {
    setMessage("");
    setLoading(true);

    try {
      const parsed = JSON.parse(jsonInput);

      const res = await fetch(
        "https://gphxemepikbgwcnxewks.supabase.co/functions/v1/import-matches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsed),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setMessage(`✅ Import klar! ${data.imported} matcher importerade.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Något gick fel."
      );
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard" className="text-emerald-300 hover:underline">
          ← Tillbaka till dashboard
        </Link>

        <div className="mt-8 mb-8">
          <h1 className="text-5xl font-black">Admin: Importera matcher</h1>
          <p className="text-slate-400 mt-3">
            Klistra in JSON för att skapa matcher i Supabase.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-slate-900 p-4">
            {message}
          </div>
        )}

        <div className="rounded-3xl bg-white/10 border border-white/10 p-6">
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="w-full h-[500px] rounded-2xl bg-slate-900 p-4 font-mono text-sm outline-none"
          />

          <button
            onClick={importMatches}
            disabled={loading}
            className="mt-6 rounded-xl bg-emerald-500 px-8 py-4 font-black disabled:bg-slate-700"
          >
            {loading ? "Importerar..." : "Importera matcher"}
          </button>
        </div>
      </div>
    </main>
  );
}