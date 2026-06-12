"use client";

import { PROMOTION_CONFIRMED_MESSAGE } from "@/lib/copy/bookingCopy";
import { useEffect, useState } from "react";

const DISMISS_DAYS = 14;

function dismissKey(bookingId: string) {
  return `shuttlebook_promo_dismiss_${bookingId}`;
}

export function PromotionBanner({
  bookingId,
  promotedAt,
}: {
  bookingId: string;
  promotedAt: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const promoted = new Date(promotedAt);
    const ageMs = Date.now() - promoted.getTime();
    if (ageMs > DISMISS_DAYS * 24 * 60 * 60 * 1000) {
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(dismissKey(bookingId))) {
      return;
    }
    setVisible(true);
  }, [bookingId, promotedAt]);

  if (!visible) return null;

  return (
    <div
      className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-accent bg-success-soft p-3 text-sm text-success"
      role="status"
    >
      <p>
        <strong>ShuttleBook:</strong> {PROMOTION_CONFIRMED_MESSAGE}
      </p>
      <button
        type="button"
        className="shrink-0 text-xs text-muted hover:text-white"
        onClick={() => {
          localStorage.setItem(dismissKey(bookingId), "1");
          setVisible(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
