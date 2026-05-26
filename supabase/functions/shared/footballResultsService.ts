type ExternalMatch = {
  external_id: string;
  round: string | null;
  group_name: string | null;
  home_team_name: string;
  away_team_name: string;
  home_team_external_id?: string | null;
  away_team_external_id?: string | null;
  kickoff_at: string;
  status: "upcoming" | "live" | "finished" | "postponed" | "cancelled";
  home_goals: number | null;
  away_goals: number | null;
};

function normalizeMatchStatus(statusShort: string): ExternalMatch["status"] {
  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(statusShort)) {
    return "live";
  }

  if (["FT", "AET", "PEN"].includes(statusShort)) {
    return "finished";
  }

  if (["PST"].includes(statusShort)) {
    return "postponed";
  }

  if (["CANC", "ABD", "AWD", "WO"].includes(statusShort)) {
    return "cancelled";
  }

  return "upcoming";
}

export async function fetchWorldCupMatchesFromProvider(): Promise<
  ExternalMatch[]
> {
  const apiKey = Deno.env.get("FOOTBALL_API_KEY");
  const baseUrl = Deno.env.get("FOOTBALL_API_BASE_URL");

  if (!apiKey || !baseUrl) {
    throw new Error("Missing football API environment variables");
  }

  const response = await fetch(
    `${baseUrl}/fixtures?league=1&season=2026`,
    {
      headers: {
        "x-apisports-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Football API HTTP failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`Football API error: ${JSON.stringify(data.errors)}`);
  }

  const fixtures = data.response ?? [];

  return fixtures.map((item: any) => ({
    external_id: String(item.fixture.id),
    round: item.league?.round ?? null,
    group_name: null,
    home_team_name: item.teams?.home?.name,
    away_team_name: item.teams?.away?.name,
    home_team_external_id: item.teams?.home?.id
      ? String(item.teams.home.id)
      : null,
    away_team_external_id: item.teams?.away?.id
      ? String(item.teams.away.id)
      : null,
    kickoff_at: item.fixture?.date,
    status: normalizeMatchStatus(item.fixture?.status?.short),
    home_goals: item.goals?.home ?? null,
    away_goals: item.goals?.away ?? null,
  }));
}

export async function upsertTeam(
  supabase: any,
  teamName: string,
  externalId?: string | null
) {
  if (!teamName) {
    throw new Error("Missing team name");
  }

  if (externalId) {
    const { data: existingByExternalId } = await supabase
      .from("teams")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();

    if (existingByExternalId?.id) return existingByExternalId.id;
  }

  const { data: existingByName } = await supabase
    .from("teams")
    .select("id")
    .eq("name", teamName)
    .maybeSingle();

  if (existingByName?.id) return existingByName.id;

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: teamName,
      external_id: externalId ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;

  return data.id;
}