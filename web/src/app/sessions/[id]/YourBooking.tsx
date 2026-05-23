"use client";

import { BookButton } from "@/app/sessions/[id]/BookButton";
import { WithdrawButton } from "@/app/sessions/[id]/WithdrawButton";
import { syncBookingAfterPayment } from "@/app/actions/syncBooking";
import { getActiveBookingForUser } from "@/lib/bookings/queries";
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
    }
  }, [booking]);

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
        setSyncError(res.error);
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
        <p className="text-sm text-white">
          Status: <strong className="capitalize">{active.status}</strong>
          {active.status === "waitlist" && active.waitlist_position != null
            ? ` (queue #${active.waitlist_position})`
            : null}
        </p>
        {active.status === "waitlist" ? (
          <p className="mt-2 text-xs text-[#8b949e]">
            You are on the waitlist. If someone cancels, the next person is moved to confirmed
            automatically.
          </p>
        ) : null}
        <WithdrawButton
          sessionId={sessionId}
          bookingFeeCents={bookingFeeCents}
          withdrawalFeeCents={withdrawalFeeCents}
          canWithdraw={canWithdraw}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-[#8b949e]">
          Confirming your booking… this usually takes a few seconds.
        </p>
        {syncError ? (
          <>
            <p className="text-red-400">
              Could not save yet ({syncError}). Retrying… or use the button below.
            </p>
            <button
              type="button"
              className="text-[#58a6ff] hover:underline"
              onClick={() => {
                void syncBookingAfterPayment(sessionId, stripeCheckoutSessionId).then((res) => {
                  if (res.synced) {
                    setSyncError(null);
                    router.refresh();
                  } else if (res.error) {
                    setSyncError(res.error);
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
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-red-400">
          Payment was received but the booking could not be saved ({syncError}). Try refresh, or
          contact the organiser with your payment confirmation.
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
        <BookButton sessionId={sessionId} />
      </div>
    );
  }

  return <p className="mt-3 text-sm text-[#8b949e]">Booking is not open for this session.</p>;
}
