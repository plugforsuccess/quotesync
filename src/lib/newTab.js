// src/lib/newTab.js
// Links that always open in a new tab from the agency app: Quick Send (/qs) is its own
// sign-in-free tool, so opening it never replaces the page you were working on.
const NEW_TAB = new Set(['/qs']);
export const newTabProps = (to) => (NEW_TAB.has(to) ? { target: '_blank', rel: 'noopener' } : {});
