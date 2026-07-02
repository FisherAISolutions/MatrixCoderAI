import type { BuildSuiteItem } from './types';

export const integrationItems: BuildSuiteItem[] = [
  {
    id: 'local-storage',
    label: 'Local Storage',
    category: 'Persistence',
    description: 'Browser localStorage persistence for generated demo data.',
    tags: ['localStorage', 'persistence', 'offline'],
    promptInstruction:
      'Use browser localStorage for persistence in client components, with loading-safe defaults and no server-side browser API usage.',
    complexity: 'medium',
  },
  {
    id: 'csv-export',
    label: 'CSV Export',
    category: 'Files',
    description: 'Export table or list data into CSV-like downloadable content.',
    tags: ['csv', 'export', 'files'],
    promptInstruction:
      'Add a client-safe CSV export action for the main domain records, with clear disabled and empty states.',
    complexity: 'medium',
  },
  {
    id: 'mock-api-ready',
    label: 'Mock API Ready',
    category: 'API',
    description: 'Use structured data helpers that can later be swapped for an API.',
    tags: ['api-ready', 'mock-data', 'helpers'],
    promptInstruction:
      'Structure demo data and helper functions so they can later be swapped for API calls, while keeping this generation fully local.',
    complexity: 'medium',
  },
  {
    id: 'auth-shell',
    label: 'Auth Shell',
    category: 'Auth',
    description: 'Show signed-in shell states without implementing real auth.',
    tags: ['auth', 'shell', 'user-menu'],
    promptInstruction:
      'Include a signed-in app shell with user menu placeholders and protected-area styling, but do not implement real authentication.',
    complexity: 'low',
  },
];
