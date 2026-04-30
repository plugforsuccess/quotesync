// Persona switcher state — stored in localStorage so it persists across reloads.
// Personas are a UI lens, NOT a permission gate: the active persona changes
// default landing pages and nav emphasis but never restricts what data the
// user can see (the data layer always uses the user's real roles + RLS).

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'qs_active_persona';

export const PERSONAS = ['principal', 'service', 'sales'];

export const PERSONA_HOME = {
  principal: '/agency/retention',
  service:   '/my/today',
  sales:     '/agency/cross-sell',
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

  // Sync across tabs
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY && PERSONAS.includes(e.newValue)) {
        setPersonaState(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPersona = useCallback((next) => {
    if (!PERSONAS.includes(next)) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    setPersonaState(next);
  }, []);

  return [persona, setPersona];
}
