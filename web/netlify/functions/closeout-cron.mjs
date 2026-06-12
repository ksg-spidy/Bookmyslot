// Netlify scheduled function: hourly closeout sweep.
// Calls POST /api/cron/closeout on this site so all logic stays in the Next.js
// app (one code path for cron + admin button). Requires CRON_SECRET to be set
// in the Netlify environment (same value the route checks).

export default async () => {
  const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;

  if (!siteUrl || !secret) {
    console.error("closeout-cron: missing URL or CRON_SECRET env");
    return new Response("Misconfigured", { status: 500 });
  }

  const res = await fetch(`${siteUrl.replace(/\/$/, "")}/api/cron/closeout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await res.text();
  if (!res.ok) {
    console.error("closeout-cron: sweep failed", res.status, body);
    return new Response(body, { status: 500 });
  }

  console.log("closeout-cron: sweep ok", body);
  return new Response(body, { status: 200 });
};

export const config = {
  schedule: "@hourly",
};
