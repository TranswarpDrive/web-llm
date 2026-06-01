import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const CHANGE_EVENT = 'webllm:theme-change';
const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system'];

function normalizeThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return normalizeThemeMode(localStorage.getItem(STORAGE_KEY));
}

export function resolveThemeMode(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeMode(mode = getThemeMode()) {
  if (typeof document === 'undefined') return;
  const resolved = resolveThemeMode(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.themeMode = mode;
}

export function setStoredThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyThemeMode(mode);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
}

export function getNextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_ORDER.indexOf(mode);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

export function useThemeMode() {
  const readTheme = () => {
    const mode = getThemeMode();
    return { mode, resolved: resolveThemeMode(mode) };
  };

  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function syncTheme() {
      const next = readTheme();
      applyThemeMode(next.mode);
      setTheme(next);
    }

    syncTheme();
    window.addEventListener(CHANGE_EVENT, syncTheme);
    window.addEventListener('storage', syncTheme);
    media.addEventListener('change', syncTheme);

    return () => {
      window.removeEventListener(CHANGE_EVENT, syncTheme);
      window.removeEventListener('storage', syncTheme);
      media.removeEventListener('change', syncTheme);
    };
  }, []);

  const setMode = useCallback((mode: ThemeMode) => {
    setStoredThemeMode(mode);
    setTheme({ mode, resolved: resolveThemeMode(mode) });
  }, []);

  const cycleMode = useCallback(() => {
    const next = getNextThemeMode(getThemeMode());
    setStoredThemeMode(next);
    setTheme({ mode: next, resolved: resolveThemeMode(next) });
  }, []);

  return {
    themeMode: theme.mode,
    resolvedTheme: theme.resolved,
    setThemeMode: setMode,
    cycleThemeMode: cycleMode,
  };
}
