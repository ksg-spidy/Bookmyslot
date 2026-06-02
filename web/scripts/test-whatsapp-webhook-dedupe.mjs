/**
 * Regression guard for WhatsApp webhook message processing.
 * Run from web/: node scripts/test-whatsapp-webhook-dedupe.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSource = readFileSync(
  resolve("src/app/api/webhooks/whatsapp/route.ts"),
  "utf8"
);
const processorSource = readFileSync(
  resolve("src/lib/whatsapp/processInbound.ts"),
  "utf8"
);

assert.equal(
  routeSource.includes("claimWhatsAppMessage"),
  false,
  "webhook route must not pre-claim WhatsApp message ids before calling the processor"
);
assert.equal(
  routeSource.includes('from("whatsapp_processed_messages")'),
  false,
  "webhook route must not insert into whatsapp_processed_messages"
);
assert.equal(
  processorSource.includes('from("whatsapp_processed_messages")'),
  true,
  "inbound processor should remain the single owner of WhatsApp message dedupe"
);

console.log("WhatsApp webhook dedupe regression test passed.");
