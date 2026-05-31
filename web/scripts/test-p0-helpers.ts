/**
 * Unit tests for bookingCopy + sessionCommands pure helpers.
 * Run from web/: npx tsx scripts/test-p0-helpers.ts
 */
import assert from "node:assert/strict";
import {
  buildBookingConfirmationEmailStatusLine,
  buildWhatsAppBookingConfirmationBody,
  formatAudShort,
  formatWaitlistPosition,
  getBrowseGuestCtaLabel,
  getCheckoutButtonLabel,
  getWhatsAppPayButtonLabel,
  paymentSuccessStatusLabel,
  PROMOTION_CONFIRMED_MESSAGE,
  withdrawSuccessMessage,
} from "../src/lib/copy/bookingCopy";
import { humanizeSyncError } from "../src/lib/bookings/syncErrorMessages";
import {
  humanizeFulfillReason,
  isMyBookingsCommand,
  openSessionListIndex,
  parseCommand,
  parseWaCommand,
} from "../src/lib/whatsapp/sessionCommands";

const SITE = process.env.NEXT_PUBLIC_SITE_URL;
process.env.NEXT_PUBLIC_SITE_URL = SITE ?? "http://localhost:3000";

// parseWaCommand
assert.deepEqual(parseWaCommand("BOOK"), { base: "BOOK", index: null });
assert.deepEqual(parseWaCommand("BOOK 2"), { base: "BOOK", index: 2 });
assert.deepEqual(parseWaCommand("STATUS 1"), { base: "STATUS", index: 1 });
assert.deepEqual(parseWaCommand("BOOK abc"), { base: "BOOK", index: null });

// parseCommand
assert.deepEqual(parseCommand("WITHDRAW_YES:abc-uuid"), {
  base: "WITHDRAW_YES",
  index: null,
  withdrawSessionId: "abc-uuid",
});
assert.deepEqual(parseCommand("WITHDRAW 2"), {
  base: "WITHDRAW",
  index: 2,
  withdrawSessionId: null,
});

// MY bookings command
assert.equal(isMyBookingsCommand("MY"), true);
assert.equal(isMyBookingsCommand("my bookings"), true);
assert.equal(isMyBookingsCommand("MY BOOKINGS"), true);
assert.equal(isMyBookingsCommand("BOOK"), false);

// openSessionListIndex
const sessions = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
] as Parameters<typeof openSessionListIndex>[0];
assert.equal(openSessionListIndex(sessions, "b"), 2);
assert.equal(openSessionListIndex(sessions, "missing"), undefined);

// bookingCopy
assert.equal(formatWaitlistPosition(3), "Waitlist #3");
assert.equal(formatWaitlistPosition(null), null);
assert.equal(paymentSuccessStatusLabel("waitlist", 2), "waitlist #2");
assert.equal(paymentSuccessStatusLabel("confirmed", null), "confirmed");

assert.equal(getCheckoutButtonLabel({ spotsRemaining: 3, bookingFeeCents: 2400 }), "Pay & book — $24.00");
assert.equal(
  getCheckoutButtonLabel({ spotsRemaining: 0, bookingFeeCents: 1500 }),
  "Join waitlist — pay $15.00"
);
assert.equal(
  getBrowseGuestCtaLabel({ spotsRemaining: 0, bookingFeeCents: 1200 }),
  "Sign in — join waitlist ($12.00)"
);

assert.equal(formatAudShort(1500), "$15");
assert.equal(formatAudShort(2450), "$24.50");
assert.equal(getWhatsAppPayButtonLabel(false, 2400), "Pay $24");
assert.equal(getWhatsAppPayButtonLabel(true, 150000), "Waitlist $1500".slice(0, 20));

const waBody = buildWhatsAppBookingConfirmationBody({
  title: "Friday Night",
  venue: "Court 1",
  when: "Fri 7pm",
  status: "waitlist",
  waitlistPosition: 2,
  playSessionId: "sess-1",
});
assert.ok(waBody.includes("Waitlist #2"));
assert.ok(waBody.includes("notify you in WhatsApp"));

assert.equal(
  buildBookingConfirmationEmailStatusLine("waitlist", 1),
  "Waitlist #1. We will email you when you are confirmed."
);
assert.ok(PROMOTION_CONFIRMED_MESSAGE.includes("confirmed"));
assert.ok(withdrawSuccessMessage(2000, 500).includes("$20.00"));

// humanize errors — no raw codes in user text
const syncMsg = humanizeSyncError("checkout_not_ready");
assert.ok(!syncMsg.includes("checkout_not_ready"));
assert.equal(humanizeFulfillReason("payment_not_completed"), "Payment has not completed yet.");
assert.ok(humanizeFulfillReason("play_session_unavailable:closed").includes("no longer accepting"));

console.log("All helper tests passed.");
