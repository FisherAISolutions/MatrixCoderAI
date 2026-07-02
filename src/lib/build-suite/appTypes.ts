import type { BuildSuiteItem } from './types';

export const appTypeItems: BuildSuiteItem[] = [
  {
    id: 'personal-crm',
    label: 'Personal CRM',
    category: 'Business',
    description: 'Manage contacts, companies, follow-ups, tasks, and pipeline stages.',
    tags: ['crm', 'contacts', 'pipeline', 'tasks'],
    promptInstruction:
      'Build a Personal CRM with dashboard metrics, contacts, companies, tasks, and a pipeline workflow.',
    complexity: 'high',
  },
  {
    id: 'fitness-tracker',
    label: 'Fitness Tracker',
    category: 'Wellness',
    description: 'Track workouts, progress, goals, nutrition, and training sessions.',
    tags: ['fitness', 'workouts', 'progress', 'goals'],
    promptInstruction:
      'Build a fitness tracker with workout logging, progress review, goal tracking, and helpful summary metrics.',
    complexity: 'medium',
  },
  {
    id: 'expense-tracker',
    label: 'Expense Tracker',
    category: 'Finance',
    description: 'Track transactions, budgets, reports, categories, and spending trends.',
    tags: ['finance', 'expenses', 'budgets', 'reports'],
    promptInstruction:
      'Build an expense tracker with transaction entry, budget tracking, reports, categories, and local summaries.',
    complexity: 'medium',
  },
  {
    id: 'inventory-manager',
    label: 'Inventory Manager',
    category: 'Operations',
    description: 'Manage stock, products, suppliers, low-stock alerts, and reports.',
    tags: ['inventory', 'operations', 'stock', 'suppliers'],
    promptInstruction:
      'Build an inventory manager with item tracking, suppliers, stock movement, low-stock states, and reports.',
    complexity: 'high',
  },
  {
    id: 'booking-scheduler',
    label: 'Booking Scheduler',
    category: 'Scheduling',
    description: 'Schedule appointments, clients, availability, reminders, and calendar views.',
    tags: ['booking', 'calendar', 'appointments', 'clients'],
    promptInstruction:
      'Build a booking scheduler with appointments, clients, availability blocks, calendar views, and status management.',
    complexity: 'high',
  },
  {
    id: 'saas-dashboard',
    label: 'SaaS Dashboard',
    category: 'Analytics',
    description: 'Show metrics, charts, reports, users, activity, and operational insights.',
    tags: ['saas', 'analytics', 'dashboard', 'metrics'],
    promptInstruction:
      'Build a SaaS analytics dashboard with metrics, charts, reports, users, activity tables, and settings.',
    complexity: 'medium',
  },
];
