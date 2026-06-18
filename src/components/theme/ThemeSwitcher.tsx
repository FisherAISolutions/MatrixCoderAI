'use client';

import { useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeSwitcher() {
  const { themeId, themes, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);
  const currentTheme = themes.find((theme) => theme.id === themeId) || themes[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 border border-matrix-border text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green rounded-sm transition-all"
        aria-label="Change workspace theme"
        title={`Theme: ${currentTheme.label}`}
      >
        <Palette size={11} />
        <span className="hidden lg:inline tracking-widest uppercase">Theme</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-matrix-card border border-matrix-border rounded-sm shadow-neon-sm z-50 py-1">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => {
                setThemeId(theme.id);
                setOpen(false);
              }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-matrix-green-ghost transition-colors"
            >
              <span
                className="mt-0.5 h-3 w-3 rounded-full border border-matrix-border flex-shrink-0"
                style={{ background: theme.tokens.accentPrimary }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-mono text-matrix-green">
                  {theme.label}
                </span>
                <span className="block text-[10px] leading-4 font-mono text-matrix-green-muted">
                  {theme.description}
                </span>
              </span>
              {theme.id === themeId && <Check size={12} className="mt-0.5 text-matrix-green" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
