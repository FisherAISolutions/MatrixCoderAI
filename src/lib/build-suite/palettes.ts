import type { BuildSuiteAppearance, BuildSuiteItem } from './types';

export const paletteItems: BuildSuiteItem[] = [
  {
    id: 'light-saas-blue',
    label: 'SaaS Blue',
    category: 'Light',
    description: 'Clean white surfaces with blue accents and crisp SaaS contrast.',
    tags: ['light', 'blue', 'saas', 'clean'],
    promptInstruction:
      'Use a light SaaS palette with white surfaces, soft blue accents, subtle borders, and readable dark text.',
    compatibleWith: { appearances: ['light'] },
    complexity: 'low',
  },
  {
    id: 'light-emerald-office',
    label: 'Emerald Office',
    category: 'Light',
    description: 'Professional light UI with emerald success accents and airy sections.',
    tags: ['light', 'emerald', 'professional'],
    promptInstruction:
      'Use a light professional palette with emerald accents, white cards, pale neutral backgrounds, and clear focus states.',
    compatibleWith: { appearances: ['light'] },
    complexity: 'low',
  },
  {
    id: 'light-warm-product',
    label: 'Warm Product',
    category: 'Light',
    description: 'Soft light product palette with warm highlights and balanced contrast.',
    tags: ['light', 'warm', 'product'],
    promptInstruction:
      'Use a light warm product palette with off-white sections, restrained amber highlights, and accessible text contrast.',
    compatibleWith: { appearances: ['light'] },
    complexity: 'low',
  },
  {
    id: 'dark-matrix-green',
    label: 'Matrix Green',
    category: 'Dark',
    description: 'Dark terminal-inspired surfaces with electric green accents.',
    tags: ['dark', 'matrix', 'green', 'terminal'],
    promptInstruction:
      'Use a dark Matrix-inspired palette with near-black backgrounds, green accents, glowing borders, and high-contrast text.',
    compatibleWith: { appearances: ['dark'] },
    complexity: 'low',
  },
  {
    id: 'dark-slate-cyan',
    label: 'Slate Cyan',
    category: 'Dark',
    description: 'Dark slate UI with cyan highlights and modern dashboard contrast.',
    tags: ['dark', 'slate', 'cyan', 'dashboard'],
    promptInstruction:
      'Use a dark slate palette with cyan highlights, layered panels, glassy borders, and consistent dark page sections.',
    compatibleWith: { appearances: ['dark'] },
    complexity: 'low',
  },
  {
    id: 'dark-purple-lime',
    label: 'Purple Lime',
    category: 'Dark',
    description: 'Deep dark UI with purple depth and lime action accents.',
    tags: ['dark', 'purple', 'lime', 'modern'],
    promptInstruction:
      'Use a deep dark palette with restrained purple depth, lime action accents, and polished card contrast.',
    compatibleWith: { appearances: ['dark'] },
    complexity: 'low',
  },
];

export function filterPalettesByAppearance<T extends BuildSuiteItem>(
  appearance: BuildSuiteAppearance,
  palettes: T[] = paletteItems as T[]
): T[] {
  return palettes.filter((palette) =>
    palette.compatibleWith?.appearances?.includes(appearance)
  );
}
