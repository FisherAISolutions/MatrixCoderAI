'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  THEME_LIST,
  THEME_STORAGE_KEY,
  ThemeDefinition,
  ThemeId,
  getTheme,
  isThemeId,
} from '@/lib/theme/themes';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDefinition;
  themes: ThemeDefinition[];
  setThemeId: (themeId: ThemeId) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function colorToRgb(value: string): string {
  const rgbMatch = value.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  }

  const normalized = value.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '0, 255, 102';
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

function applyThemeToDocument(theme: ThemeDefinition) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const tokens = theme.tokens;
  const entries: Record<string, string> = {
    '--theme-background': tokens.background,
    '--theme-surface': tokens.surface,
    '--theme-surface-secondary': tokens.surfaceSecondary,
    '--theme-border': tokens.border,
    '--theme-text-primary': tokens.textPrimary,
    '--theme-text-secondary': tokens.textSecondary,
    '--theme-success': tokens.success,
    '--theme-warning': tokens.warning,
    '--theme-error': tokens.error,
    '--theme-accent-primary': tokens.accentPrimary,
    '--theme-accent-secondary': tokens.accentSecondary,
    '--theme-glow-primary': tokens.glowPrimary,
    '--theme-glow-secondary': tokens.glowSecondary,
    '--theme-panel-background': tokens.panelBackground,
    '--theme-panel-border': tokens.panelBorder,
    '--theme-panel-shadow': tokens.panelShadow,
    '--theme-panel-filter': tokens.panelFilter,
    '--theme-active-state': tokens.activeState,
    '--theme-hover-state': tokens.hoverState,
    '--theme-muted-text': tokens.textMuted,
    '--theme-strong-text': tokens.textStrong,
    '--theme-ai-accent': tokens.aiAccent,
    '--theme-success-accent': tokens.successAccent,
    '--theme-preview-accent': tokens.previewAccent,
    '--theme-terminal-accent': tokens.terminalAccent,
    '--theme-background-pattern': tokens.backgroundPattern,
    '--matrix-bg': tokens.background,
    '--matrix-card': tokens.panelBackground,
    '--matrix-surface': tokens.surfaceSecondary,
    '--matrix-green': tokens.terminalAccent,
    '--matrix-green-bright': tokens.textStrong,
    '--matrix-green-dim': tokens.accentPrimary,
    '--matrix-green-muted': tokens.textMuted,
    '--matrix-green-faint': tokens.panelBorder,
    '--matrix-green-ghost': tokens.hoverState,
    '--matrix-border': tokens.panelBorder,
    '--matrix-border-bright': tokens.accentPrimary,
    '--matrix-blue': tokens.previewAccent,
    '--matrix-amber': tokens.warning,
    '--matrix-purple': tokens.aiAccent,
    '--matrix-red': tokens.error,
    '--theme-panel-background-rgb': colorToRgb(tokens.panelBackground),
    '--theme-active-state-rgb': colorToRgb(tokens.activeState),
    '--theme-hover-state-rgb': colorToRgb(tokens.hoverState),
    '--theme-success-accent-rgb': colorToRgb(tokens.successAccent),
    '--theme-preview-accent-rgb': colorToRgb(tokens.previewAccent),
    '--theme-terminal-accent-rgb': colorToRgb(tokens.terminalAccent),
    '--matrix-bg-rgb': colorToRgb(tokens.background),
    '--matrix-card-rgb': colorToRgb(tokens.panelBackground),
    '--matrix-surface-rgb': colorToRgb(tokens.surfaceSecondary),
    '--matrix-green-rgb': colorToRgb(tokens.terminalAccent),
    '--matrix-green-muted-rgb': colorToRgb(tokens.textMuted),
    '--matrix-border-rgb': colorToRgb(tokens.panelBorder),
    '--matrix-blue-rgb': colorToRgb(tokens.previewAccent),
    '--matrix-amber-rgb': colorToRgb(tokens.warning),
    '--matrix-purple-rgb': colorToRgb(tokens.aiAccent),
    '--matrix-red-rgb': colorToRgb(tokens.error),
  };

  root.dataset.theme = theme.id;
  for (const [name, value] of Object.entries(entries)) {
    root.style.setProperty(name, value);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const theme = getTheme(themeId);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(storedTheme)) {
      setThemeIdState(storedTheme);
    }
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  }, [theme]);

  const setThemeId = useCallback((nextThemeId: ThemeId) => {
    setThemeIdState(nextThemeId);
  }, []);

  const resetTheme = useCallback(() => {
    setThemeIdState(DEFAULT_THEME_ID);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      theme,
      themes: THEME_LIST,
      setThemeId,
      resetTheme,
    }),
    [resetTheme, setThemeId, theme, themeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
