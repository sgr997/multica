import { useEffect, useRef, useState } from "react";

/**
 * Elapsed seconds since `iso`, re-rendering once a second while `active`.
 *
 * Used by the run transcript header: an active run has no persisted duration
 * yet, so the only honest number is "time since it started", computed on the
 * client and stopped the moment the task reaches a terminal status. A missing
 * or unparseable timestamp falls back to the first render, which keeps the
 * caption monotonic instead of flashing a huge value.
 */
export function useElapsedSecs(
  iso: string | null | undefined,
  active: boolean,
): number {
  const fallbackRef = useRef(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const parsed = iso ? Date.parse(iso) : NaN;
  const anchorMs = Number.isFinite(parsed) ? parsed : fallbackRef.current;
  return Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
}
