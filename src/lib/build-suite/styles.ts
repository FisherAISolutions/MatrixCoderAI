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
  {
    id: 'glassmorphism',
    label: 'Glassmorphism',
    category: 'Premium',
    description: 'Layered translucent surfaces, soft blur, and floating depth.',
    tags: ['glass', 'blur', 'premium', 'floating'],
    promptInstruction:
      'Use glassmorphism styling with translucent panels, subtle backdrop blur, floating cards, soft borders, and strong text contrast.',
    complexity: 'medium',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    category: 'Expressive',
    description: 'High-energy neon contrast with sharp futuristic interface details.',
    tags: ['cyberpunk', 'neon', 'futuristic'],
    promptInstruction:
      'Use cyberpunk styling with restrained neon accents, high-contrast dark surfaces, sharp interface details, and readable controls.',
    complexity: 'high',
  },
  {
    id: 'apple-inspired',
    label: 'Apple Inspired',
    category: 'Premium',
    description: 'Soft minimal surfaces, calm hierarchy, and refined product polish.',
    tags: ['apple', 'minimal', 'premium'],
    promptInstruction:
      'Use Apple-inspired styling with soft surfaces, generous spacing, refined typography, careful hierarchy, and elegant controls.',
    complexity: 'medium',
  },
  {
    id: 'material',
    label: 'Material',
    category: 'System',
    description: 'Familiar elevation, clear actions, and structured component rhythm.',
    tags: ['material', 'system', 'elevation'],
    promptInstruction:
      'Use Material-inspired styling with clear elevation, familiar component rhythm, accessible buttons, and structured forms.',
    complexity: 'low',
  },
  {
    id: 'fluent',
    label: 'Fluent',
    category: 'System',
    description: 'Enterprise-friendly panels with subtle depth and clean controls.',
    tags: ['fluent', 'enterprise', 'system'],
    promptInstruction:
      'Use Fluent-inspired styling with clean enterprise panels, subtle depth, practical controls, and consistent spacing.',
    complexity: 'medium',
  },
  {
    id: 'matrix-interface',
    label: 'Matrix Interface',
    category: 'Matrix',
    description: 'Terminal-inspired command surfaces with luminous system feedback.',
    tags: ['matrix', 'terminal', 'command'],
    promptInstruction:
      'Use Matrix interface styling with terminal-inspired surfaces, luminous borders, compact controls, and precise system feedback.',
    complexity: 'medium',
  },
];
