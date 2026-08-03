"use client";

import { useEffect, useState } from "react";

/** Available until August 25, 2026 00:00 UTC+10 — locks after this. */
export const TRY_IT_LOCKS_AT = new Date("2026-08-25T00:00:00+10:00");

/** @deprecated use TRY_IT_LOCKS_AT */
export const TRY_IT_UNLOCK_AT = TRY_IT_LOCKS_AT;

export function getTryItRemainingMs(now = Date.now()) {
  return Math.max(0, TRY_IT_LOCKS_AT.getTime() - now);
}

/** True while the playground is still open (before Aug 25 00:00). */
export function isTryItUnlocked(now = Date.now()) {
  return getTryItRemainingMs(now) > 0;
}

export function formatTryItCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatTryItCountdownLabel(ms: number) {
  const { days, hours, minutes, seconds } = formatTryItCountdown(ms);
  if (days > 0) {
    return `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function useTryItCountdown() {
  const [remainingMs, setRemainingMs] = useState(() => getTryItRemainingMs());
  const unlocked = remainingMs > 0;

  useEffect(() => {
    if (!unlocked) return;

    const tick = () => setRemainingMs(getTryItRemainingMs());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [unlocked]);

  return {
    remainingMs,
    unlocked,
    parts: formatTryItCountdown(remainingMs),
    locksAt: TRY_IT_LOCKS_AT,
    label: formatTryItCountdownLabel(remainingMs),
  };
}
