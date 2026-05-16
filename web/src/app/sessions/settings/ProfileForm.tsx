"use client";

import { updateProfile, type ProfileState } from "@/app/actions/profile";
import { useActionState } from "react";

const initial: ProfileState = {};

export function ProfileForm({
  defaultName,
  defaultPhone,
}: {
  defaultName: string;
  defaultPhone: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ProfileState, formData: FormData) => {
      return await updateProfile(formData);
    },
    initial
  );

  return (
    <form action={formAction} className="mt-4 grid max-w-md gap-3">
      <label className="text-xs uppercase text-[#8b949e]">Display name</label>
      <input
        name="full_name"
        defaultValue={defaultName}
        className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]"
        placeholder="Alex Chen"
        autoComplete="name"
      />

      <label className="text-xs uppercase text-[#8b949e]">Phone</label>
      <input
        name="phone"
        defaultValue={defaultPhone}
        className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-white outline-none focus:border-[#58a6ff]"
        placeholder="04xx xxx xxx"
        autoComplete="tel"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-[#238636] px-4 py-2 font-medium text-white hover:bg-[#2ea043] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>

      {state?.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-[#3fb950]">Saved.</p> : null}
    </form>
  );
}
