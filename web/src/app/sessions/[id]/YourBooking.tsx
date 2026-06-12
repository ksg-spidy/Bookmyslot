"use client";

import { BookButton } from "@/app/sessions/[id]/BookButton";
import { WithdrawButton } from "@/app/sessions/[id]/WithdrawButton";
import { syncBookingAfterPayment } from "@/app/actions/syncBooking";
import { getActiveBookingForUser } from "@/lib/bookings/queries";
import {
  formatWaitlistPosition,
  paymentSuccessStatusLabel,
  WAITLIST_AFTER_BOOK_MESSAGE,
} from "@/lib/copy/bookingCopy";
import { humanizeSyncError } from "@/lib/bookings/syncErrorMessages";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Booking = {
  status: string;
  waitlist_position: number | null;
};

export function YourBooking({
  sessionId,
  open,
  booking,
  justPaid,
  stripeCheckoutSessionId,
  profileComplete,
  bookingFeeCents,
  withdrawalFeeCents,
  canWithdraw,
  spotsRemaining,
  waitlistCount,
}: {
  sessionId: string;
  open: boolean;
  booking: Booking | null;
  justPaid: boolean;
  stripeCheckoutSessionId?: string;
  profileComplete: boolean;
  bookingFeeCents: number;
  withdrawalFeeCents: number;
  canWithdraw: boolean;
  spotsRemaining: number;
  waitlistCount: number;
}) {
  const router = useRouter();
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking);
  const [confirming, setConfirming] = useState(justPaid && !booking);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setLocalBooking(booking);
    if (booking) {
      setConfirming(false);
      setSyncError(null);
      if (justPaid) {
        router.replace(`/sessions/${sessionId}`, { scroll: false });
      }
    }
  }, [booking, justPaid, router, sessionId]);

  useEffect(() => {
    if (!justPaid || localBooking) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    async function runSync() {
      const res = await syncBookingAfterPayment(sessionId, stripeCheckoutSessionId);
      if (cancelled) return;
      if (res.synced) {
        setSyncError(null);
        router.refresh();
        return;
      }
      if (res.error) {
        setSyncError(humanizeSyncError(res.error));
      }
    }

    async function pollForBooking() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        return;
      }

      const data = await getActiveBookingForUser(supabase, sessionId, user.id);

      if (data && !cancelled) {
        setLocalBooking(data);
        setConfirming(false);
        setSyncError(null);
        router.refresh();
      }
    }

    void runSync();
    const interval = window.setInterval(() => {
      attempts += 1;
      void runSync();
      void pollForBooking();
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        setConfirming(false);
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [justPaid, localBooking, sessionId, stripeCheckoutSessionId, router]);

  const active = localBooking ?? booking;

  if (active) {
    return (
      <div className="mt-2">
        {justPaid ? (
          <p
            className="mb-2 rounded-lg border border-[#238636] bg-[#0c2218] p-3 text-sm text-[#3fb950]"
            role="status"
          >
            Payment received — you are{" "}
            <strong>{paymentSuccessStatusLabel(active.status, active.waitlist_position)}</strong>.
          </p>
        ) : null}
        <p className="text-sm text-white">
          Status:{" "}
          <strong className="capitalize">
            {active.status === "waitlist"
              ? formatWaitlistPosition(active.waitlist_position) ?? "Waitlisted"
              : active.status}
          </strong>
        </p>
        {active.status === "waitlist" ? (
          <p className="mt-2 text-xs text-[#8b949e]">{WAITLIST_AFTER_BOOK_MESSAGE}</p>
        ) : null}
        <WithdrawButton
          sessionId={sessionId}
          bookingFeeCents={bookingFeeCents}
          withdrawalFeeCents={withdrawalFeeCents}
          canWithdraw={canWithdraw}
          isWaitlist={active.status === "waitlist"}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="mt-3 space-y-2 text-sm" role="status" aria-live="polite">
        <p className="rounded-lg border border-[#238636] bg-[#0c2218] p-3 text-[#3fb950]">
          Payment received — saving your booking now. This usually takes a few seconds.
        </p>
        {syncError ? (
          <>
            <p className="text-red-400">{syncError}</p>
            <button
              type="button"
              className="text-[#58a6ff] hover:underline"
              onClick={() => {
                void syncBookingAfterPayment(sessionId, stripeCheckoutSessionId).then((res) => {
                  if (res.synced) {
                    setSyncError(null);
                    router.refresh();
                  } else if (res.error) {
                    setSyncError(humanizeSyncError(res.error));
                  }
                });
              }}
            >
              Retry save booking
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (justPaid && syncError) {
    return (
      <div className="mt-3 space-y-2 text-sm" role="alert">
        <p className="text-red-400">
          Payment was received but the booking could not be saved. {syncError}
        </p>
        <button
          type="button"
          className="text-[#58a6ff] hover:underline"
          onClick={() => {
            setConfirming(true);
            setSyncError(null);
            void syncBookingAfterPayment(sessionId, stripeCheckoutSessionId).then(() =>
              router.refresh()
            );
          }}
        >
          Retry save booking
        </button>
      </div>
    );
  }

  if (open) {
    if (!profileComplete) {
      return (
        <p className="mt-3 text-sm text-[#8b949e]">
          Complete your{" "}
          <Link href="/sessions/settings" className="text-[#58a6ff] hover:underline">
            profile
          </Link>{" "}
          to enable booking.
        </p>
      );
    }
    return (
      <div className="mt-3">
        <BookButton
          sessionId={sessionId}
          spotsRemaining={spotsRemaining}
          bookingFeeCents={bookingFeeCents}
          waitlistCount={waitlistCount}
        />
      </div>
    );
  }

  return <p className="mt-3 text-sm text-[#8b949e]">Booking is not open for this session.</p>;
}
