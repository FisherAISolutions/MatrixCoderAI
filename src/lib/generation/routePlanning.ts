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
  'with',
  'the',
  'responsive',
  'professional',
  'production-quality',
  'preserve',
  'requested',
  'request',
  'route',
  'routes',
  'name',
  'names',
  'exactly',
  'domain',
  'generic',
  'notes-style',
  'primary',
  'secondary',
  'feature',
  'workflow',
  'workflows',
  'mention',
  'mentions',
]);

function toRouteSlug(value: string): string | null {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  if (!slug || !/[a-z0-9]/.test(slug) || GENERIC_PAGE_WORDS.has(slug)) return null;
  return slug;
}

function addUniqueRouteSlug(out: string[], slug: string | null) {
  if (slug && !out.includes(slug)) out.push(slug);
}

function isNegatedRouteMention(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 90), matchIndex);
  return /(?:do not|don't|dont|never|avoid|without|not requested|not part of|not part|unless explicitly|forbidden|forbid)\s+(?:[\w\s-]*?)(?:create|use|add|include|requested|request)?\s*$/i.test(
    before
  );
}

function addRouteMatch(out: string[], value: string, text: string, matchIndex: number) {
  if (isNegatedRouteMention(text, matchIndex)) return;
  addUniqueRouteSlug(out, toRouteSlug(value));
}

function inferForbiddenRouteSlugs(text: string): Set<string> {
  const lower = text.toLowerCase();
  const forbidden = new Set<string>();
  const slashRoute = /\/([a-z0-9-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = slashRoute.exec(lower)) !== null) {
    const before = lower.slice(Math.max(0, match.index - 110), match.index);
    const after = lower.slice(match.index + match[0].length, match.index + match[0].length + 90);
    if (
      /(?:do not|don't|dont|never|avoid|without|not requested|not part of|not part|unless explicitly|forbidden|forbid)\s+(?:[\w\s,/-]*?)(?:create|use|add|include|requested|request)?\s*$/i.test(
        before
      ) ||
      /^\s*(?:is|are|was|were)?\s*(?:not requested|not part of|forbidden|forbid|disallowed|not allowed|excluded)/i.test(
        after
      )
    ) {
      const slug = toRouteSlug(match[1]);
      if (slug) forbidden.add(slug);
    }
  }
  return forbidden;
}

export function inferRequestedRouteSlugs(baseRequest: string): string[] {
  const lower = baseRequest.toLowerCase();
  const out: string[] = [];
  const forbidden = inferForbiddenRouteSlugs(lower);

  let match: RegExpExecArray | null;
  const explicitSlash =
    /(?:route|page|path|url|at|under|to|for)?\s*["'`]\/([a-z0-9-]+)["'`]?/g;
  while ((match = explicitSlash.exec(lower)) !== null) {
    addRouteMatch(out, match[1], lower, match.index);
  }

  const slugBeforeRouteNoun = /\b([a-z][a-z0-9-]*?)\s+(?:page|route|screen|view)\b/g;
  while ((match = slugBeforeRouteNoun.exec(lower)) !== null) {
    const before = lower.slice(Math.max(0, match.index - 8), match.index);
    if (/\b(?:add|edit|new)\s+$/.test(before)) continue;
    addRouteMatch(out, match[1], lower, match.index);
  }

  const routeNounBeforeSlug = /\b(?:page|route|screen|view)\s+["'`]?([a-z][a-z0-9-]*)["'`]?\b/g;
  while ((match = routeNounBeforeSlug.exec(lower)) !== null) {
    addRouteMatch(out, match[1], lower, match.index);
  }

  const listedPages = /\b(?:pages|routes|screens|views)\s*:\s*([^\n.]+)/g;
  while ((match = listedPages.exec(lower)) !== null) {
    if (match[1].includes('/')) {
      const slashRoutes = /\/([a-z0-9-]+)/g;
      let slashMatch: RegExpExecArray | null;
      while ((slashMatch = slashRoutes.exec(match[1])) !== null) {
        addRouteMatch(out, slashMatch[1], lower, match.index + slashMatch.index);
      }
      continue;
    }
    for (const part of match[1].split(/,|;|\band\b/)) {
      const cleaned = part
        .replace(/\bwith\b[\s\S]*$/, '')
        .replace(/\b(page|route|screen|view|homepage|home)\b/g, '')
        .trim();
      addRouteMatch(out, cleaned, lower, match.index);
    }
  }

  const addEntityPage = /\badd\s+([a-z][a-z0-9-]*)\s+(?:page|route|screen|view)\b/g;
  while ((match = addEntityPage.exec(lower)) !== null) {
    addRouteMatch(out, `add-${match[1]}`, lower, match.index);
  }

  return out.filter((slug) => !forbidden.has(slug));
}

function inferAddRoutePath(baseRequest: string): string | null {
  const explicitAddSlug = inferRequestedRouteSlugs(baseRequest).find((slug) =>
    slug === 'add' || slug.startsWith('add-')
  );
  if (explicitAddSlug) return `src/app/${explicitAddSlug}/page.tsx`;
  return null;
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
