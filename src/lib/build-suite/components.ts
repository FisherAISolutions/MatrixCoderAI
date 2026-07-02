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
  {
    id: 'notifications',
    label: 'Notifications',
    category: 'Feedback',
    description: 'Status messages, alerts, reminders, and activity feedback.',
    tags: ['notifications', 'alerts', 'activity'],
    promptInstruction:
      'Include polished notification and activity feedback patterns with status-aware messages, reminders, and readable empty states.',
    complexity: 'medium',
  },
  {
    id: 'floating-cards',
    label: 'Floating Cards',
    category: 'Surface',
    description: 'Layered elevated cards that make complex screens easier to scan.',
    tags: ['cards', 'floating', 'surface'],
    promptInstruction:
      'Use floating cards for key content groups, with stable spacing, clear elevation, and responsive wrapping.',
    complexity: 'low',
  },
  {
    id: 'blur-navigation',
    label: 'Blur Navigation',
    category: 'Navigation',
    description: 'Translucent navigation bars with readable blur-backed surfaces.',
    tags: ['navigation', 'blur', 'glass'],
    promptInstruction:
      'Use blur-backed navigation surfaces where appropriate, keeping text readable and avoiding overlap with page content.',
    complexity: 'medium',
  },
  {
    id: 'soft-shadows',
    label: 'Soft Shadows',
    category: 'Surface',
    description: 'Subtle elevation that keeps cards polished without visual noise.',
    tags: ['shadows', 'surface', 'depth'],
    promptInstruction:
      'Use soft, restrained shadows to separate cards and panels while preserving a clean professional interface.',
    complexity: 'low',
  },
  {
    id: 'search-filters',
    label: 'Search and Filters',
    category: 'Data',
    description: 'Fast search fields, filters, segmented controls, and result counts.',
    tags: ['search', 'filters', 'data'],
    promptInstruction:
      'Include search and filter controls with result counts, clear reset states, and domain-specific filter options.',
    complexity: 'medium',
  },
];
