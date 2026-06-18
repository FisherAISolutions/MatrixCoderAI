import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  THEME_LIST,
  THEME_TOKEN_NAMES,
  THEMES,
  getTheme,
  isThemeId,
} from '@/lib/theme/themes';

describe('theme definitions', () => {
  it('includes every supported workspace theme', () => {
    expect(Object.keys(THEMES).sort()).toEqual(
      [
        'command-center',
        'cyber-glass',
        'matrix-aurora',
        'matrix-classic',
        'midnight-purple',
      ].sort()
    );
  });

  it('uses matrix-classic as the default theme', () => {
    expect(DEFAULT_THEME_ID).toBe('matrix-classic');
    expect(getTheme(undefined).id).toBe('matrix-classic');
    expect(getTheme('not-a-theme').id).toBe('matrix-classic');
  });

  it('exposes all required design tokens for each theme', () => {
    for (const theme of THEME_LIST) {
      for (const token of THEME_TOKEN_NAMES) {
        expect(theme.tokens[token], `${theme.id}.${token}`).toEqual(expect.any(String));
        expect(theme.tokens[token].length, `${theme.id}.${token}`).toBeGreaterThan(0);
      }
    }
  });

  it('validates theme ids safely', () => {
    expect(isThemeId('matrix-classic')).toBe(true);
    expect(isThemeId('cyber-glass')).toBe(true);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });
});
