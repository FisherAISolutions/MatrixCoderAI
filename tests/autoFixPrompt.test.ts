import { describe, it, expect } from 'vitest';
import {
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
    expect(prompt.length).toBeLessThan(20_000);
    expect(prompt).toMatch(/elided/);
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
});
