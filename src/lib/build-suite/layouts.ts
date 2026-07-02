import type { BuildSuiteItem } from './types';

export const layoutItems: BuildSuiteItem[] = [
  {
    id: 'sidebar-workspace',
    label: 'Sidebar Workspace',
    category: 'Navigation',
    description: 'Persistent sidebar with primary routes and dense workspace content.',
    tags: ['sidebar', 'workspace', 'routes'],
    promptInstruction:
      'Use a sidebar workspace layout with persistent primary navigation, a compact top status area, and route-specific content panes.',
    complexity: 'medium',
  },
  {
    id: 'top-nav-dashboard',
    label: 'Top Nav Dashboard',
    category: 'Navigation',
    description: 'Header navigation with dashboard sections and responsive grids.',
    tags: ['top-nav', 'dashboard', 'responsive'],
    promptInstruction:
      'Use a top navigation dashboard layout with a branded header, primary route links, summary cards, and responsive content grids.',
    complexity: 'low',
  },
  {
    id: 'split-command-center',
    label: 'Split Command Center',
    category: 'Dashboard',
    description: 'Two-column command center with controls beside live results.',
    tags: ['split', 'controls', 'command-center'],
    promptInstruction:
      'Use a split command-center layout with inputs and controls on one side and live summaries, tables, or workflow results on the other.',
    complexity: 'medium',
  },
  {
    id: 'mobile-tabs',
    label: 'Mobile Tabs',
    category: 'Mobile',
    description: 'Mobile-first tabbed layout that scales into desktop panels.',
    tags: ['mobile', 'tabs', 'touch'],
    promptInstruction:
      'Use a mobile-first tabbed layout with touch-friendly tabs, stacked cards on small screens, and wider multi-column panels on desktop.',
    complexity: 'medium',
  },
  {
    id: 'bento-dashboard',
    label: 'Bento Dashboard',
    category: 'Dashboard',
    description: 'Modular dashboard blocks arranged as a polished bento grid.',
    tags: ['bento', 'dashboard', 'cards'],
    promptInstruction:
      'Use a bento dashboard layout with modular metric blocks, asymmetrical but stable grid areas, and clear responsive stacking.',
    complexity: 'medium',
  },
  {
    id: 'landing-page',
    label: 'Landing Page',
    category: 'Marketing',
    description: 'A strong first screen with direct entry into the app workflow.',
    tags: ['landing', 'hero', 'cta'],
    promptInstruction:
      'Use a landing-page layout with a polished first screen, clear primary calls-to-action, and visible links into the real app routes.',
    complexity: 'medium',
  },
];
