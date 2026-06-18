export const THEME_STORAGE_KEY = 'matrix-coder-theme';

export const THEME_TOKEN_NAMES = [
  'background',
  'surface',
  'surfaceSecondary',
  'border',
  'textPrimary',
  'textSecondary',
  'success',
  'warning',
  'error',
  'accentPrimary',
  'accentSecondary',
  'glowPrimary',
  'glowSecondary',
  'panelBackground',
  'panelBorder',
  'panelShadow',
  'panelFilter',
  'activeState',
  'hoverState',
  'textMuted',
  'textStrong',
  'aiAccent',
  'successAccent',
  'previewAccent',
  'terminalAccent',
  'backgroundPattern',
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export type ThemeId =
  | 'matrix-classic'
  | 'matrix-aurora'
  | 'command-center'
  | 'cyber-glass'
  | 'midnight-purple';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  tokens: Record<ThemeTokenName, string>;
}

export const DEFAULT_THEME_ID: ThemeId = 'matrix-classic';

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'matrix-classic': {
    id: 'matrix-classic',
    label: 'Matrix Classic',
    description: 'The original Matrix Coder green terminal workspace.',
    tokens: {
      background: '#0a0a0a',
      surface: '#111111',
      surfaceSecondary: '#0d1a0d',
      border: '#0a5c25',
      textPrimary: '#00ff66',
      textSecondary: '#3fd07a',
      success: '#00ff66',
      warning: '#ffc857',
      error: '#ff6b6b',
      accentPrimary: '#39ff88',
      accentSecondary: '#7cc4ff',
      glowPrimary: 'rgba(0, 255, 102, 0.45)',
      glowSecondary: 'rgba(0, 255, 102, 0.18)',
      panelBackground: '#111111',
      panelBorder: '#0a5c25',
      panelShadow: 'none',
      panelFilter: 'none',
      activeState: '#001a00',
      hoverState: '#0d1a0d',
      textMuted: '#3fd07a',
      textStrong: '#39ff88',
      aiAccent: '#d27bff',
      successAccent: '#00ff66',
      previewAccent: '#7cc4ff',
      terminalAccent: '#00ff66',
      backgroundPattern: 'none',
    },
  },
  'matrix-aurora': {
    id: 'matrix-aurora',
    label: 'Matrix Aurora',
    description: 'Premium Matrix energy with aurora AI accents.',
    tokens: {
      background: '#050913',
      surface: '#0b1222',
      surfaceSecondary: '#0e1d2a',
      border: '#194c62',
      textPrimary: '#d8fff5',
      textSecondary: '#82b7c7',
      success: '#43f2a5',
      warning: '#ffd166',
      error: '#ff6b8a',
      accentPrimary: '#43d6ff',
      accentSecondary: '#b884ff',
      glowPrimary: 'rgba(67, 214, 255, 0.30)',
      glowSecondary: 'rgba(184, 132, 255, 0.18)',
      panelBackground: 'rgba(9, 18, 34, 0.94)',
      panelBorder: '#245d78',
      panelShadow: '0 0 24px rgba(67, 214, 255, 0.10), inset 0 1px 0 rgba(216, 255, 245, 0.05)',
      panelFilter: 'none',
      activeState: '#102849',
      hoverState: '#0f2237',
      textMuted: '#7aa8b8',
      textStrong: '#e8fffb',
      aiAccent: '#b884ff',
      successAccent: '#43f2a5',
      previewAccent: '#43d6ff',
      terminalAccent: '#6dffcf',
      backgroundPattern:
        'radial-gradient(circle at 20% 0%, rgba(184, 132, 255, 0.12), transparent 32%), radial-gradient(circle at 90% 18%, rgba(67, 214, 255, 0.10), transparent 34%)',
    },
  },
  'command-center': {
    id: 'command-center',
    label: 'Command Center',
    description: 'A focused operations palette with blue panels and amber alerts.',
    tokens: {
      background: '#060a10',
      surface: '#0d1520',
      surfaceSecondary: '#141f2d',
      border: '#2d4964',
      textPrimary: '#e6f0ff',
      textSecondary: '#91a8bd',
      success: '#4ade80',
      warning: '#fbbf24',
      error: '#fb7185',
      accentPrimary: '#32c7ff',
      accentSecondary: '#ffb545',
      glowPrimary: 'rgba(50, 199, 255, 0.32)',
      glowSecondary: 'rgba(74, 222, 128, 0.14)',
      panelBackground: '#0f1926',
      panelBorder: '#365a78',
      panelShadow: '0 12px 34px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(230, 240, 255, 0.04)',
      panelFilter: 'none',
      activeState: '#12324a',
      hoverState: '#132437',
      textMuted: '#91a8bd',
      textStrong: '#f2f7ff',
      aiAccent: '#32c7ff',
      successAccent: '#4ade80',
      previewAccent: '#32c7ff',
      terminalAccent: '#32c7ff',
      backgroundPattern:
        'linear-gradient(135deg, rgba(50, 199, 255, 0.07), transparent 32%), radial-gradient(circle at 80% 0%, rgba(74, 222, 128, 0.06), transparent 30%)',
    },
  },
  'cyber-glass': {
    id: 'cyber-glass',
    label: 'Cyber Glass',
    description: 'A crisp glassy cyan workspace with violet depth.',
    tokens: {
      background: '#050712',
      surface: '#0b1020',
      surfaceSecondary: '#121a2e',
      border: '#2a4567',
      textPrimary: '#ecfeff',
      textSecondary: '#9bb7cf',
      success: '#5cffc7',
      warning: '#facc15',
      error: '#fb7185',
      accentPrimary: '#67e8f9',
      accentSecondary: '#a78bfa',
      glowPrimary: 'rgba(103, 232, 249, 0.34)',
      glowSecondary: 'rgba(167, 139, 250, 0.24)',
      panelBackground: 'rgba(13, 19, 36, 0.72)',
      panelBorder: 'rgba(103, 232, 249, 0.34)',
      panelShadow: '0 18px 42px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(236, 254, 255, 0.08)',
      panelFilter: 'blur(10px)',
      activeState: 'rgba(103, 232, 249, 0.18)',
      hoverState: 'rgba(167, 139, 250, 0.12)',
      textMuted: '#9bb7cf',
      textStrong: '#ffffff',
      aiAccent: '#a78bfa',
      successAccent: '#5cffc7',
      previewAccent: '#67e8f9',
      terminalAccent: '#67e8f9',
      backgroundPattern:
        'radial-gradient(circle at 15% 12%, rgba(103, 232, 249, 0.12), transparent 30%), radial-gradient(circle at 82% 8%, rgba(167, 139, 250, 0.15), transparent 34%)',
    },
  },
  'midnight-purple': {
    id: 'midnight-purple',
    label: 'Midnight Purple',
    description: 'A deep violet AI cockpit with magenta accents.',
    tokens: {
      background: '#080612',
      surface: '#141026',
      surfaceSecondary: '#1d1635',
      border: '#4b347a',
      textPrimary: '#faf7ff',
      textSecondary: '#b9a9e6',
      success: '#34d399',
      warning: '#fbbf24',
      error: '#fb7185',
      accentPrimary: '#9f7aea',
      accentSecondary: '#f0abfc',
      glowPrimary: 'rgba(159, 122, 234, 0.34)',
      glowSecondary: 'rgba(240, 171, 252, 0.18)',
      panelBackground: '#151026',
      panelBorder: '#5a3c8f',
      panelShadow: '0 16px 38px rgba(0, 0, 0, 0.28), 0 0 24px rgba(159, 122, 234, 0.10)',
      panelFilter: 'none',
      activeState: '#2a1d48',
      hoverState: '#21173a',
      textMuted: '#b9a9e6',
      textStrong: '#ffffff',
      aiAccent: '#f0abfc',
      successAccent: '#34d399',
      previewAccent: '#9f7aea',
      terminalAccent: '#c4b5fd',
      backgroundPattern:
        'radial-gradient(circle at 18% 8%, rgba(159, 122, 234, 0.14), transparent 32%), radial-gradient(circle at 85% 18%, rgba(240, 171, 252, 0.10), transparent 36%)',
    },
  },
};

export const THEME_LIST = Object.values(THEMES);

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return Boolean(value && value in THEMES);
}

export function getTheme(value: string | null | undefined): ThemeDefinition {
  return isThemeId(value) ? THEMES[value] : THEMES[DEFAULT_THEME_ID];
}
