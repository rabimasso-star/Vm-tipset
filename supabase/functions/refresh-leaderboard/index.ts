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

    const { leagueId } = body;

    if (!leagueId) {
      return jsonResponse(
        {
          success: false,
          error: "Missing leagueId",
        },
        400
      );
    }

    const { data: members, error: membersError } = await supabase
      .from("league_members")
      .select("user_id, profiles(full_name)")
      .eq("league_id", leagueId);

    if (membersError) throw membersError;

    let updated = 0;

    for (const member of members ?? []) {
      const userId = member.user_id;

      const { data: matchPointRows, error: matchPointsError } = await supabase
        .from("points")
        .select("total_points")
        .eq("league_id", leagueId)
        .eq("user_id", userId);

      if (matchPointsError) throw matchPointsError;

      const matchPoints =
        matchPointRows?.reduce((sum, row) => {
          return sum + Number(row.total_points ?? 0);
        }, 0) ?? 0;

      const { data: bonusRows, error: bonusError } = await supabase
        .from("tournament_predictions")
        .select("points")
        .eq("league_id", leagueId)
        .eq("user_id", userId);

      if (bonusError) throw bonusError;

      const bonusPoints =
        bonusRows?.reduce((sum, row) => {
          return sum + Number(row.points ?? 0);
        }, 0) ?? 0;

      const totalPoints = matchPoints + bonusPoints;

      const fullNameRaw = Array.isArray(member.profiles)
        ? member.profiles[0]?.full_name
        : member.profiles?.full_name;

      const fullName = fullNameRaw ?? "Okänd spelare";

      const { error: upsertError } = await supabase.from("leaderboard").upsert(
        {
          league_id: leagueId,
          user_id: userId,
          full_name: fullName,
          total_points: totalPoints,
        },
        {
          onConflict: "league_id,user_id",
        }
      );

      if (upsertError) throw upsertError;

      updated++;
    }

    const { data: leaderboard, error: leaderboardError } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("league_id", leagueId)
      .order("total_points", { ascending: false });

    if (leaderboardError) throw leaderboardError;

    return jsonResponse({
      success: true,
      leagueId,
      updated,
      leaderboard,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : JSON.stringify(error),
      },
      500
    );
  }
});