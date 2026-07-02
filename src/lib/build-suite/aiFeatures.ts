import type { BuildSuiteItem } from './types';

export const aiFeatureItems: BuildSuiteItem[] = [
  {
    id: 'smart-summaries',
    label: 'Smart Summaries',
    category: 'Assistant',
    description: 'AI-ready summary panels and suggested next actions.',
    tags: ['ai', 'summary', 'recommendations'],
    promptInstruction:
      'Add AI-ready summary panels that present useful insights, suggested next actions, and concise generated-style explanations without calling an API.',
    complexity: 'medium',
  },
  {
    id: 'natural-language-search',
    label: 'Natural Language Search',
    category: 'Search',
    description: 'Search UI designed for plain-language queries.',
    tags: ['ai', 'search', 'query'],
    promptInstruction:
      'Add a natural-language search experience with a polished query input, suggested prompts, and local filtering behavior.',
    complexity: 'medium',
  },
  {
    id: 'draft-assistant',
    label: 'Draft Assistant',
    category: 'Assistant',
    description: 'A drafting panel for messages, notes, plans, or follow-ups.',
    tags: ['ai', 'drafting', 'assistant'],
    promptInstruction:
      'Add an AI-style drafting assistant panel for domain-specific messages, notes, plans, or follow-ups using local demo content only.',
    complexity: 'medium',
  },
];
