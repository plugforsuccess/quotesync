// src/lib/caseRecord.js
// "Does this case have a record?" — the check behind the no-undocumented-close
// rule. A case may leave the queue only if SOMETHING tells the next person what
// happened: a case-log comment (case_notes), a meaningful note on a genuine
// call attempt, or a filled case Notes field. Mirrored by the DB guard in
// 20260707100000_require_case_record_on_close.sql; keep the two in sync.

// Minimum bar for a note to count: enough to carry information ("paid 7/9,
// keep EFT on"), not a punctuation bypass ("." / "ok"). At least 8 chars and
// two words.
export function hasMeaningfulNote(s) {
  const t = String(s ?? '').trim();
  return t.length >= 8 && /\s/.test(t);
}

// caseNotes      — rows from the case_notes feed (existence is enough; the DB
//                  already enforces non-empty bodies)
// attempts       — the case's call attempts; auto-logged synthetic rows are
//                  excluded (their canned note isn't a rep record)
// caseNotesField — the case-level Notes field (form value, saved with the close)
// extraNote      — a note being written as part of the same action (e.g. the
//                  quick-note on the call that's about to close the case)
export function caseHasRecord({ caseNotes, attempts, caseNotesField, extraNote } = {}) {
  if ((caseNotes || []).length > 0) return true;
  if (hasMeaningfulNote(caseNotesField)) return true;
  if (hasMeaningfulNote(extraNote)) return true;
  return (attempts || []).some((a) => !a?.auto_logged && hasMeaningfulNote(a?.note));
}
