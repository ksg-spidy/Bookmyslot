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
      <label htmlFor="profile-full-name" className="text-xs uppercase text-muted">
        Display name
      </label>
      <input
        id="profile-full-name"
        name="full_name"
        defaultValue={defaultName}
        className="rounded-lg border border-edge bg-card px-3 py-2 text-white outline-none focus:border-link"
        placeholder="Alex Chen"
        autoComplete="name"
      />

      <label htmlFor="profile-phone" className="text-xs uppercase text-muted">
        Phone
      </label>
      <input
        id="profile-phone"
        name="phone"
        type="tel"
        defaultValue={defaultPhone}
        className="rounded-lg border border-edge bg-card px-3 py-2 text-white outline-none focus:border-link"
        placeholder="04xx xxx xxx"
        autoComplete="tel"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>

      {state?.error ? (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-success" role="status">
          Saved.
        </p>
      ) : null}
    </form>
  );
}
