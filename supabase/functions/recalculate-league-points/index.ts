import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse } from "../shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const { leagueId, matchId } = body;

    // Om specifik match skickas
    if (matchId) {
      const { error } = await supabase.rpc("recalculate_points_for_match", {
        match_id_input: matchId,
      });

      if (error) throw error;

      return jsonResponse({
        success: true,
        scope: "match",
        matchId,
      });
    }

    // Om hel liga ska räknas om
    if (!leagueId) {
      return jsonResponse(
        {
          success: false,
          error: "Missing leagueId or matchId",
        },
        400
      );
    }

    const { data: predictions, error: predictionsError } = await supabase
      .from("predictions")
      .select("id")
      .eq("league_id", leagueId);

    if (predictionsError) throw predictionsError;

    for (const prediction of predictions ?? []) {
      await supabase.rpc("calculate_prediction_points", {
        prediction_id_input: prediction.id,
      });
    }

    return jsonResponse({
      success: true,
      scope: "league",
      leagueId,
      recalculatedPredictions: predictions?.length ?? 0,
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