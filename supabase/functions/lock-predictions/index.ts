import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse } from "../shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase.rpc("lock_predictions_for_started_matches");

    if (error) throw error;

    return jsonResponse({
      success: true,
      lockedAt: new Date().toISOString(),
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