"use client";

import { formatAud } from "@/lib/money";
import { useState } from "react";

type ReconcileDrift = {
  bookingId: string;
  kind: "charge" | "refund";
  stripeCents: number;
  ledgerCents: number;
  detail: string;
};

type ReconcileResponse = {
  stripe: { grossCents: number; feesCents: number; refundedCents: number; netCents: number };
  ledger: { chargedCents: number; refundedCents: number; netCents: number };
  drift: ReconcileDrift[];
  bookingsChecked: number;
};

export function ReconcileButton({ playSessionId }: { playSessionId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResponse | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/sessions/${playSessionId}/reconcile`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Reconcile failed.");
      } else {
        setResult(body as ReconcileResponse);
      }
    } catch {
      setError("Reconcile request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => void onClick()}
        className="rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-white hover:border-link disabled:opacity-60"
      >
        {pending ? "Reconciling…" : "Reconcile with Stripe"}
      </button>

      {error ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-edge bg-card p-4 text-sm">
          <p className="text-muted">
            Checked {result.bookingsChecked} booking(s) against Stripe.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Stripe</p>
              <p className="text-white">
                Gross {formatAud(result.stripe.grossCents)} · refunds{" "}
                {formatAud(result.stripe.refundedCents)} · Stripe fees{" "}
                {formatAud(result.stripe.feesCents)} · net {formatAud(result.stripe.netCents)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Ledger</p>
              <p className="text-white">
                Charged {formatAud(result.ledger.chargedCents)} · refunds{" "}
                {formatAud(result.ledger.refundedCents)} · net {formatAud(result.ledger.netCents)}
              </p>
            </div>
          </div>
          {result.drift.length === 0 ? (
            <p className="mt-3 text-success">No drift — ledger matches Stripe.</p>
          ) : (
            <div className="mt-3">
              <p className="text-warn">
                {result.drift.length} drift item(s) — ledger and Stripe disagree:
              </p>
              <ul className="mt-2 space-y-1 text-muted">
                {result.drift.map((d, i) => (
                  <li key={`${d.bookingId}-${d.kind}-${i}`}>
                    <code className="text-xs">{d.bookingId.slice(0, 8)}</code> [{d.kind}] {d.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
