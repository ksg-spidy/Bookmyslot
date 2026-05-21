import assert from "node:assert/strict";
import test from "node:test";

// Mirror safeInternalPath / resolvePostLoginPath / getSiteOrigin without TS compile step
function safeInternalPath(next) {
  if (!next || typeof next !== "string") return null;
  const t = next.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  return t;
}

function resolvePostLoginPath(next, redirectTo) {
  const direct = safeInternalPath(next);
  if (direct) return direct;
  if (!redirectTo) return "/";
  try {
    const nested = new URL(redirectTo);
    return safeInternalPath(nested.searchParams.get("next")) ?? "/";
  } catch {
    return "/";
  }
}

function getSiteOrigin(browserOrigin, envUrl) {
  const configured = envUrl?.replace(/\/$/, "");
  if (configured) return configured;
  if (browserOrigin) return browserOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}

test("resolvePostLoginPath prefers next query", () => {
  assert.equal(resolvePostLoginPath("/sessions", null), "/sessions");
});

test("resolvePostLoginPath reads next from redirect_to", () => {
  const redirectTo = "https://bookbadmintonslot.netlify.app/auth/confirm?next=%2Fsessions%2Fabc";
  assert.equal(resolvePostLoginPath(null, redirectTo), "/sessions/abc");
});

test("resolvePostLoginPath rejects open redirects", () => {
  assert.equal(resolvePostLoginPath("https://evil.test", null), "/");
  assert.equal(resolvePostLoginPath(null, null), "/");
});

test("getSiteOrigin uses NEXT_PUBLIC_SITE_URL when set", () => {
  assert.equal(
    getSiteOrigin("https://preview.netlify.app", "https://bookbadmintonslot.netlify.app"),
    "https://bookbadmintonslot.netlify.app"
  );
});
