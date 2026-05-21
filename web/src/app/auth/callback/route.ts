import { resolvePostLoginPath } from "@/lib/authCallback";
import { createRouteHandlerClient } from "@/lib/supabase/routeHandler";
import { verifyMagicLinkOtp } from "@/lib/verifyMagicLinkOtp";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function loginRedirect(
  request: NextRequest,
  params: Record<string, string | undefined>
) {
  const { origin } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = NextResponse.redirect(`${origin}/login${suffix}`);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = resolvePostLoginPath(
    url.searchParams.get("next"),
    url.searchParams.get("redirect_to")
  );

  let response = NextResponse.redirect(`${url.origin}${next}`);
  response.headers.set("Cache-Control", "private, no-store");

  const supabase = createRouteHandlerClient(request, response);

  if (tokenHash && type) {
    const { error } = await verifyMagicLinkOtp(supabase, tokenHash, type);
    if (!error) return response;
    return loginRedirect(request, {
      error: "auth",
      error_code: error.code ?? "verify_failed",
      error_description: error.message,
    });
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
    return loginRedirect(request, {
      error: "auth",
      error_code: error.code ?? "exchange_failed",
      error_description: error.message,
    });
  }

  return loginRedirect(request, { error: "auth", error_code: "missing_token" });
}
