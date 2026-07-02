import type { BuildSuiteItem } from './types';

export const styleItems: BuildSuiteItem[] = [
  {
    id: 'quiet-saas',
    label: 'Quiet SaaS',
    category: 'Product',
    description: 'Restrained, dense, and work-focused interface styling.',
    tags: ['saas', 'professional', 'dense'],
    promptInstruction:
      'Use quiet SaaS styling: compact navigation, restrained cards, clear labels, dense but readable data areas, and minimal decoration.',
    complexity: 'low',
  },
  {
    id: 'editorial-product',
    label: 'Editorial Product',
    category: 'Product',
    description: 'Large typography and polished content-led sections.',
    tags: ['editorial', 'marketing', 'polished'],
    promptInstruction:
      'Use editorial product styling with strong typography, generous spacing, and polished sections while keeping the app itself usable.',
    complexity: 'medium',
  },
  {
    id: 'operational-dashboard',
    label: 'Operational Dashboard',
    category: 'Dashboard',
    description: 'Charts, tables, status chips, and scannable control panels.',
    tags: ['dashboard', 'tables', 'charts'],
    promptInstruction:
      'Use operational dashboard styling with metric cards, tables, filters, status chips, and clear data hierarchy.',
    complexity: 'medium',
  },
  {
    id: 'mobile-app-polish',
    label: 'Mobile App Polish',
    category: 'Mobile',
    description: 'App-like spacing, bottom-safe actions, and touch-friendly controls.',
    tags: ['mobile', 'touch', 'app'],
    promptInstruction:
      'Use mobile-app polish with touch-friendly controls, strong spacing, sticky actions where useful, and responsive mobile-first layout.',
    complexity: 'medium',
  },
];
