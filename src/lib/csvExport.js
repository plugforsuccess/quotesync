// src/lib/csvExport.js
// Minimal, dependency-free CSV export. Flattens rows (arrays/objects → JSON),
// escapes per RFC 4180, and triggers a browser download.

function cell(v) {
  if (v == null) return '';
  if (Array.isArray(v) || typeof v === 'object') v = JSON.stringify(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  // Union of keys across rows (rows can be sparse).
  const keys = [...rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set())];
  const header = keys.map(cell).join(',');
  const body = rows.map((r) => keys.map((k) => cell(r[k])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCSV(filename, rows) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
