// Browser UI smoke test of the homepage flow, driving the real React app with
// Playwright/Chromium: register -> login -> dashboard -> join league -> league page.
//
//   npx playwright install chromium           (one-time: download the browser)
//   npm run test:ui                            (tests production)
//   BASE_URL=http://localhost:3000 npm run test:ui
//
// Creates a throwaway user + league via the service role and cleans them up.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const BASE = process.env.BASE_URL || "https://vm-tipset-sage.vercel.app";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const VM2026 = "568e6041-9f4e-42cd-ad62-8e018dc0c2e4";

let pass = 0, fail = 0;
const step = (n, c, d = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); c ? pass++ : fail++; };

const stamp = Date.now();
const email = `zz_ui_${stamp}@example.com`;
const password = `pw_${stamp}!A`;
const code = `ZZUI${stamp}`.slice(0, 10);
const created = {};

console.log(`Target: ${BASE}\n`);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  // Setup an isolated league (real tournament -> has matches) to join.
  const { data: owner } = await admin.auth.admin.createUser({ email: `zz_uiowner_${stamp}@example.com`, password, email_confirm: true });
  created.ownerId = owner.user.id;
  const { data: lg } = await admin.from("leagues").insert({ name: `ZZ_UI_${stamp}`, owner_id: owner.user.id, invite_code: code, tournament_id: VM2026 }).select().single();
  created.leagueId = lg.id;
  await admin.from("league_members").insert({ league_id: lg.id, user_id: owner.user.id, role: "admin" });

  // 1) Homepage loads
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  step("homepage loads (VM-tipset visible)", await page.getByRole("heading", { name: "VM-tipset" }).isVisible());

  // 2) Register
  await page.getByRole("button", { name: "Skapa konto" }).first().click(); // tab
  await page.getByPlaceholder("Fullständigt namn").fill("UI Tester");
  await page.getByPlaceholder("E-post").fill(email);
  await page.getByPlaceholder("Lösenord").fill(password);
  await page.getByRole("button", { name: "Skapa konto" }).last().click(); // submit
  await page.getByText(/Konto skapat/i).waitFor({ timeout: 15000 });
  step("register shows success message", true);

  // 3) Login (mode auto-switched; email/password retained) -> redirect to /dashboard
  await page.getByRole("button", { name: "Logga in" }).last().click();
  await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
  step("login redirects to /dashboard", true, page.url());

  // 4) Dashboard rendered
  await page.getByText(/Prediction Center/i).waitFor({ timeout: 15000 });
  step("dashboard renders (Prediction Center)", true);
  await page.getByText(email).first().waitFor({ timeout: 10000 });
  step("logged-in email shown", true);
  await page.screenshot({ path: "scripts/shot-dashboard.png", fullPage: true });

  // 5) Join league by code
  await page.getByPlaceholder("Invite code").fill(code);
  await page.getByRole("button", { name: "Gå med" }).click();
  await page.waitForURL(/\/dashboard\/league\//, { timeout: 20000 });
  step("join navigates to league page", true, page.url());

  // 6) League page shows the league + leaderboard
  await page.getByRole("heading", { name: `ZZ_UI_${stamp}` }).waitFor({ timeout: 15000 });
  step("league name renders on league page", true);
  step("leaderboard section visible", await page.getByRole("heading", { name: "Leaderboard" }).isVisible());
  await page.screenshot({ path: "scripts/shot-league.png" });

  created.userId = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id;
} catch (e) {
  step("flow completed without error", false, e.message);
  try { await page.screenshot({ path: "ui-flow-failure.png", fullPage: true }); console.log("  (saved ui-flow-failure.png)"); } catch {}
} finally {
  await browser.close();
  console.log("\ncleanup...");
  if (!created.userId) created.userId = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id;
  if (created.leagueId) await admin.from("leagues").delete().eq("id", created.leagueId);
  if (created.userId) await admin.auth.admin.deleteUser(created.userId);
  if (created.ownerId) await admin.auth.admin.deleteUser(created.ownerId);
}
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
