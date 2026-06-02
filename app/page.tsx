"use client";

import { useState } from "react";
import { supabase } from "./lib/supabaseClient";

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");

  async function createProfile(userId: string, name: string, email: string) {
    await supabase.from("profiles").upsert({
      id: userId,
      full_name: name,
      email,
    });
  }

  async function handleSubmit() {
    setMessage("");

    if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.user) {
        await createProfile(data.user.id, fullName, email);
      }

      setMessage("Konto skapat! Du kan nu logga in.");
      setMode("login");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    // If they arrived via an invite link while logged out, send them back to it.
    const pendingInvite = window.localStorage.getItem("vmtipset:pendingInvite");

    if (pendingInvite) {
      window.localStorage.removeItem("vmtipset:pendingInvite");
      window.location.href = `/join/${pendingInvite}`;
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="min-h-screen text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900/60 border border-white/10 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-400">
          VM 2026
        </p>
        <h1 className="text-3xl font-black mt-2 mb-2">VM-tipset</h1>
        <p className="text-slate-300 mb-6">
          Logga in eller skapa konto för att börja tippa.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-xl py-2 font-bold ${
              mode === "login" ? "bg-white text-slate-950" : "bg-white/10"
            }`}
          >
            Logga in
          </button>

          <button
            onClick={() => setMode("register")}
            className={`flex-1 rounded-xl py-2 font-bold ${
              mode === "register" ? "bg-white text-slate-950" : "bg-white/10"
            }`}
          >
            Skapa konto
          </button>
        </div>

        {mode === "register" && (
          <input
            className="w-full mb-3 rounded-xl bg-slate-900 border border-white/10 px-4 py-3"
            placeholder="Fullständigt namn"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          className="w-full mb-3 rounded-xl bg-slate-900 border border-white/10 px-4 py-3"
          placeholder="E-post"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-4 rounded-xl bg-slate-900 border border-white/10 px-4 py-3"
          placeholder="Lösenord"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          className="w-full rounded-xl bg-emerald-500 py-3 font-black"
        >
          {mode === "login" ? "Logga in" : "Skapa konto"}
        </button>

        {message && (
          <div className="mt-4 rounded-xl bg-slate-900 p-3">{message}</div>
        )}
      </div>
    </main>
  );
}