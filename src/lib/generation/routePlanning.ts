export interface GenerationBatchLike {
  title: string;
}

const GENERIC_PAGE_WORDS = new Set([
  'home',
  'homepage',
  'landing',
  'root',
  'main',
  'at',
  'to',
  'for',
  'under',
  'responsive',
  'professional',
  'production-quality',
]);

function toRouteSlug(value: string): string | null {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  if (!slug || GENERIC_PAGE_WORDS.has(slug)) return null;
  return slug;
}

function addUniqueRouteSlug(out: string[], slug: string | null) {
  if (slug && !out.includes(slug)) out.push(slug);
}

export function inferRequestedRouteSlugs(baseRequest: string): string[] {
  const lower = baseRequest.toLowerCase();
  const out: string[] = [];

  let match: RegExpExecArray | null;
  const explicitSlash =
    /(?:route|page|path|url|at|under|to|for)?\s*["'`]\/([a-z0-9-]+)["'`]?/g;
  while ((match = explicitSlash.exec(lower)) !== null) {
    addUniqueRouteSlug(out, toRouteSlug(match[1]));
  }

  const slugBeforeRouteNoun = /\b([a-z][a-z0-9-]*?)\s+(?:page|route|path|screen|view)\b/g;
  while ((match = slugBeforeRouteNoun.exec(lower)) !== null) {
    const before = lower.slice(Math.max(0, match.index - 8), match.index);
    if (/\b(?:add|edit|new)\s+$/.test(before)) continue;
    addUniqueRouteSlug(out, toRouteSlug(match[1]));
  }

  const routeNounBeforeSlug = /\b(?:page|route|path|screen|view)\s+["'`]?([a-z][a-z0-9-]*)["'`]?\b/g;
  while ((match = routeNounBeforeSlug.exec(lower)) !== null) {
    addUniqueRouteSlug(out, toRouteSlug(match[1]));
  }

  const listedPages = /\b(?:pages|routes|screens|views)\s*:\s*([^\n.]+)/g;
  while ((match = listedPages.exec(lower)) !== null) {
    for (const part of match[1].split(/,|;|\band\b/)) {
      const cleaned = part
        .replace(/\bwith\b[\s\S]*$/, '')
        .replace(/\b(page|route|screen|view|homepage|home)\b/g, '')
        .trim();
      addUniqueRouteSlug(out, toRouteSlug(cleaned));
    }
  }

  const addEntityPage = /\badd\s+([a-z][a-z0-9-]*)\s+(?:page|route|screen|view)\b/g;
  while ((match = addEntityPage.exec(lower)) !== null) {
    addUniqueRouteSlug(out, toRouteSlug(`add-${match[1]}`));
  }

  return out;
}

function inferAddRoutePath(baseRequest: string): string | null {
  const lower = baseRequest.toLowerCase();
  if (!/\badd\b/.test(lower)) return null;
  const explicitAddSlug = inferRequestedRouteSlugs(baseRequest).find((slug) =>
    slug.startsWith('add-')
  );
  if (explicitAddSlug) return `src/app/${explicitAddSlug}/page.tsx`;
  if (/\badd-note\b|\badd note\b|\bnotes?\b/.test(lower)) {
    return 'src/app/add-note/page.tsx';
  }
  if (/\badd-task\b|\badd task\b|\btasks?\b/.test(lower)) {
    return 'src/app/add-task/page.tsx';
  }
  if (/\badd-entry\b|\badd entry\b|\bentries?\b/.test(lower)) {
    return 'src/app/add-entry/page.tsx';
  }
  return 'src/app/add/page.tsx';
}

export function inferRequiredPathsForBatch(
  baseRequest: string,
  batch: GenerationBatchLike
): string[] {
  const lower = baseRequest.toLowerCase();
  const required: string[] = [];
  const routePaths = inferRequestedRouteSlugs(baseRequest).map(
    (slug) => `src/app/${slug}/page.tsx`
  );

  if (batch.title === 'root page shell') {
    required.push('src/app/page.tsx');
  }

  if (batch.title === 'primary feature routes and shared components') {
    required.push(...routePaths.slice(0, 2));
    if (/\bdashboard\s+(?:page|route|screen|view)\b/.test(lower)) {
      required.push('src/app/dashboard/page.tsx');
    }
  }

  if (batch.title === 'secondary feature routes and workflows') {
    required.push(...routePaths.slice(2));
    const addRoutePath = inferAddRoutePath(baseRequest);
    if (addRoutePath) required.push(addRoutePath);
    if (
      /\b(?:history|archive)\s+(?:page|route|screen|view)\b/.test(lower) ||
      /\bactivity\s+(?:history|log)\b/.test(lower)
    ) {
      required.push('src/app/history/page.tsx');
    }
  }

  return Array.from(new Set(required));
}
