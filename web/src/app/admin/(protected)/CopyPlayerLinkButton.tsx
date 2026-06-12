"use client";

import { useState } from "react";

export function CopyPlayerLinkButton({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const site = window.location.origin;
    const url = `${site}/sessions/${sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy player link:", url);
    }
  }

  return (
    <button type="button" onClick={onCopy} className="text-xs text-link hover:underline">
      {copied ? "Copied!" : "Copy player link"}
    </button>
  );
}
