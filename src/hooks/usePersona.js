// Persona switcher state — stored in localStorage so it persists across reloads.
// Personas are a UI lens, NOT a permission gate: the active persona changes
// default landing pages and nav emphasis but never restricts what data the
// user can see (the data layer always uses the user's real roles + RLS).

import { useCallback, useEffect, useRef, useState } from 'react';
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

// Per-hat "last visited path" memory (in-session). Lets the persona switcher
// return you to where you left off in a hat instead of always its home, so a
// dual-role user toggling back and forth resumes each hat where they left it.
const personaLastPath = {};

export function recordPersonaPath(persona, pathname) {
  if (PERSONAS.includes(persona) && pathname) personaLastPath[persona] = pathname;
}

// Where toggling INTO `persona` should land: the last page seen in that hat,
// or the hat's home the first time it's worn.
export function personaLanding(persona) {
  return personaLastPath[persona] || PERSONA_HOME[persona];
}

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
// `enabled` gates the syncing to users who actually wear more than one hat
// (a principal, or a dual-role sales+service employee); `defaultPersona` is
// the starting hat. Returns the active [persona, setPersona] so the host can
// shape its nav by hat.
export function useAutoSyncPersona(enabled, defaultPersona = 'principal') {
  const location = useLocation();
  const [persona, setPersona] = usePersona(defaultPersona);
  // Always-current persona, read inside effects that must NOT depend on persona.
  const personaRef = useRef(persona);
  personaRef.current = persona;

  // Snap the pill to the page being viewed — but ONLY when the path actually
  // changes. Depending on `persona` here would re-run this on every explicit
  // pill click and revert the selection against the page we're leaving (the bug
  // where Sales/Principal wouldn't stick). Navigation updates the path, which is
  // the only thing that should drive a re-sync.
  useEffect(() => {
    if (!enabled) return;
    const next = personaForPath(location.pathname);
    if (next && PERSONAS.includes(next) && next !== personaRef.current) {
      setPersona(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, enabled, setPersona]);

  // Remember where we are in each hat so the switcher can return here. A page
  // owned by a specific hat (personaForPath) is filed under that hat; a shared
  // page (scorecard / punch) is filed under the hat currently worn.
  useEffect(() => {
    recordPersonaPath(personaForPath(location.pathname) || personaRef.current, location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return [persona, setPersona];
}
