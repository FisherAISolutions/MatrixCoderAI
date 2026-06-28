/**
 * End-to-end integration tests for the auto-fix loop.
 *
 * Mocks:
 *   - @/lib/ai/chatCompletion → returns deterministic SEARCH/REPLACE
 *     responses so the loop's prompt → patch → re-validate cycle can
 *     be exercised without an API key.
 *   - @/lib/validation/engine → returns scripted validation results
 *     (e.g. fail-then-pass) so we can assert the loop converges /
 *     gives up correctly without booting a real WebContainer.
 *
 * What this PROVES end-to-end:
 *   1. When validation fails and the AI returns valid SEARCH/REPLACE
 *      patches that fix the file, the loop applies them and re-runs
 *      validation. The second pass succeeds → "Validation passed ✓"
 *      message is emitted.
 *   2. When validation fails and the AI returns NO usable patches,
 *      the loop stops with the "did not emit any usable patches"
 *      message after the first attempt.
 *   3. When validation keeps failing for 3 attempts, the loop stops
 *      at the max-attempts limit and reports it.
 *   4. The lock prevents two concurrent loops.
 *   5. Chat messages are emitted at every key lifecycle point.
 *   6. File-update callbacks are called with the patched content.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';

// --- Mocks ------------------------------------------------------------------

const mockGetChatCompletion = vi.fn();
const mockRunValidation = vi.fn();

vi.mock('@/lib/ai/chatCompletion', () => ({
  getChatCompletion: (...args: unknown[]) => mockGetChatCompletion(...args),
}));

vi.mock('@/lib/validation/engine', async (importActual) => {
  // Keep the real type exports — only `runValidation` is mocked.
  const actual = await importActual<typeof import('@/lib/validation/engine')>();
  return {
    ...actual,
    runValidation: (...args: unknown[]) => mockRunValidation(...args),
  };
});

// Import AFTER vi.mock — Vitest's mock hoisting applies, but doing the
// import dynamically inside `beforeEach` would also work.
import { runAutoFixLoop } from '@/lib/validation/autoFixLoop';

// --- Helpers ---------------------------------------------------------------

function file(path: string, content: string): FileNode {
  return { id: path, name: path.split('/').pop()!, path, type: 'file', content };
}

function makeRecorder() {
  const status: Array<string | null> = [];
  const chatMessages: Array<{ content: string }> = [];
  const fileUpdates: FileNode[] = [];
  const fileAdds: FileNode[] = [];
  return {
    status,
    chatMessages,
    fileUpdates,
    fileAdds,
    onStatus: (s: string | null) => status.push(s),
    onChatMessage: (m: { content: string }) => chatMessages.push(m),
    onUpdateFile: (f: FileNode) => fileUpdates.push(f),
    onAddFile: (f: FileNode) => fileAdds.push(f),
  };
}

function validationFail(errorMsg: string, log: string) {
  return {
    success: false,
    skipped: false,
    steps: [
      {
        step: 'type-check' as const,
        status: 'failed' as const,
        exitCode: 1,
        durationMs: 10,
        errors: [
          {
            source: 'typescript' as const,
            file: 'src/app/page.tsx',
            line: 2,
            column: 5,
            code: 'TS2322',
            message: errorMsg,
            raw: log,
          },
        ],
        log,
      },
    ],
    errors: [
      {
        source: 'typescript' as const,
        file: 'src/app/page.tsx',
        line: 2,
        column: 5,
        code: 'TS2322',
        message: errorMsg,
        raw: log,
      },
    ],
    combinedLog: log,
    durationMs: 10,
  };
}

function validationImportFail() {
  const log =
    '[import-integrity] FAILED - checked 1 file(s), 1 local import(s), 1 missing target(s).\n' +
    '- src/app/history/page.tsx imports "@/components/HistoryPage" -> missing src/components/HistoryPage (suggested create: src/components/HistoryPage.tsx)\n';
  const error = {
    source: 'imports' as const,
    file: 'src/app/history/page.tsx',
    message:
      'Missing local import "@/components/HistoryPage" from src/app/history/page.tsx. Suggested create path: src/components/HistoryPage.tsx. Create the missing file or correct the import path.',
    raw:
      'src/app/history/page.tsx: import "@/components/HistoryPage" -> src/components/HistoryPage\nSuggested create path: src/components/HistoryPage.tsx',
  };
  return {
    success: false,
    skipped: false,
    steps: [
      {
        step: 'import-integrity' as const,
        status: 'failed' as const,
        durationMs: 5,
        errors: [error],
        log,
      },
    ],
    errors: [error],
    combinedLog: log,
    durationMs: 5,
  };
}

function validationPass() {
  return {
    success: true,
    skipped: false,
    steps: [
      {
        step: 'type-check' as const,
        status: 'ok' as const,
        exitCode: 0,
        durationMs: 5,
        errors: [],
        log: '',
      },
      {
        step: 'build' as const,
        status: 'ok' as const,
        exitCode: 0,
        durationMs: 30,
        errors: [],
        log: '',
      },
    ],
    errors: [],
    combinedLog: '',
    durationMs: 35,
  };
}

function validationSkipped(reason: string) {
  return {
    success: false,
    skipped: true,
    skipReason: reason,
    steps: [
      {
        step: 'support-check' as const,
        status: 'skipped' as const,
        durationMs: 0,
        errors: [],
        log: reason,
      },
    ],
    errors: [],
    combinedLog: '',
    durationMs: 0,
  };
}

function validationGeneratedQualityFail(files: FileNode[]) {
  const audit = runGeneratedQualityAudit(files);
  return {
    success: false,
    skipped: false,
    steps: [
      {
        step: 'generated-quality' as const,
        status: 'failed' as const,
        durationMs: 5,
        errors: audit.errors,
        log: audit.log,
      },
    ],
    errors: audit.errors,
    combinedLog: audit.log,
    durationMs: 5,
  };
}

function validationPrimaryFallbackFail(routes: string[]) {
  const errors = routes.map((route) => ({
    source: 'quality' as const,
    file: `src/app/${route}/page.tsx`,
    message:
      `Primary route /${route} is only a deterministic fallback page. Generate a real app screen for this route only; do not regenerate the whole app.`,
    raw: `Primary route /${route} is only a deterministic fallback page.`,
  }));
  const log = errors.map((error) => error.message).join('\n');
  return {
    success: false,
    skipped: false,
    steps: [
      {
        step: 'generated-quality' as const,
        status: 'failed' as const,
        durationMs: 5,
        errors,
        log,
      },
    ],
    errors,
    combinedLog: log,
    durationMs: 5,
  };
}

function validationPrerenderFail(route: string) {
  const log =
    `Prerender failed for route "/${route}" - almost always a client/server boundary issue.\n` +
    `Export encountered an error on /${route}/page: /${route}, exiting the build.`;
  const error = {
    source: 'build' as const,
    file: `src/app/${route}/page.tsx`,
    message:
      `Prerender failed for route "/${route}" - almost always a client/server boundary issue.`,
    raw: log,
  };
  return {
    success: false,
    skipped: false,
    steps: [
      {
        step: 'build' as const,
        status: 'failed' as const,
        exitCode: 1,
        durationMs: 20,
        errors: [error],
        log,
      },
    ],
    errors: [error],
    combinedLog: log,
    durationMs: 20,
  };
}

function fallbackPage(route: string): string {
  const title = route[0].toUpperCase() + route.slice(1);
  return `// MATRIX_CODER_FALLBACK_ROUTE
export default function ${title}Page() {
  return <main>${title}</main>;
}
`;
}

// Returns an AI response that emits a single SEARCH/REPLACE patch.
function aiPatch(path: string, search: string, replace: string): string {
  return `Fixing the bug:

\`\`\`edit:${path}
<<<<<<< SEARCH
${search}
=======
${replace}
>>>>>>> REPLACE
\`\`\`

- Replaced the bad code.`;
}

function aiCompletion(
  content: string,
  extra: { finish_reason?: string; usage?: Record<string, number> } = {}
) {
  return {
    choices: [{ message: { content }, finish_reason: extra.finish_reason }],
    usage: extra.usage,
  };
}

// --- Tests -----------------------------------------------------------------

describe('runAutoFixLoop — integration', () => {
  beforeEach(() => {
    mockGetChatCompletion.mockReset();
    mockRunValidation.mockReset();
  });

  it('does not start validation or AI repair when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort('Cancelled by user');
    const r = makeRecorder();

    const result = await runAutoFixLoop({
      files: [
        file(
          'src/app/page.tsx',
          'export default function Page() { return null; }'
        ),
      ],
      signal: controller.signal,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result).toMatchObject({
      ran: false,
      succeeded: false,
      attempts: 0,
      skippedReason: 'cancelled',
    });
    expect(mockRunValidation).not.toHaveBeenCalled();
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileUpdates).toEqual([]);
    expect(r.fileAdds).toEqual([]);
  });

  it('happy path: validation fails → AI patches → re-validation passes → success', async () => {
    const files = [
      file('src/app/page.tsx', `const x: number = "broken";`),
    ];

    // Round 1: fail. Round 2: pass.
    mockRunValidation
      .mockResolvedValueOnce(validationFail(
        "Type 'string' is not assignable to type 'number'.",
        `src/app/page.tsx(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`
      ))
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion.mockResolvedValue(
      aiCompletion(
        aiPatch(
          'src/app/page.tsx',
          `const x: number = "broken";`,
          `const x: number = 42;`
        )
      )
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    // The loop ran, succeeded after attempt 1, and called both AI and validation.
    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.attempts).toBe(1);
    expect(mockRunValidation).toHaveBeenCalledTimes(2);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(1);

    // File was actually patched with the AI's REPLACE content.
    expect(r.fileUpdates).toHaveLength(1);
    expect(r.fileUpdates[0].content).toContain('const x: number = 42');

    // Chat messages: validation started → type-check failed → attempt 1 →
    //                applied patches → validation passed.
    const contents = r.chatMessages.map((m) => m.content);
    expect(contents.some((c) => c.includes('Build validation started'))).toBe(true);
    expect(contents.some((c) => c.includes('Type-check failed'))).toBe(true);
    expect(contents.some((c) => c.includes('Auto-fix attempt 1/3 started'))).toBe(true);
    expect(contents.some((c) => c.includes('applied patches'))).toBe(true);
    expect(contents.some((c) => c.includes('Validation passed'))).toBe(true);

    // Status row is reset to null when the loop ends.
    expect(r.status[r.status.length - 1]).toBeNull();
  });

  it('REGRESSION: import-integrity failure can be fixed by creating the missing file', async () => {
    const files = [
      file(
        'src/app/history/page.tsx',
        `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`
      ),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationImportFail())
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion.mockResolvedValue(
      aiCompletion(`Creating the missing component:

\`\`\`tsx
// path: src/components/HistoryPage.tsx
export default function HistoryPage() {
  return <main>History</main>;
}
\`\`\``)
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(mockRunValidation).toHaveBeenCalledTimes(2);
    expect(r.fileAdds).toHaveLength(1);
    expect(r.fileAdds[0].path).toBe('src/components/HistoryPage.tsx');
    expect(r.fileAdds[0].content).toContain('export default function HistoryPage');
    expect(r.chatMessages.some((m) => m.content.includes('1 new file'))).toBe(true);
  });

  it('REGRESSION: auto-fix can clean all leaked SEARCH/REPLACE markers from a file', async () => {
    const dirty = `import Link from 'next/link';\n<<<<<<< SEARCH\nexport default function Page() {\n=======\nexport default function Page() {\n  return <main />;\n}\n>>>>>>> REPLACE\n`;
    const clean = `import Link from 'next/link';\nexport default function Page() {\n  return <main />;\n}\n`;
    const files = [file('src/app/page.tsx', dirty)];

    mockRunValidation
      .mockResolvedValueOnce(
        validationFail(
          'TS1185: Merge conflict marker encountered.',
          'src/app/page.tsx:122:1 - error TS1185: Merge conflict marker encountered.'
        )
      )
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion.mockResolvedValue(
      aiCompletion(`Replacing the contaminated file with clean content:

\`\`\`tsx
// path: src/app/page.tsx
${clean}\`\`\``)
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.succeeded).toBe(true);
    expect(r.fileUpdates).toHaveLength(1);
    expect(r.fileUpdates[0].content).toBe(clean.trim());
    expect(r.fileUpdates[0].content).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
  });

  it('REGRESSION: auto-fix refuses a patch result that would leave an orphan marker', async () => {
    const original = `const a = 1;\n`;
    const files = [file('src/app/page.tsx', original)];

    mockRunValidation.mockResolvedValue(
      validationFail(
        'TS1185: Merge conflict marker encountered.',
        'src/app/page.tsx:1:1 - error TS1185: Merge conflict marker encountered.'
      )
    );
    mockGetChatCompletion.mockResolvedValue(
      aiCompletion(aiPatch('src/app/page.tsx', 'const a = 1;', 'const a = 2;\n======='))
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      maxAttempts: 1,
    });

    expect(result.succeeded).toBe(false);
    expect(r.fileUpdates).toHaveLength(0);
    expect(r.fileAdds).toHaveLength(0);
    expect(r.chatMessages.map((m) => m.content).join('\n')).toContain(
      'SEARCH/REPLACE marker leaked'
    );
  });

  it('AI returns NO patches → loop stops gracefully on attempt 1', async () => {
    mockRunValidation.mockResolvedValue(
      validationFail('Some error', 'raw log')
    );
    mockGetChatCompletion.mockResolvedValue(
      aiCompletion('I cannot determine the fix from the provided context.')
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'broken')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toBe(2);
    expect(mockRunValidation).toHaveBeenCalledTimes(1);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);

    const contents = r.chatMessages.map((m) => m.content);
    expect(
      contents.some((c) => c.includes('did not emit any usable patches'))
    ).toBe(true);
  });

  it('surfaces finish reason and token usage when auto-fix hits the output limit', async () => {
    mockRunValidation.mockResolvedValueOnce(
      validationFail('Some error', 'raw log')
    );
    mockGetChatCompletion.mockResolvedValue(
      aiCompletion('', {
        finish_reason: 'length',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 8192,
          total_tokens: 8292,
        },
      })
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'broken')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toBe(2);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);
    const contents = r.chatMessages.map((m) => m.content).join('\n');
    expect(contents).toContain('finish_reason=length');
    expect(contents).toContain('completion_tokens=8192');
    expect(contents).toContain('hit the output limit');
    expect(contents).toContain('compact context');
  });

  it('REGRESSION: output-limit retry shrinks context before trying again', async () => {
    const largeFile = `const x: number = "broken";\n${'// filler\n'.repeat(1500)}`;
    const hugeLog =
      `src/app/page.tsx(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\n` +
      'x'.repeat(30_000);

    mockRunValidation
      .mockResolvedValueOnce(
        validationFail(
          "Type 'string' is not assignable to type 'number'.",
          hugeLog
        )
      )
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion
      .mockResolvedValueOnce(
        aiCompletion('', {
          finish_reason: 'length',
          usage: {
            prompt_tokens: 9654,
            completion_tokens: 8192,
            total_tokens: 17846,
          },
        })
      )
      .mockResolvedValueOnce(
        aiCompletion(
          aiPatch(
            'src/app/page.tsx',
            `const x: number = "broken";`,
            `const x: number = 42;`
          )
        )
      );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', largeFile)],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      maxAttempts: 2,
    });

    expect(result.succeeded).toBe(true);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);
    const firstPrompt = (mockGetChatCompletion.mock.calls[0][2] as any[])[1]
      .content;
    const secondPrompt = (mockGetChatCompletion.mock.calls[1][2] as any[])[1]
      .content;
    expect(secondPrompt.length).toBeLessThan(firstPrompt.length);
    expect(r.fileUpdates[0].content).toContain('const x: number = 42');
  });

  it('REGRESSION: primary fallback routes are repaired as separate one-route jobs', async () => {
    const files = [
      file('src/app/goals/page.tsx', fallbackPage('goals')),
      file('src/app/nutrition/page.tsx', fallbackPage('nutrition')),
      file('src/app/layout.tsx', 'export default function Layout({ children }) { return children; }'),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationPrimaryFallbackFail(['goals', 'nutrition']))
      .mockResolvedValueOnce(validationPrimaryFallbackFail(['nutrition']))
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion.mockImplementation(async (_provider, _model, messages) => {
      const prompt = messages[1].content as string;
      if (prompt.includes('Repair ONLY route `/goals`')) {
        return aiCompletion(
          aiPatch(
            'src/app/goals/page.tsx',
            fallbackPage('goals').trim(),
            `export default function GoalsPage() {
  return <main><h1>Goals dashboard</h1><p>Track weekly milestones.</p></main>;
}`
          )
        );
      }
      return aiCompletion(
        aiPatch(
          'src/app/nutrition/page.tsx',
          fallbackPage('nutrition').trim(),
          `export default function NutritionPage() {
  return <main><h1>Nutrition tracker</h1><p>Track meals and macros.</p></main>;
}`
        )
      );
    });

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      maxAttempts: 3,
    });

    expect(result.succeeded).toBe(true);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);
    const firstPrompt = (mockGetChatCompletion.mock.calls[0][2] as any[])[1].content;
    const secondPrompt = (mockGetChatCompletion.mock.calls[1][2] as any[])[1].content;
    expect(firstPrompt).toContain('Repair ONLY route `/goals`');
    expect(firstPrompt).toContain('// path: src/app/goals/page.tsx');
    expect(firstPrompt).not.toContain('// path: src/app/nutrition/page.tsx');
    expect(firstPrompt).not.toContain('// path: src/app/layout.tsx');
    expect(secondPrompt).toContain('Repair ONLY route `/nutrition`');
    expect(secondPrompt).toContain('// path: src/app/nutrition/page.tsx');
    expect(secondPrompt).not.toContain('// path: src/app/goals/page.tsx');
    expect(r.fileUpdates.map((update) => update.path)).toEqual([
      'src/app/goals/page.tsx',
      'src/app/nutrition/page.tsx',
    ]);
  });

  it('REGRESSION: one-route prerender failures do not attach layout unless directly implicated', async () => {
    const files = [
      file('src/app/goals/page.tsx', "'use client';\nexport default function GoalsPage() { return <main>Goals</main>; }"),
      file('src/app/layout.tsx', 'export default function Layout({ children }) { return children; }'),
      file('src/components/fitness/ProgressClient.tsx', "'use client';\nexport default function ProgressClient() { return <main>Progress</main>; }"),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationPrerenderFail('goals'))
      .mockResolvedValueOnce(validationPass());

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      maxAttempts: 1,
    });

    expect(result.succeeded).toBe(true);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileUpdates).toHaveLength(1);
    expect(r.fileUpdates[0].path).toBe('src/app/goals/page.tsx');
    expect(r.fileUpdates[0].content).toContain("import GoalsClient from '@/components/fitness/GoalsClient'");
    expect(r.fileUpdates[0].content).not.toMatch(/['"]use client['"]/);
    expect(r.fileAdds).toHaveLength(1);
    expect(r.fileAdds[0].path).toBe('src/components/fitness/GoalsClient.tsx');
    expect(r.fileAdds[0].content).toMatch(/^'use client';/);
  });

  it('REGRESSION: route output-limit switches to one-route compact repair without repeating the same prompt', async () => {
    const files = [file('src/app/goals/page.tsx', fallbackPage('goals'))];

    mockRunValidation
      .mockResolvedValueOnce(validationPrimaryFallbackFail(['goals']))
      .mockResolvedValueOnce(validationPass());

    mockGetChatCompletion
      .mockResolvedValueOnce(
        aiCompletion('', {
          finish_reason: 'length',
          usage: {
            prompt_tokens: 4879,
            completion_tokens: 8192,
            total_tokens: 13071,
          },
        })
      )
      .mockResolvedValueOnce(
        aiCompletion(
          aiPatch(
            'src/app/goals/page.tsx',
            fallbackPage('goals').trim(),
            `export default function GoalsPage() {
  return <main><h1>Goals dashboard</h1><p>Track weekly milestones.</p></main>;
}`
          )
        )
      );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      maxAttempts: 2,
    });

    expect(result.succeeded).toBe(true);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(2);
    const firstPrompt = (mockGetChatCompletion.mock.calls[0][2] as any[])[1].content;
    const secondPrompt = (mockGetChatCompletion.mock.calls[1][2] as any[])[1].content;
    expect(firstPrompt).toContain('Repair ONLY route `/goals`');
    expect(secondPrompt).toContain('Repair ONLY route `/goals`');
    expect(r.chatMessages.map((m) => m.content).join('\n')).toContain(
      'Output limit hit; switching to one-route compact repair for /goals'
    );
    expect(r.fileUpdates[0].path).toBe('src/app/goals/page.tsx');
  });

  it('exhausts max attempts when AI patches don\'t fix the error', async () => {
    // 4 validation calls: 1 initial + 3 retries, all fail.
    for (let i = 0; i < 4; i++) {
      mockRunValidation.mockResolvedValueOnce(
        validationFail('Still broken', `iteration ${i} log`)
      );
    }
    // Provide a different SEARCH that always matches the current content.
    mockGetChatCompletion.mockImplementation(async () =>
      aiCompletion(
        aiPatch('src/app/page.tsx', 'broken', 'still-broken')
      )
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'broken')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toBe(3);
    // 1 initial + 3 retries = 4 validation runs.
    expect(mockRunValidation).toHaveBeenCalledTimes(4);
    expect(mockGetChatCompletion).toHaveBeenCalledTimes(3);

    const contents = r.chatMessages.map((m) => m.content);
    expect(
      contents.some((c) => c.includes('Auto-fix stopped after 3 attempts'))
    ).toBe(true);
  });

  it('validation skipped → loop reports unsupported browser cleanly', async () => {
    mockRunValidation.mockResolvedValue(
      validationSkipped('SharedArrayBuffer unavailable — page is not cross-origin isolated.')
    );

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'ok')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(false);
    expect(result.skippedReason).toMatch(/SharedArrayBuffer/);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();

    const contents = r.chatMessages.map((m) => m.content);
    expect(contents.some((c) => c.includes('Validation skipped'))).toBe(true);
    expect(contents.some((c) => c.includes('cross-origin isolation'))).toBe(true);
  });

  it('first-try success: validation passes immediately, no AI call', async () => {
    mockRunValidation.mockResolvedValue(validationPass());

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'export default function Page() { return null; }')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileUpdates).toHaveLength(0); // no patches applied

    const contents = r.chatMessages.map((m) => m.content);
    expect(contents.some((c) => c.includes('green on the first try'))).toBe(true);
  });

  it('AI request throws → loop stops and reports the error', async () => {
    mockRunValidation.mockResolvedValue(
      validationFail('boom', 'raw boom')
    );
    mockGetChatCompletion.mockRejectedValue(new Error('OPEN_AI API error: 401'));

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'x')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.attempts).toBe(1);

    const contents = r.chatMessages.map((m) => m.content);
    expect(contents.some((c) => c.includes('OPEN_AI API error: 401'))).toBe(true);
  });

  it('disable toggle short-circuits the loop', async () => {
    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files: [file('src/app/page.tsx', 'x')],
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
      enabled: false,
    });

    expect(result.ran).toBe(false);
    expect(result.skippedReason).toBe('disabled');
    expect(mockRunValidation).not.toHaveBeenCalled();
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
  });

  it('concurrency lock prevents two loops running at once', async () => {
    // Make validation hang on the first call so we can fire a second.
    let resolveFirst: (v: unknown) => void;
    const firstValidation = new Promise((res) => {
      resolveFirst = res;
    });
    mockRunValidation.mockImplementationOnce(() => firstValidation);
    mockRunValidation.mockResolvedValueOnce(validationPass());

    const r1 = makeRecorder();
    const r2 = makeRecorder();

    const firstPromise = runAutoFixLoop({
      files: [file('a.ts', '')],
      onStatus: r1.onStatus,
      onChatMessage: r1.onChatMessage,
      onUpdateFile: r1.onUpdateFile,
      onAddFile: r1.onAddFile,
    });

    // Give the first call a tick to enter the loop and grab the lock.
    await new Promise((res) => setTimeout(res, 10));

    // Second call should be refused.
    const secondResult = await runAutoFixLoop({
      files: [file('b.ts', '')],
      onStatus: r2.onStatus,
      onChatMessage: r2.onChatMessage,
      onUpdateFile: r2.onUpdateFile,
      onAddFile: r2.onAddFile,
    });

    expect(secondResult.ran).toBe(false);
    expect(secondResult.skippedReason).toBe('already-running');

    // Resolve the first call so the test exits cleanly.
    resolveFirst!(validationPass());
    await firstPromise;
  });

  it('REGRESSION: missing linked routes are repaired deterministically without GPT', async () => {
    const files = [
      file('package.json', '{"scripts":{"build":"next build"}}'),
      file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'),
      file(
        'src/app/page.tsx',
        `import Link from 'next/link';

export default function Page() {
  return (
    <nav>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/help">Help</Link>
    </nav>
  );
}`
      ),
      file('src/app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationGeneratedQualityFail(files))
      .mockResolvedValueOnce(validationPass());

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mockRunValidation).toHaveBeenCalledTimes(2);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileAdds.map((item) => item.path).sort()).toEqual([
      'src/app/help/page.tsx',
      'src/app/privacy/page.tsx',
      'src/app/terms/page.tsx',
    ]);
    expect(r.chatMessages.map((m) => m.content).join('\n')).toContain(
      'deterministic fixes resolved the issue before an AI repair attempt was needed'
    );
  });

  it('REGRESSION: obvious dark/light theme mismatches are repaired deterministically without GPT', async () => {
    const files = [
      file('package.json', '{"scripts":{"build":"next build"}}'),
      file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'),
      file(
        'src/app/page.tsx',
        `import Link from 'next/link';

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Link href="/progress">Progress</Link>
    </main>
  );
}`
      ),
      file(
        'src/app/progress/page.tsx',
        `export default function ProgressPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="rounded-xl bg-white p-6 text-slate-950">Progress</section>
    </main>
  );
}`
      ),
      file('src/app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationGeneratedQualityFail(files))
      .mockResolvedValueOnce(validationPass());

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mockRunValidation).toHaveBeenCalledTimes(2);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileUpdates).toHaveLength(1);
    expect(r.fileUpdates[0].path).toBe('src/app/progress/page.tsx');
    expect(r.fileUpdates[0].content).toContain('min-h-screen bg-slate-950 text-white');
    expect(r.fileUpdates[0].content).toContain('rounded-xl bg-white p-6 text-slate-950');
    expect(r.chatMessages.map((m) => m.content).join('\n')).toContain(
      'deterministic fixes resolved the issue before an AI repair attempt was needed'
    );
  });

  it('REGRESSION: Client Component route pages are split deterministically without GPT', async () => {
    const files = [
      file('package.json', '{"scripts":{"build":"next build"}}'),
      file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'),
      file(
        'src/app/workouts/page.tsx',
        `'use client';
import { useState } from 'react';

export default function WorkoutsPage() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Workout {count}</button>;
}
`
      ),
      file(
        'src/components/fitness/ProgressClient.tsx',
        `'use client';
export default function ProgressClient() {
  return <main>Progress</main>;
}
`
      ),
    ];

    mockRunValidation
      .mockResolvedValueOnce(validationGeneratedQualityFail(files))
      .mockResolvedValueOnce(validationPass());

    const r = makeRecorder();
    const result = await runAutoFixLoop({
      files,
      onStatus: r.onStatus,
      onChatMessage: r.onChatMessage,
      onUpdateFile: r.onUpdateFile,
      onAddFile: r.onAddFile,
    });

    expect(result.ran).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mockRunValidation).toHaveBeenCalledTimes(2);
    expect(mockGetChatCompletion).not.toHaveBeenCalled();
    expect(r.fileUpdates).toHaveLength(1);
    expect(r.fileUpdates[0].path).toBe('src/app/workouts/page.tsx');
    expect(r.fileUpdates[0].content).not.toMatch(/['"]use client['"]/);
    expect(r.fileUpdates[0].content).toContain("import WorkoutsClient from '@/components/fitness/WorkoutsClient'");
    expect(r.fileAdds).toHaveLength(1);
    expect(r.fileAdds[0].path).toBe('src/components/fitness/WorkoutsClient.tsx');
    expect(r.fileAdds[0].content).toMatch(/^'use client';/);
    expect(r.fileAdds[0].content).toContain('useState');
  });
});
