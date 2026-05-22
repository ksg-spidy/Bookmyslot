"use client";

import { BookButton } from "@/app/sessions/[id]/BookButton";
import { syncBookingAfterPayment } from "@/app/actions/syncBooking";
import { createClient } from "@/lib/supabase/client";
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
}: {
  sessionId: string;
  open: boolean;
  booking: Booking | null;
  justPaid: boolean;
  stripeCheckoutSessionId?: string;
}) {
  const router = useRouter();
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking);
  const [confirming, setConfirming] = useState(justPaid && !booking);

  useEffect(() => {
    setLocalBooking(booking);
    if (booking) {
      setConfirming(false);
    }
  }, [booking]);

  useEffect(() => {
    if (!justPaid || localBooking) {
      return;
    }

    let cancelled = false;

    async function trySync() {
      await syncBookingAfterPayment(sessionId, stripeCheckoutSessionId);
      if (!cancelled) {
        router.refresh();
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

      const { data } = await supabase
        .from("bookings")
        .select("status, waitlist_position")
        .eq("play_session_id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !cancelled) {
        setLocalBooking(data);
        setConfirming(false);
        router.refresh();
      }
    }

    void trySync();
    const interval = window.setInterval(() => {
      void pollForBooking();
    }, 2000);

    const stop = window.setTimeout(() => {
      cancelled = true;
      window.clearInterval(interval);
      setConfirming(false);
    }, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [justPaid, localBooking, sessionId, stripeCheckoutSessionId, router]);

  const active = localBooking ?? booking;

  if (active) {
    return (
      <p className="mt-2 text-sm text-white">
        Status: <strong className="capitalize">{active.status}</strong>
        {active.status === "waitlist" && active.waitlist_position != null
          ? ` (queue #${active.waitlist_position})`
          : null}
      </p>
    );
  }

  if (confirming) {
    return (
      <p className="mt-3 text-sm text-[#8b949e]">
        Confirming your booking… this usually takes a few seconds.
      </p>
    );
  }

  if (open) {
    return (
      <div className="mt-3">
        <BookButton sessionId={sessionId} />
      </div>
    );
  }

  return <p className="mt-3 text-sm text-[#8b949e]">Booking is not open for this session.</p>;
}
