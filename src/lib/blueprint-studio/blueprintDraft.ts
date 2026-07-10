import type { BuildManifest } from '@/lib/build-suite/buildManifest';

export const BLUEPRINT_DRAFT_STORAGE_KEY = 'matrix-blueprint-studio:draft';
export const BLUEPRINT_DRAFT_METADATA_VERSION = '2026-07-08';

export type BlueprintDraftListKey =
  | 'components'
  | 'integrations'
  | 'userRoles'
  | 'navigation'
  | 'folderStructure';

export type BlueprintWarningSeverity = 'info' | 'warning' | 'error';

export interface BlueprintDraftItem {
  id: string;
  name: string;
  description?: string;
}

export interface BlueprintRouteItem extends BlueprintDraftItem {
  path: string;
}

export interface BlueprintDataModel extends BlueprintDraftItem {
  fields: string[];
}

export interface BlueprintWarning {
  code:
    | 'duplicate-route'
    | 'empty-route'
    | 'missing-home-route'
    | 'missing-dashboard-route'
    | 'auth-without-user-model'
    | 'stripe-without-billing-model';
  message: string;
  severity: BlueprintWarningSeverity;
  target?: string;
}

export interface BlueprintDraft {
  id: string;
  projectName: string;
  appDescription: string;
  routes: BlueprintRouteItem[];
  dataModels: BlueprintDataModel[];
  components: BlueprintDraftItem[];
  integrations: BlueprintDraftItem[];
  userRoles: BlueprintDraftItem[];
  navigation: BlueprintDraftItem[];
  folderStructure: BlueprintDraftItem[];
  deploymentTarget: string;
  sourceManifest?: BuildManifest;
  createdAt: string;
  updatedAt: string;
  metadataVersion: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function toIso(now: Date): string {
  return now.toISOString();
}

function createId(prefix: string, now: Date): string {
  return `${prefix}-${now.getTime().toString(36)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeBlueprintRoutePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return collapsed || '/';
}

function labelFromRoute(path: string): string {
  const normalized = normalizeBlueprintRoutePath(path);
  if (normalized === '/') return 'Home';
  return normalized
    .slice(1)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function itemFromName(prefix: string, name: string, description?: string): BlueprintDraftItem {
  return {
    id: `${prefix}-${slugify(name) || 'item'}`,
    name,
    description,
  };
}

function routeFromPath(path: string): BlueprintRouteItem {
  const normalized = normalizeBlueprintRoutePath(path);
  return {
    id: `route-${slugify(normalized === '/' ? 'home' : normalized) || 'home'}`,
    name: labelFromRoute(normalized),
    path: normalized,
  };
}

function inferRoutesFromManifest(manifest?: BuildManifest | null): BlueprintRouteItem[] {
  const routePaths = new Set<string>(['/']);
  const appTypeId = manifest?.appType?.id ?? manifest?.selection.appTypeId ?? '';
  const appTypeLabel = manifest?.appType?.label ?? '';
  const manifestText = [
    appTypeId,
    appTypeLabel,
    manifest?.layout?.id,
    manifest?.layout?.label,
    manifest?.navigation.inferredPattern,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(crm|customer|contact)\b/.test(manifestText)) {
    ['/contacts', '/companies', '/tasks', '/pipeline'].forEach((route) =>
      routePaths.add(route)
    );
  } else if (/\b(ecommerce|commerce|store|shop)\b/.test(manifestText)) {
    ['/products', '/orders', '/customers'].forEach((route) =>
      routePaths.add(route)
    );
  } else if (/\b(fitness|wellness|habit)\b/.test(manifestText)) {
    ['/workouts', '/progress'].forEach((route) => routePaths.add(route));
  }

  if (/\b(dashboard|analytics|admin|saas)\b/.test(manifestText)) {
    routePaths.add('/dashboard');
  }

  return Array.from(routePaths).map(routeFromPath);
}

function inferModelsFromManifest(manifest?: BuildManifest | null): BlueprintDataModel[] {
  const appTypeText = [
    manifest?.appType?.id,
    manifest?.appType?.label,
    manifest?.selection.appTypeId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(crm|customer|contact)\b/.test(appTypeText)) {
    return [
      { id: 'model-contact', name: 'Contact', fields: ['name', 'email', 'phone', 'company', 'status', 'notes'] },
      { id: 'model-company', name: 'Company', fields: ['name', 'website', 'industry', 'notes'] },
      { id: 'model-task', name: 'Task', fields: ['title', 'dueDate', 'status', 'contactId'] },
      { id: 'model-deal', name: 'Deal', fields: ['name', 'stage', 'value', 'companyId'] },
    ];
  }

  if (/\b(ecommerce|commerce|store|shop)\b/.test(appTypeText)) {
    return [
      { id: 'model-product', name: 'Product', fields: ['name', 'price', 'stock', 'status'] },
      { id: 'model-order', name: 'Order', fields: ['customer', 'total', 'status', 'createdAt'] },
      { id: 'model-customer', name: 'Customer', fields: ['name', 'email', 'orders'] },
    ];
  }

  if (/\b(fitness|wellness|habit)\b/.test(appTypeText)) {
    return [
      { id: 'model-session', name: 'Session', fields: ['title', 'date', 'duration', 'notes'] },
      { id: 'model-progress', name: 'Progress Entry', fields: ['date', 'metric', 'value'] },
    ];
  }

  const modelName = manifest?.appType?.label
    ? `${manifest.appType.label} Record`
    : 'App Record';
  return [
    {
      id: `model-${slugify(modelName) || 'record'}`,
      name: modelName,
      fields: ['id', 'name', 'status', 'notes'],
    },
  ];
}

function inferDescription(manifest?: BuildManifest | null): string {
  const appName = manifest?.appType?.label ?? 'custom application';
  const style = manifest?.uiStyle?.label ?? 'production-ready';
  const layout = manifest?.layout?.label ?? 'responsive';
  return `Build a ${style} ${appName} with a ${layout} layout, typed data models, reusable components, and clear App Router pages.`;
}

export function createBlueprintDraftFromManifest(
  manifest?: BuildManifest | null,
  now = new Date()
): BlueprintDraft {
  const timestamp = toIso(now);
  const routes = inferRoutesFromManifest(manifest);
  const appName = manifest?.appType?.label ?? 'Matrix App';
  const components = manifest?.components.length
    ? manifest.components.map((item) =>
        itemFromName('component', item.label, item.promptInstruction)
      )
    : [itemFromName('component', 'App Shell', 'Shared application shell and navigation.')];
  const integrations = manifest?.integrations.map((item) =>
    itemFromName('integration', item.label, item.promptInstruction)
  ) ?? [];

  return {
    id: createId('blueprint', now),
    projectName: appName,
    appDescription: inferDescription(manifest),
    routes,
    dataModels: inferModelsFromManifest(manifest),
    components,
    integrations,
    userRoles: [itemFromName('role', 'Admin'), itemFromName('role', 'User')],
    navigation: routes.map((route) =>
      itemFromName('navigation', route.name, `Link to ${route.path}`)
    ),
    folderStructure: [
      itemFromName('folder', 'src/app', 'App Router pages and layouts.'),
      itemFromName('folder', 'src/components', 'Reusable server and client components.'),
      itemFromName('folder', 'src/lib', 'Domain logic, storage, and helpers.'),
      itemFromName('folder', 'src/types', 'Shared TypeScript types.'),
    ],
    deploymentTarget: 'Next.js web app',
    ...(manifest ? { sourceManifest: manifest } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    metadataVersion: BLUEPRINT_DRAFT_METADATA_VERSION,
  };
}

export function touchBlueprintDraft(draft: BlueprintDraft, now = new Date()): BlueprintDraft {
  return { ...draft, updatedAt: toIso(now) };
}

export function addBlueprintRoute(
  draft: BlueprintDraft,
  path: string,
  now = new Date()
): BlueprintDraft {
  const normalized = normalizeBlueprintRoutePath(path);
  const route = normalized
    ? routeFromPath(normalized)
    : { id: createId('route', now), name: 'New Route', path: '' };
  return touchBlueprintDraft({ ...draft, routes: [...draft.routes, route] }, now);
}

export function updateBlueprintRoute(
  draft: BlueprintDraft,
  id: string,
  patch: Partial<Pick<BlueprintRouteItem, 'name' | 'path' | 'description'>>,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    {
      ...draft,
      routes: draft.routes.map((route) =>
        route.id === id ? { ...route, ...patch } : route
      ),
    },
    now
  );
}

export function removeBlueprintRoute(
  draft: BlueprintDraft,
  id: string,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    { ...draft, routes: draft.routes.filter((route) => route.id !== id) },
    now
  );
}

export function reorderBlueprintRoutes(
  draft: BlueprintDraft,
  id: string,
  direction: -1 | 1,
  now = new Date()
): BlueprintDraft {
  const routes = [...draft.routes];
  const index = routes.findIndex((route) => route.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= routes.length) return draft;
  [routes[index], routes[nextIndex]] = [routes[nextIndex], routes[index]];
  return touchBlueprintDraft({ ...draft, routes }, now);
}

export function addBlueprintDataModel(
  draft: BlueprintDraft,
  name: string,
  fields: string[] = [],
  now = new Date()
): BlueprintDraft {
  const model: BlueprintDataModel = {
    id: createId('model', now),
    name,
    fields,
  };
  return touchBlueprintDraft({ ...draft, dataModels: [...draft.dataModels, model] }, now);
}

export function updateBlueprintDataModel(
  draft: BlueprintDraft,
  id: string,
  patch: Partial<Pick<BlueprintDataModel, 'name' | 'description' | 'fields'>>,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    {
      ...draft,
      dataModels: draft.dataModels.map((model) =>
        model.id === id ? { ...model, ...patch } : model
      ),
    },
    now
  );
}

export function removeBlueprintDataModel(
  draft: BlueprintDraft,
  id: string,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    { ...draft, dataModels: draft.dataModels.filter((model) => model.id !== id) },
    now
  );
}

export function addBlueprintListItem(
  draft: BlueprintDraft,
  key: BlueprintDraftListKey,
  name: string,
  now = new Date()
): BlueprintDraft {
  const item = {
    id: createId(key, now),
    name,
  };
  return touchBlueprintDraft({ ...draft, [key]: [...draft[key], item] }, now);
}

export function updateBlueprintListItem(
  draft: BlueprintDraft,
  key: BlueprintDraftListKey,
  id: string,
  patch: Partial<BlueprintDraftItem>,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    {
      ...draft,
      [key]: draft[key].map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    },
    now
  );
}

export function removeBlueprintListItem(
  draft: BlueprintDraft,
  key: BlueprintDraftListKey,
  id: string,
  now = new Date()
): BlueprintDraft {
  return touchBlueprintDraft(
    { ...draft, [key]: draft[key].filter((item) => item.id !== id) },
    now
  );
}

export function reorderBlueprintListItem(
  draft: BlueprintDraft,
  key: BlueprintDraftListKey,
  id: string,
  direction: -1 | 1,
  now = new Date()
): BlueprintDraft {
  const items = [...draft[key]];
  const index = items.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return draft;
  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  return touchBlueprintDraft({ ...draft, [key]: items }, now);
}

export function validateBlueprintDraft(draft: BlueprintDraft): BlueprintWarning[] {
  const warnings: BlueprintWarning[] = [];
  const normalizedRoutes = draft.routes.map((route) =>
    normalizeBlueprintRoutePath(route.path)
  );
  const seenRoutes = new Set<string>();

  normalizedRoutes.forEach((path, index) => {
    if (!path) {
      warnings.push({
        code: 'empty-route',
        severity: 'error',
        target: draft.routes[index]?.id,
        message: 'Route paths cannot be empty.',
      });
      return;
    }
    if (seenRoutes.has(path)) {
      warnings.push({
        code: 'duplicate-route',
        severity: 'error',
        target: path,
        message: `Duplicate route detected: ${path}.`,
      });
    }
    seenRoutes.add(path);
  });

  if (!seenRoutes.has('/')) {
    warnings.push({
      code: 'missing-home-route',
      severity: 'error',
      message: 'Blueprint should include the home route (/).',
    });
  }

  const appText = [
    draft.projectName,
    draft.appDescription,
    draft.sourceManifest?.appType?.id,
    draft.sourceManifest?.appType?.label,
    draft.sourceManifest?.layout?.id,
    draft.sourceManifest?.layout?.label,
    draft.sourceManifest?.navigation.inferredPattern,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(dashboard|analytics|admin|saas)\b/.test(appText) && !seenRoutes.has('/dashboard')) {
    warnings.push({
      code: 'missing-dashboard-route',
      severity: 'warning',
      message: 'Dashboard-style apps usually need a /dashboard route.',
    });
  }

  const integrationText = draft.integrations
    .map((item) => `${item.id} ${item.name}`)
    .join(' ')
    .toLowerCase();
  const modelText = draft.dataModels
    .map((model) => `${model.name} ${model.fields.join(' ')}`)
    .join(' ')
    .toLowerCase();

  if (/\b(auth|clerk)\b/.test(integrationText) && !/\b(user|profile|account)\b/.test(modelText)) {
    warnings.push({
      code: 'auth-without-user-model',
      severity: 'warning',
      message: 'Auth is selected, but no user/profile model is defined.',
    });
  }

  if (/\bstripe\b/.test(integrationText) && !/\b(billing|subscription|plan|invoice|payment)\b/.test(modelText)) {
    warnings.push({
      code: 'stripe-without-billing-model',
      severity: 'warning',
      message: 'Stripe is selected, but no billing or subscription model is defined.',
    });
  }

  return warnings;
}

function listItems(items: BlueprintDraftItem[]): string {
  return items.length
    ? items.map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ''}`).join('\n')
    : '- None specified';
}

