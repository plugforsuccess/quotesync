// Persona switcher state — stored in localStorage so it persists across reloads.
// Personas are a UI lens, NOT a permission gate: the active persona changes
// default landing pages and nav emphasis but never restricts what data the
// user can see (the data layer always uses the user's real roles + RLS).

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { personaForPath } from '../config/navConfig';

const STORAGE_KEY = 'qs_active_persona';
// Same-tab broadcast — `storage` events only fire in OTHER tabs, so instances
// in the same tab (nav, scorecard, switcher) sync via this custom event.
const PERSONA_EVENT = 'qs_persona_change';

export const PERSONAS = ['principal', 'service', 'sales'];

export const PERSONA_HOME = {
  principal: '/agency/retention',
  service:   '/my/today',
  sales:     '/my/scorecard',
};

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return PERSONAS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function usePersona(defaultPersona = 'principal') {
  const [persona, setPersonaState] = useState(() => readStored() || defaultPersona);

  useEffect(() => {
    // Cross-tab sync.
    function onStorage(e) {
      if (e.key === STORAGE_KEY && PERSONAS.includes(e.newValue)) {
        setPersonaState(e.newValue);
      }
    }
    // Same-tab sync — keeps every usePersona instance in lockstep when the
    // switcher (or auto-sync) changes the active persona.
    function onPersona(e) {
      if (PERSONAS.includes(e.detail)) setPersonaState(e.detail);
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(PERSONA_EVENT, onPersona);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PERSONA_EVENT, onPersona);
    };
  }, []);

  const setPersona = useCallback((next) => {
    if (!PERSONAS.includes(next)) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    setPersonaState(next);
    try { window.dispatchEvent(new CustomEvent(PERSONA_EVENT, { detail: next })); } catch { /* noop */ }
  }, []);

  return [persona, setPersona];
}

// Mount this from any layout that hosts the persona pill. It watches the
// URL and snaps the persona to the page being viewed so the pill never lies
// (e.g. clicking "Retention" while in Sales auto-flips back to Principal).
// Gated on isPrincipal because only principals have multiple personas; for
// other roles the persona is a no-op and shouldn't be touched. Returns the
// active [persona, setPersona] so the host can shape its nav by hat.
export function useAutoSyncPersona(isPrincipal) {
  const location = useLocation();
  const [persona, setPersona] = usePersona(isPrincipal ? 'principal' : 'service');

  useEffect(() => {
    if (!isPrincipal) return;
    const next = personaForPath(location.pathname);
    if (next && PERSONAS.includes(next) && next !== persona) {
      setPersona(next);
    }
  }, [location.pathname, isPrincipal, persona, setPersona]);

  return [persona, setPersona];
}
