import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from './heuristics';

export interface DuplicateEffectiveRoute {
  route: string;
  paths: string[];
  deletePaths: string[];
}

function isPageFile(path: string): boolean {
  return /^src\/app\/.+\/page\.(?:tsx|jsx|ts|js)$/.test(path) || /^src\/app\/page\.(?:tsx|jsx|ts|js)$/.test(path);
}

export function effectiveAppRoute(path: string): string | null {
  if (!isPageFile(path)) return null;
  const withoutRoot = path
    .replace(/^src\/app\/?/, '')
    .replace(/\/page\.(?:tsx|jsx|ts|js)$/, '')
    .replace(/^page\.(?:tsx|jsx|ts|js)$/, '');
  const segments = withoutRoot
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .filter((segment) => !segment.startsWith('@'));
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

function chooseDeletePaths(paths: string[]): string[] {
  const rootPage = paths.find((path) => /^src\/app\/page\.(?:tsx|jsx|ts|js)$/.test(path));
  const routeGroupPage = paths.find((path) => /^src\/app\/\([^)]+\)\/page\.(?:tsx|jsx|ts|js)$/.test(path));
  if (rootPage && routeGroupPage) return [rootPage];
  return paths.slice(1);
}

export function findDuplicateEffectiveAppRoutes(files: FileNode[]): DuplicateEffectiveRoute[] {
  const byRoute = new Map<string, string[]>();
  for (const file of flattenTree(files)) {
    if (file.type !== 'file') continue;
    const route = effectiveAppRoute(file.path);
    if (!route) continue;
    const paths = byRoute.get(route) ?? [];
    paths.push(file.path);
    byRoute.set(route, paths);
  }

  return Array.from(byRoute.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([route, paths]) => ({
      route,
      paths,
      deletePaths: chooseDeletePaths(paths),
    }));
}
