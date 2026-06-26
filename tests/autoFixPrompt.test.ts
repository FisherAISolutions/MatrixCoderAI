import { describe, it, expect } from 'vitest';
import {
  buildAutoFixPromptWithDiagnostics,
  buildAutoFixUserPrompt,
  AUTO_FIX_SYSTEM_PROMPT,
} from '@/lib/validation/autoFixPrompt';
import type { ParsedError } from '@/lib/validation/errorParser';
import type { FileNode } from '@/app/chat-workspace/components/types';

function file(path: string, content: string): FileNode {
  return { id: path, name: path.split('/').pop()!, path, type: 'file', content };
}

describe('AUTO_FIX_SYSTEM_PROMPT', () => {
  it('instructs the AI to use SEARCH/REPLACE patches', () => {
    expect(AUTO_FIX_SYSTEM_PROMPT).toMatch(/SEARCH\s*\/\s*REPLACE/);
    expect(AUTO_FIX_SYSTEM_PROMPT).toMatch(/edit:/);
  });

  it('warns against modifying package.json (Phase 2 owns that)', () => {
    expect(AUTO_FIX_SYSTEM_PROMPT).toMatch(/Do NOT modify package\.json/);
  });
});

describe('buildAutoFixUserPrompt', () => {
  const sampleFiles: FileNode[] = [
    file('package.json', '{"name":"demo"}'),
    file('tsconfig.json', '{}'),
    file('src/app/page.tsx', 'export default function Page() { return <div/>; }'),
  ];

  it('renders structured errors and asks for SEARCH/REPLACE fences', () => {
    const errors: ParsedError[] = [
      {
        source: 'typescript',
        file: 'src/app/page.tsx',
        line: 1,
        column: 1,
        code: 'TS2322',
        message: "Type 'string' is not assignable",
        raw: 'src/app/page.tsx(1,1): error TS2322:...',
      },
    ];
    const prompt = buildAutoFixUserPrompt({
      errors,
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'type-check',
    });
    expect(prompt).toMatch(/Auto-Fix Attempt 1 \/ 3/);
    expect(prompt).toMatch(/TS2322/);
    expect(prompt).toMatch(/edit:/);
    expect(prompt).toMatch(/src\/app\/page\.tsx/);
  });

  it('REGRESSION: includes raw log even when structured errors are empty', () => {
    // This is the exact bug the user hit: 0 parsed errors → AI got
    // nothing to work with → returned no patches → loop bailed.
    const rawLog = `sh: tsc: not found\nexit 127\n`;
    const prompt = buildAutoFixUserPrompt({
      errors: [],
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'type-check',
      rawLog,
    });
    expect(prompt).toMatch(/no structured errors/i);
    expect(prompt).toContain('tsc: not found');
    expect(prompt).toMatch(/Raw `type-check` output/);
  });

  it('REGRESSION: 0 structured errors → still attaches likely files (root configs)', () => {
    // Companion to the test above: when our regex couldn't parse a
    // single error, the AI must STILL see relevant files so it can
    // diagnose from the file contents + raw log. Root configs
    // (package.json, tsconfig.json, next.config.mjs) are always
    // included by selectRelevantFiles for exactly this reason.
    const prompt = buildAutoFixUserPrompt({
      errors: [],
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'type-check',
      rawLog: 'sh: tsc: not found\n',
    });
    // The "Current file contents" section must contain at least one of
    // the canonical root config paths so the AI has something to act on.
    expect(prompt).toMatch(/Current file contents/);
    const hasRootConfig =
      prompt.includes('path: package.json') ||
      prompt.includes('path: tsconfig.json') ||
      prompt.includes('path: next.config.mjs');
    expect(hasRootConfig).toBe(true);
    // And the "no relevant files" fallback string should NOT appear.
    expect(prompt).not.toMatch(/no relevant files available/);
  });

  it('REGRESSION: raw compiler logs attach directly referenced source files', () => {
    const { prompt, diagnostics } = buildAutoFixPromptWithDiagnostics({
      errors: [
        {
          source: 'typescript',
          code: 'TS2304',
          message: "Cannot find name 'Link'.",
          raw: "error TS2304: Cannot find name 'Link'.",
        },
      ],
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'type-check',
      rawLog:
        "src/app/page.tsx:45:14 - error TS2304: Cannot find name 'Link'.",
    });

    expect(prompt).toContain('// path: src/app/page.tsx');
    expect(diagnostics.attachedFilePaths).toEqual(['src/app/page.tsx']);
  });

  it('renders infrastructureError as a dedicated section', () => {
    const prompt = buildAutoFixUserPrompt({
      errors: [],
      files: sampleFiles,
      attempt: 2,
      maxAttempts: 3,
      failedStep: 'install',
      rawLog: 'npm install output here',
      infrastructureError: 'Command "npm install" exceeded 180000ms timeout.',
    });
    expect(prompt).toMatch(/Sandbox infrastructure error/);
    expect(prompt).toContain('180000ms timeout');
    expect(prompt).toContain('npm install output here');
  });

  it('includes previous-attempt feedback when provided', () => {
    const prompt = buildAutoFixUserPrompt({
      errors: [],
      files: sampleFiles,
      attempt: 2,
      maxAttempts: 3,
      previousAttemptSummary: 'Attempt 1 applied 2 patches, 1 block failed.',
      rawLog: 'still broken',
    });
    expect(prompt).toMatch(/Previous attempt feedback/);
    expect(prompt).toContain('Attempt 1 applied 2 patches');
  });

  it('truncates very long raw logs to keep tokens bounded', () => {
    const hugeLog = 'x'.repeat(50_000);
    const prompt = buildAutoFixUserPrompt({
      errors: [],
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      rawLog: hugeLog,
    });
    expect(prompt.length).toBeLessThan(15_000);
    expect(prompt).toMatch(/elided/);
  });

  it('reports prompt diagnostics and attached file paths', () => {
    const { prompt, diagnostics } = buildAutoFixPromptWithDiagnostics({
      errors: [
        {
          source: 'typescript',
          file: 'src/app/page.tsx',
          line: 1,
          column: 1,
          code: 'TS1',
          message: 'x',
          raw: '',
        },
      ],
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
      rawLog: 'src/app/page.tsx:1:1 - error TS1',
    });

    expect(prompt).toContain('src/app/page.tsx');
    expect(diagnostics.attachedFileCount).toBe(1);
    expect(diagnostics.attachedFilePaths).toEqual(['src/app/page.tsx']);
    expect(diagnostics.promptChars).toBe(prompt.length);
    expect(diagnostics.estimatedTokens).toBeGreaterThan(0);
    expect(diagnostics.maxAttachedFiles).toBe(4);
  });

  it('compact mode shrinks attached file content and raw logs', () => {
    const largeFiles = [
      file('src/app/page.tsx', 'a'.repeat(10_000)),
      file('src/app/add/page.tsx', 'b'.repeat(10_000)),
    ];
    const errors: ParsedError[] = [
      {
        source: 'typescript',
        file: 'src/app/page.tsx',
        line: 1,
        message: 'x',
        raw: '',
      },
    ];
    const normal = buildAutoFixPromptWithDiagnostics({
      errors,
      files: largeFiles,
      attempt: 1,
      maxAttempts: 3,
      rawLog: 'x'.repeat(20_000),
    });
    const compact = buildAutoFixPromptWithDiagnostics({
      errors,
      files: largeFiles,
      attempt: 2,
      maxAttempts: 3,
      rawLog: 'x'.repeat(20_000),
      compact: true,
    });

    expect(compact.diagnostics.compact).toBe(true);
    expect(compact.diagnostics.promptChars).toBeLessThan(
      normal.diagnostics.promptChars
    );
    expect(compact.diagnostics.maxAttachedFiles).toBe(2);
    expect(compact.diagnostics.maxRawLogChars).toBeLessThan(
      normal.diagnostics.maxRawLogChars
    );
  });

  it('truncates error list when there are too many errors', () => {
    const lots: ParsedError[] = Array.from({ length: 50 }, (_, i) => ({
      source: 'typescript',
      file: `src/file${i}.ts`,
      line: 1,
      column: 1,
      code: 'TS9999',
      message: `error number ${i}`,
      raw: '',
    }));
    const prompt = buildAutoFixUserPrompt({
      errors: lots,
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(prompt).toMatch(/additional errors omitted/);
  });

  it('selects relevant files based on error file paths', () => {
    const errors: ParsedError[] = [
      {
        source: 'typescript',
        file: 'src/app/page.tsx',
        line: 1,
        column: 1,
        code: 'TS1',
        message: 'x',
        raw: '',
      },
    ];
    const prompt = buildAutoFixUserPrompt({
      errors,
      files: sampleFiles,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(prompt).toContain('src/app/page.tsx');
  });

  it('REGRESSION: import-integrity failures instruct full-file creation with extension paths', () => {
    const prompt = buildAutoFixUserPrompt({
      errors: [
        {
          source: 'imports',
          file: 'src/app/history/page.tsx',
          message:
            'Missing local import "@/components/HistoryPage" from src/app/history/page.tsx. Suggested create path: src/components/HistoryPage.tsx.',
          raw:
            'src/app/history/page.tsx: import "@/components/HistoryPage" -> src/components/HistoryPage\nSuggested create path: src/components/HistoryPage.tsx',
        },
      ],
      files: [
        ...sampleFiles,
        file('src/app/history/page.tsx', `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`),
      ],
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'import-integrity',
      rawLog: 'Suggested create path: src/components/HistoryPage.tsx',
    });

    expect(prompt).toMatch(/Generated-file consistency audit failed/);
    expect(prompt).toMatch(/Suggested create path/);
    expect(prompt).toContain('// path: src/components/HistoryPage.tsx');
    expect(prompt).toMatch(/CREATE paths MUST include a real file extension/);
  });

  it('REGRESSION: generated-quality failures include original requirements and no-placeholder guidance', () => {
    const requirements =
      'Build a calorie tracker. HistoryPage must include search, filter, edit, delete, and localStorage wiring.';
    const prompt = buildAutoFixUserPrompt({
      errors: [
        {
          source: 'quality',
          file: 'src/components/HistoryPage.tsx',
          message:
            'src/components/HistoryPage.tsx is an imported generated file but looks like a placeholder.',
          raw: 'placeholder component',
        },
      ],
      files: [
        ...sampleFiles,
        file('src/components/HistoryPage.tsx', 'export default function HistoryPage() { return <main>History</main>; }'),
      ],
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'generated-quality',
      requirements,
    });

    expect(prompt).toMatch(/Generated quality audit failed/);
    expect(prompt).toContain(requirements);
    expect(prompt).toMatch(/Do NOT create tiny placeholders/);
    expect(prompt).toMatch(/search,\s*filter,\s*edit,\s*delete,\s*and localStorage wiring/);
  });

  it('REGRESSION: fallback primary route repairs keep App Router pages server-side', () => {
    const prompt = buildAutoFixUserPrompt({
      errors: [
        {
          source: 'quality',
          file: 'src/app/goals/page.tsx',
          message:
            'Primary route /goals is only a deterministic fallback page. Generate a real app screen for this route only; do not regenerate the whole app.',
          raw: 'Primary route /goals is only a deterministic fallback page.',
        },
      ],
      files: [
        ...sampleFiles,
        file(
          'src/app/goals/page.tsx',
          `// MATRIX_CODER_FALLBACK_ROUTE
import Link from 'next/link';

export const metadata = { title: 'Goals' };

export default function GoalsPage() {
  return <main><Link href="/">Back</Link><h1>Goals</h1></main>;
}
`
        ),
      ],
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'generated-quality',
      requirements: 'Build me a fitness tracker app with goals.',
    });

    expect(prompt).toMatch(/Primary route \/<route> is only a deterministic\s+fallback page/);
    expect(prompt).toContain('Remove the');
    expect(prompt).toContain('MATRIX_CODER_FALLBACK_ROUTE');
    expect(prompt).toContain('Keep `src/app/<route>/page.tsx` a SERVER Component');
    expect(prompt).toMatch(/no\s+`'use client'`/);
    expect(prompt).toMatch(/create a separate\s+`'use client'` child component/);
  });

  it('REGRESSION: one-route fallback repair attaches only the failing route', () => {
    const { prompt, diagnostics } = buildAutoFixPromptWithDiagnostics({
      errors: [
        {
          source: 'quality',
          file: 'src/app/goals/page.tsx',
          message:
            'Primary route /goals is only a deterministic fallback page. Generate a real app screen for this route only; do not regenerate the whole app.',
          raw: 'Primary route /goals is only a deterministic fallback page.',
        },
        {
          source: 'quality',
          file: 'src/app/nutrition/page.tsx',
          message:
            'Primary route /nutrition is only a deterministic fallback page. Generate a real app screen for this route only; do not regenerate the whole app.',
          raw: 'Primary route /nutrition is only a deterministic fallback page.',
        },
      ],
      files: [
        file('src/app/layout.tsx', 'export default function Layout({ children }) { return children; }'),
        file('src/app/goals/page.tsx', '// MATRIX_CODER_FALLBACK_ROUTE\nexport default function Goals() { return <main>Goals</main>; }'),
        file('src/app/nutrition/page.tsx', '// MATRIX_CODER_FALLBACK_ROUTE\nexport default function Nutrition() { return <main>Nutrition</main>; }'),
      ],
      attempt: 1,
      maxAttempts: 3,
      failedStep: 'generated-quality',
      oneRouteRepair: { route: 'goals', reason: 'primary-fallback' },
    });

    expect(prompt).toContain('Repair ONLY route `/goals`');
    expect(diagnostics.oneRouteRepair).toBe('/goals');
    expect(diagnostics.attachedFilePaths).toEqual(['src/app/goals/page.tsx']);
    expect(prompt).toContain('// path: src/app/goals/page.tsx');
    expect(prompt).not.toContain('// path: src/app/nutrition/page.tsx');
    expect(prompt).not.toContain('// path: src/app/layout.tsx');
  });

  it('REGRESSION: one-route prerender repair instructs server page plus client child split', () => {
    const prompt = buildAutoFixUserPrompt({
      errors: [
        {
          source: 'nextjs',
          file: 'src/app/goals/page.tsx',
          message:
            'Prerender failed for route "/goals" - almost always a client/server boundary issue.',
          raw: 'Export encountered an error on /goals/page: /goals, exiting the build.',
        },
      ],
      files: [
        file('src/app/goals/page.tsx', "'use client';\nexport default function Goals() { return <main>Goals</main>; }"),
        file('src/app/layout.tsx', 'export default function Layout({ children }) { return children; }'),
      ],
      attempt: 2,
      maxAttempts: 3,
      failedStep: 'build',
      rawLog: 'Export encountered an error on /goals/page: /goals, exiting the build.',
      oneRouteRepair: { route: '/goals', reason: 'prerender-boundary' },
    });

    expect(prompt).toContain('Repair ONLY route `/goals`');
    expect(prompt).toContain('Keep `src/app/goals/page.tsx` as a Server Component');
    expect(prompt).toContain("separate `'use client'` child component");
    expect(prompt).toContain('// path: src/app/goals/page.tsx');
    expect(prompt).not.toContain('// path: src/app/layout.tsx');
  });
});
