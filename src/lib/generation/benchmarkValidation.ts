import type { GenerationBenchmark } from './benchmarks';

export interface BenchmarkValidationIssue {
  type:
    | 'missing-required-route'
    | 'forbidden-route-present'
    | 'root-app-file-present';
  route?: string;
  path?: string;
  message: string;
}

export interface BenchmarkValidationResult {
  ok: boolean;
  issues: BenchmarkValidationIssue[];
}

const PAGE_EXTENSIONS = ['tsx', 'jsx', 'ts', 'js'] as const;

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeRoute(route: string): string {
  if (route === '/') return '/';
  const cleaned = route.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${cleaned}`;
}

function routeSegments(route: string): string {
  const normalized = normalizeRoute(route);
  return normalized === '/' ? '' : normalized.slice(1);
}

function srcRouteCandidates(route: string): string[] {
  const segments = routeSegments(route);
  const base = segments ? `src/app/${segments}/page` : 'src/app/page';
  return PAGE_EXTENSIONS.map((extension) => `${base}.${extension}`);
}

function anyRouteCandidates(route: string): string[] {
  const segments = routeSegments(route);
  const srcBase = segments ? `src/app/${segments}/page` : 'src/app/page';
  const rootBase = segments ? `app/${segments}/page` : 'app/page';
  return PAGE_EXTENSIONS.flatMap((extension) => [
    `${srcBase}.${extension}`,
    `${rootBase}.${extension}`,
  ]);
}

function routeExists(route: string, paths: Set<string>): boolean {
  return srcRouteCandidates(route).some((candidate) => paths.has(candidate));
}

function presentRouteCandidates(route: string, paths: Set<string>): string[] {
  return anyRouteCandidates(route).filter((candidate) => paths.has(candidate));
}

export function validateGeneratedFilesAgainstBenchmark(
  benchmark: GenerationBenchmark,
  generatedFiles: string[]
): BenchmarkValidationResult {
  const paths = new Set(generatedFiles.map(normalizePath));
  const issues: BenchmarkValidationIssue[] = [];

  for (const route of benchmark.expectedRoutes.map(normalizeRoute)) {
    if (!routeExists(route, paths)) {
      issues.push({
        type: 'missing-required-route',
        route,
        path: srcRouteCandidates(route)[0],
        message: `Missing required benchmark route ${route}. Expected a page file such as ${srcRouteCandidates(route)[0]}.`,
      });
    }
  }

  for (const route of benchmark.forbiddenRoutes.map(normalizeRoute)) {
    for (const path of presentRouteCandidates(route, paths)) {
      issues.push({
        type: 'forbidden-route-present',
        route,
        path,
        message: `Forbidden benchmark route ${route} is present at ${path}.`,
      });
    }
  }

  for (const path of paths) {
    if (path.startsWith('app/')) {
      issues.push({
        type: 'root-app-file-present',
        path,
        message: `Generated file ${path} uses the root app/ directory. Benchmark outputs must use src/app only.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
