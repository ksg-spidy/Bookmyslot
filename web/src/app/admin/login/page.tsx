"use client";

import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/safeNextPath";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function AdminLoginInner() {
  const searchParams = useSearchParams();
  const nextPath = safeInternalPath(searchParams.get("next")) ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("signing");
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      await supabase.auth.signOut();
      setStatus("error");
      setMessage("This account is not an admin. Use player sign-in for bookings.");
      return;
    }

    window.location.href = nextPath;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold text-white">ShuttleBook Admin</h1>
      <p className="mb-6 text-sm text-[#8b949e]">Sign in with your admin email and password.</p>
      <form onSubmit={signIn} className="flex flex-col gap-3">
        <label className="text-xs uppercase tracking-wide text-[#8b949e]">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]"
          placeholder="admin@example.com"
          autoComplete="email"
        />
        <label className="text-xs uppercase tracking-wide text-[#8b949e]">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]"
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={status === "signing"}
          className="rounded-lg bg-[#238636] py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
        >
          {status === "signing" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {message ? (
        <p className="mt-4 text-sm text-red-400" role="status">
          {message}
        </p>
      ) : null}
      <p className="mt-6 text-center text-sm text-[#8b949e]">
        <Link href="/login" className="text-[#58a6ff] hover:underline">
          Player sign-in (magic link)
        </Link>
      </p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-[#8b949e]">
          Loading…
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}
