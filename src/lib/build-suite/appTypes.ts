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
  {
    id: 'ecommerce-store',
    label: 'Ecommerce Store',
    category: 'Commerce',
    description: 'Sell products with catalog browsing, carts, checkout readiness, and admin polish.',
    tags: ['ecommerce', 'store', 'products', 'checkout'],
    promptInstruction:
      'Build an ecommerce store with product browsing, product detail cards, cart-ready flows, customer trust sections, and polished commerce navigation.',
    complexity: 'high',
  },
  {
    id: 'restaurant-pos',
    label: 'Restaurant POS',
    category: 'Operations',
    description: 'Manage orders, tables, menus, kitchen status, and checkout workflows.',
    tags: ['restaurant', 'pos', 'orders', 'menu'],
    promptInstruction:
      'Build a restaurant POS with menu item ordering, table/order status, kitchen queue views, totals, and fast staff workflows.',
    complexity: 'high',
  },
  {
    id: 'school-portal',
    label: 'School Portal',
    category: 'Education',
    description: 'Organize students, classes, assignments, announcements, and dashboards.',
    tags: ['school', 'education', 'students', 'classes'],
    promptInstruction:
      'Build a school portal with dashboards for students/classes, assignments, announcements, schedules, and clear education-focused navigation.',
    complexity: 'high',
  },
  {
    id: 'portfolio-website',
    label: 'Portfolio Website',
    category: 'Creative',
    description: 'Present projects, case studies, services, testimonials, and contact sections.',
    tags: ['portfolio', 'creative', 'projects', 'case-studies'],
    promptInstruction:
      'Build a portfolio website with project showcases, case studies, service highlights, testimonials, and a clear contact workflow.',
    complexity: 'medium',
  },
  {
    id: 'ai-chat-app',
    label: 'AI Chat App',
    category: 'AI',
    description: 'Create a chat workspace with conversations, assistant panels, prompts, and history.',
    tags: ['ai', 'chat', 'assistant', 'messages'],
    promptInstruction:
      'Build an AI chat app interface with conversation threads, message composer, assistant response areas, prompt tools, and useful empty/loading states.',
    complexity: 'high',
  },
];
