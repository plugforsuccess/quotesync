// src/hooks/useCountdown.js
// Ticking countdown to a target Date. Returns clamped day/hour/minute/second
// parts plus an isComplete flag once the target has passed.

import { useEffect, useState } from 'react';

function diffParts(target) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    isComplete: ms === 0,
  };
}

export function useCountdown(target) {
  const targetMs =
    target instanceof Date ? target.getTime() : new Date(target).getTime();
  const [parts, setParts] = useState(() => diffParts(new Date(targetMs)));

  useEffect(() => {
    const t = new Date(targetMs);
    setParts(diffParts(t));
    const id = setInterval(() => setParts(diffParts(t)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return parts;
}
