import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  if (!user && request.nextUrl.pathname.startsWith("/sessions")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const returnPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set("next", returnPath);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/sessions/:path*"],
};
