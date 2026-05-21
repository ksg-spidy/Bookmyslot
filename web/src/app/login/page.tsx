import { getProfile, getSessionUser } from "@/lib/auth";
import { safeInternalPath } from "@/lib/safeNextPath";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile();
    const next = safeInternalPath(sp.next);
    if (next) redirect(next);
    if (profile?.role === "admin") redirect("/admin");
    redirect("/sessions");
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-[#8b949e]">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
