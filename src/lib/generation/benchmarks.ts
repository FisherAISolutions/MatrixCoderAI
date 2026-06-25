export interface GenerationBenchmark {
  id: string;
  displayName: string;
  appType: string;
  prompt: string;
  expectedRoutes: string[];
  forbiddenRoutes: string[];
  expectedCoreFeatures: string[];
}

export const ROUTE_BIAS_FORBIDDEN_ROUTES = [
  '/add-note',
  '/history',
  '/preserve',
  '/names',
] as const;

function withRouteBiasForbidden(routes: string[] = []): string[] {
  return Array.from(new Set([...routes, ...ROUTE_BIAS_FORBIDDEN_ROUTES]));
}

export const GENERATION_BENCHMARKS: GenerationBenchmark[] = [
  {
    id: 'personal-crm',
    displayName: 'Personal CRM',
    appType: 'crm',
    expectedRoutes: ['/', '/contacts', '/companies', '/tasks', '/pipeline'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'dashboard overview cards',
      'contact CRUD with search and status filtering',
      'company CRUD with search',
      'task CRUD with complete/pending filtering',
      'pipeline stages with movable deals',
      'localStorage persistence',
    ],
    prompt: `Build a Personal CRM application using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /contacts
- /companies
- /tasks
- /pipeline

Features:
- Dashboard overview cards for total contacts, open tasks, active deals, and upcoming follow-ups.
- Contacts page with add, edit, delete, search, status filter, and fields for name, email, phone, company, and notes.
- Companies page with add, edit, delete, and search.
- Tasks page with create, complete toggle, edit, delete, and completed/pending filters.
- Pipeline page with Lead, Qualified, Proposal, Negotiation, and Won stages. Allow moving deals between stages.
- Use localStorage persistence, reusable components, empty states, responsive SaaS-style UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'expense-tracker',
    displayName: 'Expense Tracker',
    appType: 'finance',
    expectedRoutes: ['/', '/expenses', '/budgets', '/reports', '/settings'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'expense CRUD with category filtering',
      'budget limits and remaining balance',
      'monthly report summaries',
      'settings for categories and currency',
      'localStorage persistence',
    ],
    prompt: `Build an Expense Tracker using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /expenses
- /budgets
- /reports
- /settings

Features:
- Dashboard with monthly spend, budget remaining, top categories, and recent transactions.
- Expenses page with add, edit, delete, search, category filter, date, merchant, amount, and notes.
- Budgets page with category budgets, progress indicators, and over-budget warnings.
- Reports page with monthly totals, category breakdowns, and simple trend cards.
- Settings page for currency and expense categories.
- Use localStorage persistence, reusable components, empty states, responsive finance UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'inventory-manager',
    displayName: 'Inventory Manager',
    appType: 'operations',
    expectedRoutes: ['/', '/items', '/suppliers', '/stock', '/reports'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'item CRUD with search and category filtering',
      'supplier records',
      'stock adjustments',
      'low-stock alerts',
      'inventory report summaries',
      'localStorage persistence',
    ],
    prompt: `Build an Inventory Manager using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /items
- /suppliers
- /stock
- /reports

Features:
- Dashboard with total SKUs, low-stock items, inventory value, and recent stock adjustments.
- Items page with add, edit, delete, search, category filter, SKU, quantity, reorder point, and unit cost.
- Suppliers page with supplier CRUD and linked item counts.
- Stock page for receiving stock, reducing stock, and recording adjustment reasons.
- Reports page with low-stock, category, and valuation summaries.
- Use localStorage persistence, reusable components, empty states, responsive operations UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'kanban-board',
    displayName: 'Kanban Board',
    appType: 'productivity',
    expectedRoutes: ['/', '/boards', '/backlog', '/team', '/settings'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'board columns',
      'card CRUD',
      'drag or move card workflow',
      'backlog prioritization',
      'team assignment',
      'localStorage persistence',
    ],
    prompt: `Build a Kanban Board using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /boards
- /backlog
- /team
- /settings

Features:
- Dashboard with active board stats, blocked cards, due soon cards, and team workload.
- Boards page with columns for Todo, In Progress, Review, and Done. Add, edit, delete, and move cards between columns.
- Backlog page with prioritized cards and search.
- Team page with assignees and workload cards.
- Settings page for board labels and statuses.
- Use localStorage persistence, reusable components, empty states, responsive productivity UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'booking-scheduler',
    displayName: 'Booking Scheduler',
    appType: 'scheduling',
    expectedRoutes: ['/', '/calendar', '/appointments', '/clients', '/settings'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'calendar overview',
      'appointment CRUD',
      'client records',
      'availability settings',
      'upcoming booking reminders',
      'localStorage persistence',
    ],
    prompt: `Build a Booking Scheduler using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /calendar
- /appointments
- /clients
- /settings

Features:
- Dashboard with today&apos;s appointments, open slots, upcoming bookings, and client count.
- Calendar page with day/week-style schedule cards and appointment placement.
- Appointments page with create, edit, cancel/delete, search, service type, date, time, and client.
- Clients page with client CRUD and contact details.
- Settings page for business hours, services, and default appointment length.
- Use localStorage persistence, reusable components, empty states, responsive scheduler UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'saas-analytics-dashboard',
    displayName: 'SaaS Analytics Dashboard',
    appType: 'analytics',
    expectedRoutes: ['/', '/metrics', '/reports', '/users', '/settings'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'KPI cards',
      'metric trend visualizations',
      'report summaries',
      'user table',
      'settings controls',
      'realistic sample SaaS data',
    ],
    prompt: `Build a SaaS Analytics Dashboard using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /metrics
- /reports
- /users
- /settings

Features:
- Dashboard with MRR, churn, activation, conversion, and recent activity.
- Metrics page with trend cards, comparison panels, and product usage breakdowns.
- Reports page with saved report cards and export-style actions.
- Users page with searchable customer/user table and status filters.
- Settings page with workspace, billing-plan display, and notification toggles.
- Use reusable components, realistic sample data, responsive SaaS-style UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'habit-tracker',
    displayName: 'Habit Tracker',
    appType: 'wellness',
    expectedRoutes: ['/', '/habits', '/today', '/stats', '/settings'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'habit CRUD',
      'daily check-in workflow',
      'streak tracking',
      'stats summaries',
      'settings for categories',
      'localStorage persistence',
    ],
    prompt: `Build a Habit Tracker using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /habits
- /today
- /stats
- /settings

Features:
- Dashboard with active habits, completion rate, current streaks, and today&apos;s focus.
- Habits page with add, edit, delete, search, category, cadence, and goal fields.
- Today page with check-off interactions for daily habits.
- Stats page with streak summaries, completion charts, and category breakdowns.
- Settings page for habit categories and reminder preferences.
- Use localStorage persistence, reusable components, empty states, responsive wellness UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
  {
    id: 'ecommerce-admin',
    displayName: 'Ecommerce Admin',
    appType: 'commerce',
    expectedRoutes: ['/', '/products', '/orders', '/customers', '/promotions'],
    forbiddenRoutes: withRouteBiasForbidden(),
    expectedCoreFeatures: [
      'product CRUD',
      'order management',
      'customer table',
      'promotion controls',
      'sales summary dashboard',
      'localStorage persistence',
    ],
    prompt: `Build an Ecommerce Admin using Next.js 15, TypeScript, Tailwind CSS, and the App Router.

Routes:
- /
- /products
- /orders
- /customers
- /promotions

Features:
- Dashboard with revenue, open orders, low-stock products, and conversion cards.
- Products page with add, edit, delete, search, inventory, price, and status fields.
- Orders page with order list, status updates, totals, and fulfillment actions.
- Customers page with searchable customer records and order counts.
- Promotions page with discount campaign cards and enable/disable controls.
- Use localStorage persistence, reusable components, empty states, responsive commerce admin UI, and loading-safe client components.

Important:
- Preserve route names exactly.
- Do not create /add-note, /history, /preserve, or /names.
- Use src/app only.`,
  },
];

export function getGenerationBenchmark(id: string): GenerationBenchmark | undefined {
  return GENERATION_BENCHMARKS.find((benchmark) => benchmark.id === id);
}
