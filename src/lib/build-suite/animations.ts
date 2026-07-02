import type { BuildSuiteItem } from './types';

export const animationItems: BuildSuiteItem[] = [
  {
    id: 'minimal-motion',
    label: 'Minimal Motion',
    category: 'Subtle',
    description: 'Small hover, focus, and transition polish only.',
    tags: ['subtle', 'hover', 'transitions'],
    promptInstruction:
      'Use minimal motion with subtle hover states, focus transitions, and no distracting page-level animation.',
    complexity: 'low',
  },
  {
    id: 'dashboard-motion',
    label: 'Dashboard Motion',
    category: 'Product',
    description: 'Polished card, chart, and status transitions.',
    tags: ['dashboard', 'cards', 'status'],
    promptInstruction:
      'Use restrained dashboard motion for cards, status chips, tabs, and progress elements while respecting reduced-motion preferences.',
    complexity: 'medium',
  },
  {
    id: 'expressive-motion',
    label: 'Expressive Motion',
    category: 'Rich',
    description: 'More energetic transitions for playful or consumer apps.',
    tags: ['expressive', 'playful', 'consumer'],
    promptInstruction:
      'Use expressive but tasteful motion for key interactions, selected states, and onboarding-style moments without hurting usability.',
    complexity: 'medium',
  },
  {
    id: 'animated-gradients',
    label: 'Animated Gradients',
    category: 'Rich',
    description: 'Subtle gradient movement for premium hero and status surfaces.',
    tags: ['gradient', 'animated', 'premium'],
    promptInstruction:
      'Use subtle animated gradients only in contained hero or status surfaces, with reduced-motion-friendly fallbacks and no distracting background blobs.',
    complexity: 'medium',
  },
];
