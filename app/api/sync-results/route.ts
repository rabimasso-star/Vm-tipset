import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ApiFixture = {
  fixture: {
    id: number;
    status: {
      short: string;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
};

function mapStatus(apiStatus: string) {
  if (["FT", "AET", "PEN"].includes(apiStatus)) return "finished";
  if (["1H", "2H", "HT", "ET", "P"].includes(apiStatus)) return "live";
  if (["PST"].includes(apiStatus)) return "postponed";
  if (["CANC", "ABD"].includes(apiStatus)) return "cancelled";
  return "upcoming";
}

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  const leagueId = process.env.API_FOOTBALL_WORLD_CUP_LEAGUE_ID;
  const season = process.env.API_FOOTBALL_SEASON;

  if (!apiKey || !leagueId || !season) {
    return NextResponse.json(
      { error: "Missing API_FOOTBALL env variables" },
      { status: 500 }
    );
  }

  const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`;

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  const json = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: json }, { status: 500 });
  }

  const fixtures: ApiFixture[] = json.response ?? [];

  let updated = 0;
  const errors: string[] = [];

  for (const fixture of fixtures) {
    const fixtureId = String(fixture.fixture.id);
    const status = mapStatus(fixture.fixture.status.short);

    const { error } = await supabase
      .from("matches")
      .update({
        status,
        home_goals: fixture.goals.home,
        away_goals: fixture.goals.away,
      })
      .eq("external_id", fixtureId);

    if (error) {
      errors.push(`${fixtureId}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    success: true,
    fixtures: fixtures.length,
    updated,
    errors,
  });
}