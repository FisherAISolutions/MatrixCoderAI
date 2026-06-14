/**
 * Regression tests for `extractFromAssistantResponse` — focused on the
 * "AI emits malformed edit fences and the system pretends success"
 * bug-class.
 *
 * Real-world reproduction (2026-01): the model emitted
 *
 *     ```edit:src/app/layout.tsx
 *     =======
 *     <new code>
 *     >>>>>>> REPLACE
 *     ```
 *
 * — missing the `<<<<<<< SEARCH` marker entirely. The previous
 * extractor `console.warn`-ed but returned `edits: []`, so ChatComposer
 * believed there was nothing to do, the AI's prose ("Files written: …")
 * stayed visible, and the user thought the edit had landed.
 *
 * The fix surfaces these malformed fences via `malformedEdits: string[]`
 * on `ExtractedResponse` so the caller can emit a HARD persistent
 * patch-failure system message.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeResponseCompleteness,
  extractFromAssistantResponse,
} from '@/lib/repo/extractors';

describe('extractFromAssistantResponse — valid fences (regression baseline)', () => {
  it('extracts a well-formed SEARCH/REPLACE block', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0].path).toBe('src/foo.ts');
    expect(r.edits[0].search).toBe('const x = 1;');
    expect(r.edits[0].replace).toBe('const x = 2;');
    expect(r.malformedEdits).toEqual([]);
  });

  it('extracts multiple SEARCH/REPLACE pairs inside one fence', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
const a = 1;
=======
const a = 11;
>>>>>>> REPLACE
<<<<<<< SEARCH
const b = 2;
=======
const b = 22;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(2);
    expect(r.malformedEdits).toEqual([]);
  });

  it('extracts a full-file CREATE fence for a missing local import target', () => {
    const input = `
\`\`\`tsx
// path: src/components/HistoryPage.tsx
export default function HistoryPage() {
  return <main>History</main>;
}
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.creates).toHaveLength(1);
    expect(r.creates[0].path).toBe('src/components/HistoryPage.tsx');
    expect(r.creates[0].content).toContain('export default function HistoryPage');
    expect(r.edits).toEqual([]);
    expect(r.malformedEdits).toEqual([]);
  });
});

describe('REGRESSION — malformed edit fences must NOT pretend success', () => {
  it('flags a fence missing the `<<<<<<< SEARCH` marker (the real-world bug)', () => {
    // This is the EXACT pattern the model emitted in the user's bug
    // report — no SEARCH marker, just =======, replacement, >>>>>>> REPLACE.
    const input = `
\`\`\`edit:src/app/layout.tsx
=======
import { useEffect, useState } from 'react';
const X = 1;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(0);
    expect(r.malformedEdits).toEqual(['src/app/layout.tsx']);
  });

  it('flags a fence missing the `=======` separator', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
const x = 1;
const x = 2;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(0);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
  });

  it('flags a fence missing the `>>>>>>> REPLACE` closer', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(0);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
  });

  it('de-duplicates malformedEdits when the same path appears twice', () => {
    const input = `
\`\`\`edit:src/foo.ts
=======
new code 1
>>>>>>> REPLACE
\`\`\`

\`\`\`edit:src/foo.ts
=======
new code 2
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(0);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
  });

  it('still extracts the well-formed sibling fence when one fence is malformed', () => {
    const input = `
\`\`\`edit:src/good.ts
<<<<<<< SEARCH
const a = 1;
=======
const a = 99;
>>>>>>> REPLACE
\`\`\`

\`\`\`edit:src/bad.ts
=======
const b = 99;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0].path).toBe('src/good.ts');
    expect(r.malformedEdits).toEqual(['src/bad.ts']);
  });
});

describe('extractFromAssistantResponse — empty / no-fence inputs', () => {
  it('returns empty arrays for plain prose with no fences', () => {
    const r = extractFromAssistantResponse(
      'Hello world. Files written: src/foo.ts'
    );
    expect(r.edits).toEqual([]);
    expect(r.creates).toEqual([]);
    expect(r.malformedEdits).toEqual([]);
  });

  it('returns empty arrays for an empty string', () => {
    const r = extractFromAssistantResponse('');
    expect(r.edits).toEqual([]);
    expect(r.creates).toEqual([]);
    expect(r.malformedEdits).toEqual([]);
  });
});

describe('REGRESSION — malformed edit fences report SPECIFIC reasons', () => {
  it('reports "missing `<<<<<<< SEARCH` marker" when only that marker is missing', () => {
    const input = `
\`\`\`edit:app/layout.tsx
<body className="bg-gray-100">
=======
<body className="bg-gray-900 text-white">
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.malformedEdits).toEqual(['app/layout.tsx']);
    expect(r.malformedEditReasons['app/layout.tsx']).toMatch(
      /missing `<<<<<<< SEARCH` marker/i
    );
  });

  it('reports "missing `=======` separator" when only that marker is missing', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
const a = 1;
const a = 2;
>>>>>>> REPLACE
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
    expect(r.malformedEditReasons['src/foo.ts']).toMatch(
      /missing `=======` separator/i
    );
  });

  it('reports "missing `>>>>>>> REPLACE`" when only that marker is missing', () => {
    const input = `
\`\`\`edit:src/foo.ts
<<<<<<< SEARCH
old
=======
new
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
    expect(r.malformedEditReasons['src/foo.ts']).toMatch(
      /missing `>>>>>>> REPLACE` marker/i
    );
  });

  it('reports "no SEARCH/REPLACE markers at all" when the body is bare prose', () => {
    const input = `
\`\`\`edit:src/foo.ts
just some text, no markers
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
    expect(r.malformedEditReasons['src/foo.ts']).toMatch(
      /no SEARCH\/REPLACE markers at all/i
    );
  });

  it('preserves the FIRST diagnostic when the same path is malformed twice', () => {
    const input = `
\`\`\`edit:src/foo.ts
=======
new 1
>>>>>>> REPLACE
\`\`\`

\`\`\`edit:src/foo.ts
just prose
\`\`\`
`;
    const r = extractFromAssistantResponse(input);
    expect(r.malformedEdits).toEqual(['src/foo.ts']);
    // Should keep the first (missing-SEARCH) reason, not be overwritten
    // by the second (no-markers) fence.
    expect(r.malformedEditReasons['src/foo.ts']).toMatch(
      /missing `<<<<<<< SEARCH` marker/i
    );
  });
});

describe('REGRESSION - truncated generation responses block validation', () => {
  it('detects an unclosed CREATE fence and reports the truncated path', () => {
    const input = `
\`\`\`tsx
// path: src/components/HistoryTable.tsx
export default function HistoryTable() {
  return <div>
`;
    const extracted = extractFromAssistantResponse(input);
    const audit = analyzeResponseCompleteness(input, extracted);

    expect(extracted.creates).toEqual([]);
    expect(audit.blocking).toBe(true);
    expect(audit.issues[0]).toMatchObject({
      kind: 'unclosed-fence',
      path: 'src/components/HistoryTable.tsx',
    });
  });

  it('detects files listed as written but not actually extracted', () => {
    const input = `
\`\`\`json
// path: package.json
{"name":"demo"}
\`\`\`

Files written:
- package.json
- src/app/history/page.tsx
`;
    const extracted = extractFromAssistantResponse(input);
    const audit = analyzeResponseCompleteness(input, extracted);

    expect(extracted.creates.map((file) => file.path)).toEqual(['package.json']);
    expect(audit.blocking).toBe(true);
    expect(audit.issues.some((issue) => issue.path === 'src/app/history/page.tsx')).toBe(true);
  });

  it('keeps complete files extracted before a later unclosed fence', () => {
    const input = `
\`\`\`json
// path: package.json
{"name":"demo"}
\`\`\`

\`\`\`tsx
// path: src/app/page.tsx
export default function Page() {
  return <main>
`;
    const extracted = extractFromAssistantResponse(input);
    const audit = analyzeResponseCompleteness(input, extracted);

    expect(extracted.creates.map((file) => file.path)).toEqual(['package.json']);
    expect(audit.blocking).toBe(true);
    expect(audit.lastCompletePath).toBe('package.json');
    expect(audit.issues.some((issue) => issue.path === 'src/app/page.tsx')).toBe(true);
  });
});
