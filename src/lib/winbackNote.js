// src/lib/winbackNote.js
// Winback leads are created from Allstate termination reports with the story in
// callback_note: "Winback: lost auto 01/2026 — Insured Request — $3156".
// Pull it apart so the Winbacks tab can show what they left, when, why and the
// premium we lost.

const LINE_LABEL = { auto: 'Auto', ho: 'Home', home: 'Home', landlord: 'Landlord', renters: 'Renters', condo: 'Condo', boat: 'Boat', umbrella: 'PUP', pup: 'PUP', motorcycle: 'Motorcycle' };

/** { line, month, reason, premium } (any part may be null), or null for a note that isn't a winback. */
export function parseWinbackNote(note) {
  const m = /^Winback:\s*lost\s+(\S+)(?:\s+(\d{1,2}\/\d{4}))?\s*(.*)$/i.exec(String(note || '').trim());
  if (!m) return null;
  const parts = m[3].split(/\s*[—–]\s*/).map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  const premium = last && /^\$[\d,]+(\.\d+)?$/.test(last) ? Number(last.replace(/[$,]/g, '')) : null;
  const reason = (premium != null ? parts.slice(0, -1) : parts).join(' — ') || null;
  const key = m[1].toLowerCase();
  return { line: LINE_LABEL[key] || m[1], month: m[2] || null, reason, premium };
}
