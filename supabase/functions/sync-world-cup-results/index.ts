import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse } from "../shared/cors.ts";
import {
  fetchWorldCupMatchesFromProvider,
  upsertTeam,
} from "../shared/footballResultsService.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();

    const matches = await fetchWorldCupMatchesFromProvider();

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("external_id", "world_cup_2026")
      .single();

    if (tournamentError) throw tournamentError;

    let updatedMatches = 0;

    for (const match of matches) {
      const homeTeamId = await upsertTeam(
        supabase,
        match.home_team_name,
        match.home_team_external_id
      );

      const awayTeamId = await upsertTeam(
        supabase,
        match.away_team_name,
        match.away_team_external_id
      );

      const { data: upsertedMatch, error: matchError } = await supabase
        .from("matches")
        .upsert(
          {
            tournament_id: tournament.id,
            external_id: match.external_id,
            round: match.round,
            group_name: match.group_name,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            kickoff_at: match.kickoff_at,
            status: match.status,
            home_goals: match.home_goals,
            away_goals: match.away_goals,
            result_source: "api-football",
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        )
        .select("id, status")
        .single();

      if (matchError) throw matchError;

      if (upsertedMatch?.id && match.status === "finished") {
        await supabase.rpc("recalculate_points_for_match", {
          match_id_input: upsertedMatch.id,
        });
      }

      updatedMatches++;
    }

    return jsonResponse({
      success: true,
      tournament: "world_cup_2022",
      fetchedMatches: matches.length,
      updatedMatches,
      syncedAt: new Date().toISOString(),
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