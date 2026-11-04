// src/lib/copyValues.js
// The saved site copy, readable outside React (message drafts built at click time).
// SiteCopyProvider keeps it current; until it loads, the last copy seen on this
// device (the same local cache SiteCopy uses) stands in.
let current = null;
const fromCache = () => {
  try {
    const rows = JSON.parse(localStorage.getItem('qs_site_copy_v1') || 'null') || [];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  } catch { return {}; }
};
export function setCopyValues(values) { current = values; }
/** The saved text for `key`, or `fallback` when it was never edited. */
export function copyValue(key, fallback) {
  const v = (current || fromCache())[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}
