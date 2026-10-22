// src/lib/rateCheckDraft.js
// Quiet save-and-return for /ratecheck. Nothing to click: what a visitor has
// typed and the photos they've added are kept on this device, so leaving the
// page (to find a policy in an email, a phone call, a closed tab) loses nothing.
//
// - Unsent draft: contact fields in localStorage, photos in IndexedDB, 24 h.
//   Consent is never saved — it is ticked fresh for every send.
// - After sending: what came back (carrier / line / premium) and the contact
//   details live in sessionStorage only, so they vanish when the tab closes.
//   That keeps a shared event tablet from showing one visitor's details to the next.
// Every storage call is best-effort: private mode or blocked storage just
// means no draft, never a broken page.

const FIELDS_KEY = 'rc_draft_fields_v1';
const SESSION_KEY = 'rc_session_v1';
const DB_NAME = 'ratecheck';
const STORE = 'photos';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result ?? out);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function saveDraftFields(fields) {
  try { localStorage.setItem(FIELDS_KEY, JSON.stringify({ ...fields, savedAt: Date.now() })); } catch { /* best effort */ }
}

export async function saveDraftPhoto({ id, file }) {
  try {
    await withStore('readwrite', s => s.put({ id, blob: file, name: file.name, type: file.type, lastModified: file.lastModified, addedAt: Date.now() }));
  } catch { /* best effort */ }
}

export async function removeDraftPhoto(id) {
  try { await withStore('readwrite', s => s.delete(id)); } catch { /* best effort */ }
}

/** Resolves to { fields, photos: [{ id, file }] }; expired drafts are cleared. */
export async function loadDraft() {
  let fields = null;
  try {
    const raw = JSON.parse(localStorage.getItem(FIELDS_KEY) || 'null');
    if (raw && Date.now() - raw.savedAt < DRAFT_TTL_MS) fields = raw;
  } catch { /* ignore */ }

  let photos = [];
  try {
    const rows = await withStore('readonly', s => s.getAll());
    const fresh = (rows || []).filter(r => Date.now() - r.addedAt < DRAFT_TTL_MS).sort((a, b) => a.addedAt - b.addedAt);
    if (fresh.length !== (rows || []).length) {
      const stale = (rows || []).filter(r => !fresh.includes(r)).map(r => r.id);
      withStore('readwrite', s => stale.forEach(id => s.delete(id))).catch(() => {});
    }
    photos = fresh.map(r => ({ id: r.id, file: new File([r.blob], r.name || 'policy', { type: r.type, lastModified: r.lastModified }) }));
  } catch { /* ignore */ }

  if (!fields && !photos.length) return null;
  return { fields: fields || {}, photos };
}

export async function clearDraft() {
  try { localStorage.removeItem(FIELDS_KEY); } catch { /* ignore */ }
  try { await withStore('readwrite', s => s.clear()); } catch { /* ignore */ }
}

export function saveSession(data) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
