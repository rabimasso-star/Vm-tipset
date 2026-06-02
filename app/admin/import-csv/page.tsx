"use client";

import { useState } from "react";
import Link from "next/link";

type ImportMatch = {
  tournament_external_id: string;
  round?: string;
  group_name?: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status?: string;
};

const sampleCsv = `tournament_external_id,round,group_name,home_team,away_team,kickoff_at,status
world_cup_2026,Gruppspel,Group A,Sverige,Tyskland,2026-06-12T19:00:00Z,upcoming
world_cup_2026,Gruppspel,Group B,Argentina,Japan,2026-06-13T16:00:00Z,upcoming`;

function parseCsv(csv: string): ImportMatch[] {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());

    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return {
      tournament_external_id: row.tournament_external_id,
      round: row.round,
      group_name: row.group_name,
      home_team: row.home_team,
      away_team: row.away_team,
      kickoff_at: row.kickoff_at,
      status: row.status || "upcoming",
    };
  });
}

export default function ImportCsvPage() {
  const [csvInput, setCsvInput] = useState(sampleCsv);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function importCsv() {
    setMessage("");
    setLoading(true);

    try {
      const matches = parseCsv(csvInput);

      const res = await fetch(
        "https://gphxemepikbgwcnxewks.supabase.co/functions/v1/import-matches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(matches),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setMessage(`✅ Import klar! ${data.imported} matcher importerade.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Något gick fel.");
    }

    setLoading(false);
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      setCsvInput(String(reader.result));
    };

    reader.readAsText(file);
  }

  return (
    <main className="min-h-screen text-white p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard" className="text-emerald-300 hover:underline">
          ← Tillbaka till dashboard
        </Link>

        <div className="mt-8 mb-8">
          <h1 className="text-5xl font-black">Admin: Importera CSV</h1>
          <p className="text-slate-400 mt-3">
            Klistra in CSV eller ladda upp en CSV-fil för att skapa matcher.
          </p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-slate-900 p-4">{message}</div>
        )}

        <div className="rounded-3xl bg-slate-900/60 border border-white/10 p-6">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="mb-6 block w-full rounded-xl bg-slate-900 p-3"
          />

          <textarea
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
            className="w-full h-[420px] rounded-2xl bg-slate-900 p-4 font-mono text-sm outline-none"
          />

          <button
            onClick={importCsv}
            disabled={loading}
            className="mt-6 rounded-xl bg-emerald-500 px-8 py-4 font-black disabled:bg-slate-700"
          >
            {loading ? "Importerar..." : "Importera CSV"}
          </button>
        </div>
      </div>
    </main>
  );
}