export function buildBlueprintGenerationPrompt(draft: BlueprintDraft): string {
  const routes = draft.routes
    .map((route) => `${normalizeBlueprintRoutePath(route.path) || '(empty route)'} - ${route.name}`)
    .join('\n');
  const models = draft.dataModels
    .map((model) => `- ${model.name}: ${model.fields.join(', ') || 'fields to infer safely'}`)
    .join('\n');

  return [
    `Build ${draft.projectName} from this approved Blueprint Draft.`,
    '',
    draft.appDescription,
    '',
    'Use this blueprint as the authoritative structure. Preserve route names exactly and do not create extra primary routes unless they are required for framework basics.',
    '',
    'Routes:',
    routes || '- / - Home',
    '',
    'Data models:',
    models || '- App Record: id, name, status, notes',
    '',
    'Components:',
    listItems(draft.components),
    '',
    'Integrations:',
    listItems(draft.integrations),
    '',
    'User roles:',
    listItems(draft.userRoles),
    '',
    'Navigation:',
    listItems(draft.navigation),
    '',
    'Folder structure:',
    listItems(draft.folderStructure),
    '',
    `Deployment target: ${draft.deploymentTarget || 'Next.js web app'}`,
    '',
    'Technical requirements:',
    '- Use Next.js App Router with src/app only.',
    '- Keep app route page.tsx files as Server Components.',
    "- Put hooks, forms, state, browser APIs, and localStorage inside 'use client' child components.",
    '- Use TypeScript strict-friendly code and reusable components.',
    '- Build a complete, responsive, production-quality app from the blueprint.',
  ].join('\n');
}

