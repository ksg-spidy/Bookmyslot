"use client";

import { createPlaySession } from "@/app/actions/sessions";
import { useActionState } from "react";

type State = { error?: string; ok?: boolean };

const initial: State = {};

const inp =
  "rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]";

export function AdminSessionForm({ timezoneLabel }: { timezoneLabel: string }) {
  const [state, formAction, pending] = useActionState(async (_prev: State, formData: FormData) => {
    const res = await createPlaySession(formData);
    if ("error" in res && res.error) {
      return { error: res.error, ok: false };
    }
    return { error: undefined, ok: true };
  }, initial);

  return (
    <form action={formAction} className="mt-4 grid max-w-xl gap-3">
      <label className="text-xs uppercase text-[#8b949e]">Title</label>
      <input name="title" defaultValue="Saturday session" className={inp} required />

      <label className="text-xs uppercase text-[#8b949e]">Venue</label>
      <input name="venue" placeholder="Northside Sports Hall" className={inp} required />

      <p className="text-xs text-[#8b949e]">
        Enter start, end, and booking-close times in your club&apos;s local time ({timezoneLabel}).
      </p>

      <label className="text-xs uppercase text-[#8b949e]">Starts (local)</label>
      <input name="starts_at" type="datetime-local" className={inp} required />

      <label className="text-xs uppercase text-[#8b949e]">Ends (local)</label>
      <input name="ends_at" type="datetime-local" className={inp} required />

      <label className="text-xs uppercase text-[#8b949e]">Booking closes (local)</label>
      <input name="booking_closes_at" type="datetime-local" className={inp} required />

      <p className="text-xs text-[#8b949e]">
        Capacity is based on booking codes/courts. Example: 1 code with 6 players allows
        6 confirmed players and 3 waitlist places.
      </p>

      <label className="text-xs uppercase text-[#8b949e]">Booking codes / courts</label>
      <input
        name="booking_code_count"
        type="number"
        min={1}
        max={50}
        defaultValue={1}
        className={inp}
        required
      />

      <label className="text-xs uppercase text-[#8b949e]">Players per code</label>
      <input
        name="players_per_booking_code"
        type="number"
        min={1}
        max={32}
        defaultValue={6}
        className={inp}
        required
      />

      <label className="text-xs uppercase text-[#8b949e]">Waitlist per code</label>
      <input
        name="waitlist_per_booking_code"
        type="number"
        min={0}
        max={32}
        defaultValue={3}
        className={inp}
        required
      />

      <label className="text-xs uppercase text-[#8b949e]">Booking fee (AUD)</label>
      <input
        name="booking_fee_aud"
        type="text"
        inputMode="decimal"
        defaultValue="15.00"
        className={inp}
        required
      />

      <label className="text-xs uppercase text-[#8b949e]">Cancellation fee (AUD)</label>
      <input
        name="withdrawal_fee_aud"
        type="text"
        inputMode="decimal"
        defaultValue="2.00"
        className={inp}
        required
      />

      {state?.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-[#3fb950]">Session created.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-[#238636] px-4 py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create session"}
      </button>
    </form>
  );
}
