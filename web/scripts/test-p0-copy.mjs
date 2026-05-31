/**
 * Smoke tests for P0/P1 helpers (no DB). Run: node scripts/test-p0-copy.mjs
 */
import assert from "node:assert/strict";

// Inline copies of pure logic to avoid TS import in .mjs
function parseWaCommand(raw) {
  const parts = raw.trim().split(/\s+/);
  const base = parts[0] ?? "";
  const num = parts[1] ? Number.parseInt(parts[1], 10) : NaN;
  return { base, index: Number.isFinite(num) && num > 0 ? num : null };
}

function parseCommand(cmd) {
  if (cmd.startsWith("WITHDRAW_YES:")) {
    return { base: "WITHDRAW_YES", index: null, withdrawSessionId: cmd.slice("WITHDRAW_YES:".length).trim() };
  }
  const { base, index } = parseWaCommand(cmd);
  return { base, index, withdrawSessionId: null };
}

function getCheckoutButtonLabel(spotsRemaining, bookingFeeCents) {
  const fee = `$${(bookingFeeCents / 100).toFixed(2)}`;
  if (spotsRemaining <= 0) return `Join waitlist — pay ${fee}`;
  return `Pay & book — ${fee}`;
}

function humanizeSyncError(code) {
  const MESSAGES = {
    checkout_not_ready: "Still confirming your payment with the bank — please wait a moment.",
    payment_not_completed: "Payment has not completed yet. Wait a few seconds and try again.",
  };
  if (MESSAGES[code]) return MESSAGES[code];
  if (code?.startsWith("insert_failed")) return "Could not save your booking. Contact the organiser with your payment receipt.";
  return "Could not save your booking. Try again or contact the organiser.";
}

// parseWaCommand
assert.deepEqual(parseWaCommand("BOOK"), { base: "BOOK", index: null });
assert.deepEqual(parseWaCommand("BOOK 2"), { base: "BOOK", index: 2 });
assert.deepEqual(parseWaCommand("STATUS 1"), { base: "STATUS", index: 1 });

// parseCommand WITHDRAW_YES
assert.deepEqual(parseCommand("WITHDRAW_YES:abc-uuid"), {
  base: "WITHDRAW_YES",
  index: null,
  withdrawSessionId: "abc-uuid",
});

// checkout labels
assert.equal(getCheckoutButtonLabel(3, 2400), "Pay & book — $24.00");
assert.equal(getCheckoutButtonLabel(0, 1500), "Join waitlist — pay $15.00");

// sync errors - no raw codes exposed
const friendly = humanizeSyncError("checkout_not_ready");
assert.ok(!friendly.includes("checkout_not_ready"));

console.log("All smoke tests passed.");
