import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse } from "../shared/cors.ts";

type ImportMatch = {
  tournament_external_id: string;
  external_id?: string;
  round?: string;
  group_name?: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status?: "upcoming" | "live" | "finished" | "postponed" | "cancelled";
  home_goals?: number | null;
  away_goals?: number | null;
};

async function upsertTeam(supabase: any, name: string) {
  const { data: existing } = await supabase
    .from("teams")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("teams")
    .insert({ name })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json();

    const matches: ImportMatch[] = Array.isArray(body) ? body : body.matches;

    if (!Array.isArray(matches)) {
      return jsonResponse(
        {
          success: false,
          error: "Body must be an array or { matches: [...] }",
        },
        400
      );
    }

    let imported = 0;

    for (const match of matches) {
      const { data: tournament, error: tournamentError } = await supabase
        .from("tournaments")
        .select("id")
        .eq("external_id", match.tournament_external_id)
        .single();

      if (tournamentError || !tournament) {
        throw new Error(
          `Tournament not found: ${match.tournament_external_id}`
        );
      }

      const homeTeamId = await upsertTeam(supabase, match.home_team);
      const awayTeamId = await upsertTeam(supabase, match.away_team);

      const externalId =
        match.external_id ??
        `${match.tournament_external_id}_${match.home_team}_${match.away_team}_${match.kickoff_at}`
          .toLowerCase()
          .replaceAll(" ", "_")
          .replaceAll(":", "-");

      const { error: matchError } = await supabase.from("matches").upsert(
        {
          tournament_id: tournament.id,
          external_id: externalId,
          round: match.round ?? null,
          group_name: match.group_name ?? null,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          kickoff_at: match.kickoff_at,
          status: match.status ?? "upcoming",
          home_goals: match.home_goals ?? null,
          away_goals: match.away_goals ?? null,
          result_source: "manual-import",
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "external_id" }
      );

      if (matchError) throw matchError;

      imported++;
    }

    return jsonResponse({
      success: true,
      imported,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});