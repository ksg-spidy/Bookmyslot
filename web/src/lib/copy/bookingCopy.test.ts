import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWhatsAppBookingConfirmationBody,
  formatAudShort,
  formatWaitlistPosition,
  getWaitlistCheckoutHint,
  getWhatsAppPayButtonLabel,
  paymentSuccessStatusLabel,
  refundPolicyUrl,
  withdrawSuccessMessage,
} from "./bookingCopy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withdrawSuccessMessage", () => {
  it("mentions the withdrawal fee for confirmed withdrawals", () => {
    const msg = withdrawSuccessMessage(1300, 200);
    expect(msg).toContain("$2.00 withdrawal fee");
    expect(msg).toContain("$13.00");
  });

  it("says full refund when there is no fee (waitlist withdrawals)", () => {
    const msg = withdrawSuccessMessage(1500, 0);
    expect(msg).toContain("$15.00");
    expect(msg).toContain("refunded in full");
    expect(msg).not.toContain("withdrawal fee was kept");
  });
});

describe("formatWaitlistPosition", () => {
  it("formats a position", () => {
    expect(formatWaitlistPosition(3)).toBe("Waitlist #3");
  });

  it("returns null for missing positions", () => {
    expect(formatWaitlistPosition(null)).toBeNull();
    expect(formatWaitlistPosition(undefined)).toBeNull();
  });
});

describe("paymentSuccessStatusLabel", () => {
  it("lowercases the waitlist label", () => {
    expect(paymentSuccessStatusLabel("waitlist", 2)).toBe("waitlist #2");
  });

  it("falls back to 'waitlisted' without a position", () => {
    expect(paymentSuccessStatusLabel("waitlist", null)).toBe("waitlisted");
  });

  it("passes other statuses through", () => {
    expect(paymentSuccessStatusLabel("confirmed", null)).toBe("confirmed");
  });
});

describe("formatAudShort", () => {
  it("drops cents for whole dollars", () => {
    expect(formatAudShort(1500)).toBe("$15");
  });

  it("keeps cents otherwise", () => {
    expect(formatAudShort(1550)).toBe("$15.50");
  });
});

describe("getWhatsAppPayButtonLabel", () => {
  it("stays within Meta's 20-character button limit", () => {
    for (const full of [true, false]) {
      for (const fee of [500, 1500, 123456]) {
        expect(getWhatsAppPayButtonLabel(full, fee).length).toBeLessThanOrEqual(20);
      }
    }
  });

  it("labels waitlist vs direct booking", () => {
    expect(getWhatsAppPayButtonLabel(true, 1500)).toBe("Waitlist $15");
    expect(getWhatsAppPayButtonLabel(false, 1500)).toBe("Pay $15");
  });
});

describe("getWaitlistCheckoutHint", () => {
  it("includes queue length and fee", () => {
    const hint = getWaitlistCheckoutHint(3, 1500);
    expect(hint).toContain("3 already on the waitlist");
    expect(hint).toContain("$15.00");
  });

  it("omits the queue when empty", () => {
    expect(getWaitlistCheckoutHint(0, 1500)).not.toContain("already on the waitlist");
  });
});

describe("refundPolicyUrl", () => {
  it("uses the configured site url", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    expect(refundPolicyUrl()).toBe("https://example.com/refund");
  });

  it("falls back to a relative path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(refundPolicyUrl()).toBe("/refund");
  });
});

describe("buildWhatsAppBookingConfirmationBody", () => {
  const base = {
    title: "Saturday session",
    venue: "Alpha Stadium",
    when: "Sat, 4 Apr 2026, 7:00 pm",
    playSessionId: "00000000-0000-0000-0000-000000000000",
  };

  it("confirms a booked player", () => {
    const body = buildWhatsAppBookingConfirmationBody({
      ...base,
      status: "confirmed",
      waitlistPosition: null,
    });
    expect(body).toContain("you are confirmed for Saturday session");
    expect(body).toContain("Payment received");
  });

  it("tells waitlisted players their position", () => {
    const body = buildWhatsAppBookingConfirmationBody({
      ...base,
      status: "waitlist",
      waitlistPosition: 2,
    });
    expect(body).toContain("Waitlist #2");
    expect(body).toContain("we will notify you in WhatsApp");
  });
});
