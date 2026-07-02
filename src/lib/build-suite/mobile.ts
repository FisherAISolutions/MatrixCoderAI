import type { BuildSuiteItem } from './types';

export const mobileItems: BuildSuiteItem[] = [
  {
    id: 'responsive-web',
    label: 'Responsive Web',
    category: 'Web',
    description: 'Responsive desktop and mobile layouts using standard web patterns.',
    tags: ['responsive', 'web', 'desktop'],
    promptInstruction:
      'Make the app fully responsive for mobile and desktop with stable layouts, readable text, and no horizontal overflow.',
    complexity: 'low',
  },
  {
    id: 'mobile-first',
    label: 'Mobile First',
    category: 'Mobile',
    description: 'Phone-first hierarchy with touch targets and stacked workflows.',
    tags: ['mobile', 'touch', 'stacked'],
    promptInstruction:
      'Design mobile-first with large touch targets, stacked workflows, compact mobile navigation, and desktop enhancements above tablet widths.',
    complexity: 'medium',
  },
  {
    id: 'capacitor-ready',
    label: 'Capacitor Ready',
    category: 'Mobile',
    description: 'Web app structure that can later be packaged for Android.',
    tags: ['capacitor', 'android', 'mobile'],
    promptInstruction:
      'Keep the interface Android packaging friendly: responsive, touch-first, no unsupported browser-only assumptions beyond normal web APIs.',
    complexity: 'medium',
  },
];
