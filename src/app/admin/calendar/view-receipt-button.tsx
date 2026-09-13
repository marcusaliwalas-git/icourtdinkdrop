"use client";

import { useState } from "react";
import { getPaymentSlipUrl } from "./actions";

/**
 * Opens a booking's payment receipt in a new tab, minting the signed URL fresh on click so it can
 * never be expired (the old flow pre-signed a 10-minute URL when the panel opened, which went stale
 * and downloaded a storage-error JSON instead of the image). A blank tab is opened synchronously
 * inside the click gesture — otherwise a mobile popup blocker swallows the later window.open — then
 * pointed at the URL once it resolves. If the receipt is missing, it says so instead of navigating.
 */
export function ViewReceiptButton({ bookingId, className }: { bookingId: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLinkUrl(null);
    // Open the tab synchronously inside the gesture so a mobile popup blocker doesn't swallow it.
    const tab = window.open("", "_blank");
    setLoading(true);
    const { url } = await getPaymentSlipUrl(bookingId);
    setLoading(false);
    if (!url) {
      tab?.close();
      setError("Receipt unavailable — the file may be missing.");
      return;
    }
    if (tab) {
      tab.location.href = url;
    } else {
      // Popup was blocked — surface a real link the admin can tap instead (a fresh, working URL).
      setLinkUrl(url);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={className ?? "w-fit underline underline-offset-2 disabled:opacity-60"}
      >
        {loading ? "Opening…" : "View receipt ↗"}
      </button>
      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline underline-offset-2"
        >
          Open receipt ↗
        </a>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
