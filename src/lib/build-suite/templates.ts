import { buildSuiteCatalog, findBuildSuiteItem } from './catalog';
import type {
  BuildSuiteCatalog,
  BuildSuiteSelection,
} from './types';

export interface BuildSuiteTemplatePack {
  id: string;
  label: string;
  category: string;
  description: string;
  tags: string[];
  highlights: string[];
  selection: BuildSuiteSelection;
}

export const buildSuiteTemplatePacks: BuildSuiteTemplatePack[] = [
  {
    id: 'fitness-tracker',
    label: 'Fitness Tracker',
    category: 'Wellness',
    description:
      'A polished training app with workouts, goals, progress charts, and mobile-friendly tracking.',
    tags: ['fitness', 'workouts', 'progress', 'mobile'],
    highlights: ['Workout logging', 'Progress charts', 'Goal tracking'],
    selection: {
      appTypeId: 'fitness-tracker',
      appearance: 'dark',
      paletteId: 'dark-slate-cyan',
      styleId: 'mobile-app-polish',
      layoutId: 'mobile-tabs',
      componentIds: ['forms-crud', 'charts-metrics', 'search-filters'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage'],
      animationId: 'dashboard-motion',
      mobileId: 'mobile-first',
    },
  },
  {
    id: 'personal-crm',
    label: 'Personal CRM',
    category: 'Business',
    description:
      'A relationship workspace with contacts, companies, follow-ups, tasks, and pipeline views.',
    tags: ['crm', 'contacts', 'pipeline', 'tasks'],
    highlights: ['Contact database', 'Pipeline workflow', 'Search and filters'],
    selection: {
      appTypeId: 'personal-crm',
      appearance: 'light',
      paletteId: 'light-saas-blue',
      styleId: 'quiet-saas',
      layoutId: 'crm-layout',
      componentIds: ['data-tables', 'forms-crud', 'search-filters', 'kanban-board'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage', 'csv-export'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'ecommerce-store',
    label: 'Ecommerce Store',
    category: 'Commerce',
    description:
      'A storefront starter with catalog browsing, product cards, checkout-ready sections, and trust content.',
    tags: ['ecommerce', 'store', 'products', 'checkout'],
    highlights: ['Product catalog', 'Pricing/trust sections', 'Commerce navigation'],
    selection: {
      appTypeId: 'ecommerce-store',
      appearance: 'light',
      paletteId: 'light-warm-product',
      styleId: 'luxury',
      layoutId: 'ecommerce-layout',
      componentIds: [
        'hero-sections',
        'navigation-bars',
        'pricing-tables',
        'ratings',
        'testimonials',
      ],
      aiFeatureIds: ['draft-assistant'],
      integrationIds: ['local-storage', 'stripe-ready'],
      animationId: 'scroll-reveal',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'saas-dashboard',
    label: 'SaaS Dashboard',
    category: 'Analytics',
    description:
      'A metric-heavy SaaS command center with charts, tables, users, reports, and status panels.',
    tags: ['saas', 'analytics', 'dashboard', 'metrics'],
    highlights: ['KPI cards', 'Charts and reports', 'Operational tables'],
    selection: {
      appTypeId: 'saas-dashboard',
      appearance: 'dark',
      paletteId: 'dark-slate-cyan',
      styleId: 'operational-dashboard',
      layoutId: 'analytics-layout',
      componentIds: ['charts-metrics', 'data-tables', 'line-charts', 'area-charts'],
      aiFeatureIds: ['smart-summaries', 'natural-language-search'],
      integrationIds: ['mock-api-ready', 'local-storage'],
      animationId: 'dashboard-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'inventory-manager',
    label: 'Inventory Manager',
    category: 'Operations',
    description:
      'An operations dashboard for items, suppliers, stock movement, alerts, and reporting.',
    tags: ['inventory', 'stock', 'suppliers', 'operations'],
    highlights: ['Stock tables', 'Supplier forms', 'Low-stock alerts'],
    selection: {
      appTypeId: 'inventory-manager',
      appearance: 'light',
      paletteId: 'light-emerald-office',
      styleId: 'operational-dashboard',
      layoutId: 'admin-dashboard',
      componentIds: ['data-tables', 'forms-crud', 'notifications', 'bar-charts'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage', 'csv-export'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'restaurant-pos',
    label: 'Restaurant POS',
    category: 'Operations',
    description:
      'A fast staff-facing POS with menu ordering, table status, kitchen queue, and totals.',
    tags: ['restaurant', 'pos', 'orders', 'tables'],
    highlights: ['Menu ordering', 'Kitchen queue', 'Table/order status'],
    selection: {
      appTypeId: 'restaurant-pos',
      appearance: 'dark',
      paletteId: 'dark-purple-lime',
      styleId: 'operational-dashboard',
      layoutId: 'split-command-center',
      componentIds: ['tabs', 'data-tables', 'forms-crud', 'notifications'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'school-portal',
    label: 'School Portal',
    category: 'Education',
    description:
      'A school workspace for students, classes, assignments, schedules, and announcements.',
    tags: ['school', 'students', 'classes', 'assignments'],
    highlights: ['Student dashboard', 'Assignments', 'Announcements'],
    selection: {
      appTypeId: 'school-portal',
      appearance: 'light',
      paletteId: 'light-saas-blue',
      styleId: 'material',
      layoutId: 'admin-dashboard',
      componentIds: ['calendar-schedule', 'data-tables', 'notifications'],
      aiFeatureIds: ['draft-assistant'],
      integrationIds: ['local-storage'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'portfolio-website',
    label: 'Portfolio Website',
    category: 'Creative',
    description:
      'A polished portfolio with project showcases, case studies, testimonials, and contact sections.',
    tags: ['portfolio', 'projects', 'creative', 'case-studies'],
    highlights: ['Project showcases', 'Hero sections', 'Testimonials'],
    selection: {
      appTypeId: 'portfolio-website',
      appearance: 'dark',
      paletteId: 'dark-purple-lime',
      styleId: 'editorial-product',
      layoutId: 'portfolio-layout',
      componentIds: ['hero-sections', 'carousels', 'testimonials', 'faq-sections'],
      aiFeatureIds: ['draft-assistant'],
      integrationIds: ['local-storage'],
      animationId: 'scroll-reveal',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'ai-chat-app',
    label: 'AI Chat App',
    category: 'AI',
    description:
      'A chat workspace with threads, assistant panels, prompt tools, and AI-ready interaction patterns.',
    tags: ['ai', 'chat', 'assistant', 'messages'],
    highlights: ['Chat windows', 'Prompt tools', 'AI-ready layout'],
    selection: {
      appTypeId: 'ai-chat-app',
      appearance: 'dark',
      paletteId: 'dark-matrix-green',
      styleId: 'matrix-interface',
      layoutId: 'ide-layout',
      componentIds: ['chat-windows', 'command-palettes', 'sidebars', 'toasts'],
      aiFeatureIds: ['smart-summaries', 'natural-language-search', 'draft-assistant'],
      integrationIds: ['local-storage', 'openai-ready'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    },
  },
  {
    id: 'booking-scheduler',
    label: 'Booking Scheduler',
    category: 'Scheduling',
    description:
      'A booking app with clients, calendar views, appointment forms, availability, and reminders.',
    tags: ['booking', 'calendar', 'appointments', 'clients'],
    highlights: ['Calendar views', 'Client records', 'Appointment forms'],
    selection: {
      appTypeId: 'booking-scheduler',
      appearance: 'light',
      paletteId: 'light-emerald-office',
      styleId: 'apple-inspired',
      layoutId: 'top-nav-dashboard',
      componentIds: ['calendar-schedule', 'forms-crud', 'notifications', 'data-tables'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage', 'resend-ready'],
      animationId: 'minimal-motion',
      mobileId: 'mobile-first',
    },
  },
];

export function cloneBuildSuiteTemplateSelection(
  template: BuildSuiteTemplatePack
): BuildSuiteSelection {
  return {
    ...template.selection,
    componentIds: [...template.selection.componentIds],
    aiFeatureIds: [...template.selection.aiFeatureIds],
    integrationIds: [...template.selection.integrationIds],
  };
}

export function getBuildSuiteTemplatePack(
  id: string
): BuildSuiteTemplatePack | undefined {
  return buildSuiteTemplatePacks.find((template) => template.id === id);
}

export function validateBuildSuiteTemplatePack(
  template: BuildSuiteTemplatePack,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): string[] {
  const ids = [
    template.selection.appTypeId,
    template.selection.paletteId,
    template.selection.styleId,
    template.selection.layoutId,
    template.selection.animationId,
    template.selection.mobileId,
    ...template.selection.componentIds,
    ...template.selection.aiFeatureIds,
    ...template.selection.integrationIds,
  ].filter((id): id is string => Boolean(id));

  return ids.filter((id) => !findBuildSuiteItem(id, catalog));
}
