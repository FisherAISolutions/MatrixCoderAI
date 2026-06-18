export const STYLE_INSPIRATION_BUCKET = 'style-inspiration';
export const STYLE_INSPIRATION_PREFILL_KEY = 'matrix-coder:style-inspiration-prefill';
export const MAX_STYLE_SCREENSHOTS = 5;
export const MAX_STYLE_IMAGE_BYTES = 5 * 1024 * 1024;

export type StyleBrief = {
  summary: string;
  visualDirection: string;
  colorPalette: string[];
  typography: string;
  layout: string;
  components: string[];
  interactions: string[];
  implementationNotes: string[];
  avoid: string[];
};

export type StyleProfileDraft = {
  title: string;
  appName: string;
  feedback: string;
  styleBrief: StyleBrief;
  promptBlock: string;
};

export type StyleProfile = StyleProfileDraft & {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type StyleImageLike = {
  name: string;
  type: string;
  size: number;
};

export function validateStyleImage(file: StyleImageLike): string | null {
  if (!file.type.startsWith('image/')) {
    return `${file.name} is not an image file.`;
  }

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return `${file.name} must be a PNG, JPG, or WebP image.`;
  }

  if (file.size > MAX_STYLE_IMAGE_BYTES) {
    return `${file.name} is larger than 5MB.`;
  }

  return null;
}

export function buildTemporaryStyleImagePath(userId: string, fileName: string): string {
  const safeName = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'screenshot';

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/temp/${unique}-${safeName}`;
}

export function normalizeStyleBrief(input: Partial<StyleBrief> | null | undefined): StyleBrief {
  return {
    summary: sanitizeText(input?.summary) || 'A polished visual direction based on the uploaded references.',
    visualDirection:
      sanitizeText(input?.visualDirection) ||
      'Use the screenshots as inspiration for mood, hierarchy, and interaction patterns while creating an original product UI.',
    colorPalette: normalizeList(input?.colorPalette, ['Balanced neutrals', 'One strong accent color']),
    typography:
      sanitizeText(input?.typography) ||
      'Use clear, modern type with strong hierarchy and readable body copy.',
    layout:
      sanitizeText(input?.layout) ||
      'Use responsive sections with clear navigation, scannable content groups, and practical spacing.',
    components: normalizeList(input?.components, ['Navigation', 'Cards', 'Forms', 'Action buttons']),
    interactions: normalizeList(input?.interactions, ['Hover states', 'Focus states', 'Responsive navigation']),
    implementationNotes: normalizeList(input?.implementationNotes, [
      'Use Tailwind CSS utilities.',
      'Keep route pages as Server Components unless client behavior is required.',
    ]),
    avoid: normalizeList(input?.avoid, [
      'Do not copy proprietary branding, logos, exact copy, or protected assets.',
      'Do not recreate the source app exactly.',
    ]),
  };
}

export function styleBriefToMarkdown(brief: StyleBrief): string {
  return [
    `Summary: ${brief.summary}`,
    `Visual direction: ${brief.visualDirection}`,
    `Color palette: ${brief.colorPalette.join(', ')}`,
    `Typography: ${brief.typography}`,
    `Layout: ${brief.layout}`,
    `Components: ${brief.components.join(', ')}`,
    `Interactions: ${brief.interactions.join(', ')}`,
    `Implementation notes: ${brief.implementationNotes.join(' ')}`,
    `Avoid: ${brief.avoid.join(' ')}`,
  ].join('\n');
}

export function storeStylePromptForWorkspace(prompt: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = prompt.trim();
  if (!trimmed) return;
  window.localStorage.setItem(STYLE_INSPIRATION_PREFILL_KEY, trimmed);
}

export function consumeStylePromptForWorkspace(): string | null {
  if (typeof window === 'undefined') return null;
  const prompt = window.localStorage.getItem(STYLE_INSPIRATION_PREFILL_KEY);
  if (prompt) {
    window.localStorage.removeItem(STYLE_INSPIRATION_PREFILL_KEY);
  }
  return prompt;
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}
