"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const PENDING_INVITE_KEY = "vmtipset:pendingInvite";

function normalizeInviteCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

type Status = "joining" | "needs-login" | "not-found" | "error";

export default function JoinLeaguePage() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = normalizeInviteCode((params.code as string) ?? "");

  const [status, setStatus] = useState<Status>("joining");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!inviteCode) {
      setStatus("not-found");
      return;
    }

    joinByInviteCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  async function joinByInviteCode() {
    setStatus("joining");
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Remember where they were headed, then send them to log in.
      window.localStorage.setItem(PENDING_INVITE_KEY, inviteCode);
      setStatus("needs-login");
      router.push("/");
      return;
    }

    // RLS hides leagues you aren't a member of yet, so we join through a
    // SECURITY DEFINER function that looks up the code and adds you. It is
    // idempotent: joining a league you're already in just returns it.
    const { data, error } = await supabase.rpc("join_league_by_code", {
      invite_code_input: inviteCode,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const joined = Array.isArray(data) ? data[0] : data;

    if (!joined?.league_id) {
      setStatus("not-found");
      return;
    }

    router.push(`/dashboard/league/${joined.league_id}`);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,.18),transparent_30%),#0f172a] text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl text-center">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-400">
          Invite
        </p>
        <h1 className="mt-3 text-3xl font-black">Gå med i liga</h1>

        {inviteCode && (
          <p className="mt-4 inline-block rounded-xl bg-emerald-400/10 px-4 py-2 font-black text-emerald-300">
            {inviteCode}
          </p>
        )}

        {status === "joining" && (
          <p className="mt-6 text-slate-300">Ansluter dig till ligan...</p>
        )}

        {status === "needs-login" && (
          <p className="mt-6 text-slate-300">
            Du måste logga in först. Skickar dig till inloggningen...
          </p>
        )}

        {status === "not-found" && (
          <div className="mt-6 space-y-4">
            <p className="text-slate-300">
              Vi hittade ingen liga med den här koden.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-xl bg-emerald-500 px-5 py-3 font-black text-white hover:bg-emerald-400"
            >
              Till dashboard
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl bg-red-500/10 border border-red-400/30 px-4 py-3 text-red-200">
              {message}
            </p>
            <button
              type="button"
              onClick={joinByInviteCode}
              className="rounded-xl bg-emerald-500 px-5 py-3 font-black text-white hover:bg-emerald-400"
            >
              Försök igen
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
