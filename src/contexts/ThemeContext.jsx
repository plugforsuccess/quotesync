// src/contexts/ThemeContext.jsx
// Manages dark / light / high_contrast theme preference.
// Persists to localStorage (instant, no flash) and profiles table
// (cross-device sync).
//
// Force override: pages that must render in a specific theme (e.g. the
// consumer funnel is dark-only) call useForceTheme('dark') — the active
// theme is temporarily swapped without mutating the stored preference.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const THEMES = [
  { key: 'dark',          label: 'Dark',          icon: '\uD83C\uDF19' },
  { key: 'light',         label: 'Light',         icon: '\u2600\uFE0F' },
  { key: 'high_contrast', label: 'High Contrast', icon: '\u2B24'      },
];

const ThemeContext = createContext({
  theme: 'dark',
  setTheme: () => {},
  cycleTheme: () => {},
  pushForceTheme: () => () => {},
});

const STORAGE_KEY = 'qs_theme_v2';

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some(t => t.key === stored)) return stored;
  } catch {
    // localStorage unavailable — fall back to default
  }
  return 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Apply before React renders — prevents flash of wrong theme
applyTheme(getStoredTheme());

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getStoredTheme);
  const [syncing, setSyncing] = useState(false);
  // Stack of forced themes — most-recent wins. Lets multiple components push
  // an override without clobbering each other; each pop cleanly restores.
  const [forceStack, setForceStack] = useState([]);

  const effectiveTheme = forceStack.length > 0
    ? forceStack[forceStack.length - 1]
    : theme;

  // Apply effective theme whenever it changes
  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  // Sync from DB on mount — pick up preference from other devices
  useEffect(() => {
    async function syncFromDB() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('theme_preference')
        .eq('id', user.id)
        .single();

      const dbTheme = profile?.theme_preference;
      if (dbTheme && THEMES.some(t => t.key === dbTheme) && dbTheme !== theme) {
        setThemeState(dbTheme);
        try { localStorage.setItem(STORAGE_KEY, dbTheme); } catch {
          // localStorage unavailable — DB sync still succeeds in memory
        }
      }
    }
    syncFromDB();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(async (next) => {
    if (!THEMES.some(t => t.key === next)) return;

    // Apply immediately — optimistic update
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {
      // localStorage unavailable — non-fatal, theme still applied in memory
    }

    // Persist to DB in background — fire and forget
    if (!syncing) {
      setSyncing(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('profiles')
            .update({ theme_preference: next })
            .eq('id', user.id);
        }
      } catch {
        // Non-fatal — localStorage is the source of truth on this device
      } finally {
        setSyncing(false);
      }
    }
  }, [syncing]);

  // Push a forced theme onto the stack; returns a pop function.
  // Consumers call this via useForceTheme() which handles lifecycle.
  const pushForceTheme = useCallback((forced) => {
    if (!THEMES.some(t => t.key === forced)) return () => {};
    const token = Symbol('force-theme');
    setForceStack(prev => [...prev, { token, theme: forced }]);
    return () => {
      setForceStack(prev => prev.filter(f => f.token !== token));
    };
  }, []);

  // Cycle through themes in order: dark → light → high_contrast → dark
  const cycleTheme = useCallback(() => {
    const idx = THEMES.findIndex(t => t.key === theme);
    const next = THEMES[(idx + 1) % THEMES.length].key;
    setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{
      theme: effectiveTheme,
      userTheme: theme,
      setTheme,
      cycleTheme,
      pushForceTheme,
      forced: forceStack.length > 0,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Temporarily force a theme for the lifetime of the caller component.
// Pass `null` / `undefined` / `false` to disable. Safe to call with a
// changing value — the previous force is released before the new one applies.
export function useForceTheme(forced) {
  const { pushForceTheme } = useContext(ThemeContext);
  useEffect(() => {
    if (!forced) return undefined;
    const release = pushForceTheme(forced);
    return release;
  }, [forced, pushForceTheme]);
}
