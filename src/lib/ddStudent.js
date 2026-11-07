// src/lib/ddStudent.js
// Where an enrolled student stands, for the course page: still learning, ready for the
// final exam, retaking it, or passed (with the certificate and when the discount ends).
// Pure (no Supabase) so it can be unit-tested.

/** How long the Allstate defensive driving discount lasts after passing. */
export const DISCOUNT_MONTHS = 36;

export function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/**
 * stage: 'learning' | 'exam' (all modules done, no try yet) | 'retake' (tried, not passed) | 'passed'.
 * next: the first unfinished module (by ordinal), for Continue Course.
 */
export function studentStatus({ course, enrollment, modules = [], progress = [], attempts = [], cert = null }) {
  const done = new Set(progress.filter(p => p.completed_at).map(p => p.module_id));
  const ordered = [...modules].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const doneCount = ordered.filter(m => done.has(m.id)).length;
  const passedTry = attempts.find(a => a.passed);
  const passed = enrollment?.status === 'completed' || !!passedTry;
  const allDone = ordered.length > 0 && doneCount === ordered.length;
  const tries = attempts.filter(a => a.submitted_at).length;
  const passedAt = enrollment?.completed_at || passedTry?.submitted_at || cert?.issued_at || null;
  const from = cert?.issued_at || passedAt;
  return {
    stage: passed ? 'passed' : allDone ? (tries > 0 ? 'retake' : 'exam') : 'learning',
    doneCount,
    total: ordered.length,
    modules: ordered.map(m => ({ ...m, done: done.has(m.id) })),
    next: ordered.find(m => !done.has(m.id)) || null,
    tries,
    triesLeft: Math.max(0, (course?.retake_limit || 0) - tries),
    passedAt,
    certIssuedAt: cert?.issued_at || null,
    expiresAt: from ? addMonths(from, DISCOUNT_MONTHS) : null,
  };
}

/** "June 4, 2026" */
export const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '');
