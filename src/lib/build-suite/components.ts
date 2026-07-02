import type { BuildSuiteItem } from './types';

export const componentItems: BuildSuiteItem[] = [
  {
    id: 'data-tables',
    label: 'Data Tables',
    category: 'Data',
    description: 'Sortable table-style lists with filters, empty states, and actions.',
    tags: ['tables', 'filters', 'empty-states'],
    promptInstruction:
      'Include polished data tables or table-like lists with filters, empty states, inline actions, and clear row metadata.',
    complexity: 'medium',
  },
  {
    id: 'charts-metrics',
    label: 'Charts and Metrics',
    category: 'Analytics',
    description: 'Metric cards, trend summaries, and lightweight chart sections.',
    tags: ['charts', 'metrics', 'analytics'],
    promptInstruction:
      'Include metric cards, trend summaries, and lightweight chart or progress visualizations that match the selected app domain.',
    complexity: 'medium',
  },
  {
    id: 'forms-crud',
    label: 'Forms and CRUD',
    category: 'Workflow',
    description: 'Add, edit, delete, search, and filter workflows.',
    tags: ['forms', 'crud', 'search', 'filters'],
    promptInstruction:
      'Include complete add, edit, delete, search, and filter workflows with validation-friendly local state and clear form labels.',
    complexity: 'high',
  },
  {
    id: 'calendar-schedule',
    label: 'Calendar Schedule',
    category: 'Scheduling',
    description: 'Calendar-like date selectors, appointments, and schedule cards.',
    tags: ['calendar', 'schedule', 'appointments'],
    promptInstruction:
      'Include calendar or schedule-oriented components with date selection, upcoming items, and status-aware schedule cards.',
    complexity: 'high',
  },
  {
    id: 'kanban-board',
    label: 'Kanban Board',
    category: 'Workflow',
    description: 'Column-based boards for moving items between stages.',
    tags: ['kanban', 'stages', 'drag-ready'],
    promptInstruction:
      'Include a kanban-style board with domain-specific stages, movable cards, status counts, and clear empty columns.',
    complexity: 'high',
  },
];
