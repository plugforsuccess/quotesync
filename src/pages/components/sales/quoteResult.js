// Sales workspace: how an Allstate quote compares with what the household pays now.

/** Saves / same / more for a household, from annual totals. Within 1% (or $25) reads as the same. */
export function quoteResult(currentAnnual, allstateAnnual) {
  if (!(currentAnnual > 0) || !(allstateAnnual > 0)) return null;
  const diff = Math.round(currentAnnual - allstateAnnual);
  const same = Math.abs(diff) <= Math.max(25, currentAnnual * 0.01);
  return { diff, kind: same ? 'same' : diff > 0 ? 'saves' : 'more' };
}
