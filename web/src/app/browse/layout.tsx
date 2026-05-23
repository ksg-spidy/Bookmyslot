import { getProfile, getSessionUser } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";

export default async function BrowseLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const profile = user ? await getProfile() : null;

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={Boolean(user)} isAdmin={profile?.role === "admin"} />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