export function createBlueprintDraftPlanningContext(draft: BlueprintDraft): string {
  return [
    '## Matrix Blueprint Draft',
    '',
    'Use this editable Blueprint Draft as the authoritative planning context. It supersedes the natural-language prompt and any older Build Manifest details when they conflict.',
    '',
    '```json',
    JSON.stringify(draft, null, 2),
    '```',
  ].join('\n');
}

export function serializeBlueprintDraft(draft: BlueprintDraft): string {
  return JSON.stringify(draft);
}

export function deserializeBlueprintDraft(raw: string): BlueprintDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BlueprintDraft>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      typeof parsed.appDescription !== 'string' ||
      !Array.isArray(parsed.routes) ||
      !Array.isArray(parsed.dataModels) ||
      !Array.isArray(parsed.components) ||
      !Array.isArray(parsed.integrations) ||
      !Array.isArray(parsed.userRoles) ||
      !Array.isArray(parsed.navigation) ||
      !Array.isArray(parsed.folderStructure) ||
      typeof parsed.deploymentTarget !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    return parsed as BlueprintDraft;
  } catch {
    return null;
  }
}

export function saveBlueprintDraft(
  storage: Pick<StorageLike, 'setItem'>,
  draft: BlueprintDraft
): void {
  storage.setItem(BLUEPRINT_DRAFT_STORAGE_KEY, serializeBlueprintDraft(draft));
}

export function loadBlueprintDraft(
  storage: Pick<StorageLike, 'getItem'>
): BlueprintDraft | null {
  const raw = storage.getItem(BLUEPRINT_DRAFT_STORAGE_KEY);
  return raw ? deserializeBlueprintDraft(raw) : null;
}

export function clearBlueprintDraft(storage: Pick<StorageLike, 'removeItem'>): void {
  storage.removeItem(BLUEPRINT_DRAFT_STORAGE_KEY);
}
