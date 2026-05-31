const MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  stripe_not_configured: "Payments are not set up on this site. Contact the organiser.",
  supabase_service_role_missing: "Booking could not be saved. Contact the organiser.",
  missing_checkout_session_id: "Payment reference missing. Try refreshing the page.",
  checkout_not_ready: "Still confirming your payment with the bank — please wait a moment.",
  payment_not_completed: "Payment has not completed yet. Wait a few seconds and try again.",
  checkout_wrong_session: "This payment does not match this session. Contact the organiser.",
  checkout_wrong_user: "This payment is linked to a different account.",
  sync_failed: "Something went wrong saving your booking. Try again or contact the organiser.",
};

export function humanizeSyncError(code: string | null | undefined): string {
  if (!code) return "Could not save your booking yet.";
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith("insert_failed") || code.startsWith("update_failed")) {
    return "Could not save your booking. Contact the organiser with your payment receipt.";
  }
  if (code.startsWith("play_session")) {
    return "This session is no longer available for booking.";
  }
  return "Could not save your booking. Try again or contact the organiser.";
}
