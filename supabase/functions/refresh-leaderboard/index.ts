import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse } from "../shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .limit(10);

    if (error) {
      return jsonResponse({
        success: false,
        dbError: error.message,
      });
    }

    return jsonResponse({
      success: true,
      leaderboard: data,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      realError: error instanceof Error ? error.message : String(error),
    });
  }
});