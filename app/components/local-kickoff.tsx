"use client";

/**
 * Renders a kickoff time in the VIEWER's local timezone
 * (e.g. "Thu, Sep 24, 8:15 PM EDT"), not hardcoded ET.
 * suppressHydrationWarning avoids a mismatch flash between the
 * server render and the client's locale.
 */
export function LocalKickoff({ iso }: { iso: string }) {
  const d = new Date(iso);
  const text = d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
