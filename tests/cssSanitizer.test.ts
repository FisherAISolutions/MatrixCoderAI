import { describe, expect, it } from 'vitest';
import { findCssSanityIssues, sanitizeCssContent } from '@/lib/repo/cssSanitizer';
import type { FileNode } from '@/app/chat-workspace/components/types';

const file = (path: string, content: string): FileNode => ({
  id: path,
  name: path.split('/').pop() ?? path,
  path,
  type: 'file',
  content,
  language: 'css',
  size: content.length,
  lastModified: new Date().toISOString(),
});

describe('cssSanitizer', () => {
  it('removes leaked markdown fences, path comments, and SEARCH/REPLACE markers from CSS', () => {
    const cleaned = sanitizeCssContent(
      'app/globals.css',
      "```css\n// path: app/globals.css\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n=======\n```\n"
    );

    expect(cleaned).toBe(
      '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
    );
  });

  it('reports the exact line and snippet when a marker remains in CSS', () => {
    const issues = findCssSanityIssues([
      file('app/globals.css', '@tailwind base;\n=======\n@tailwind utilities;\n'),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: 'app/globals.css',
      line: 2,
    });
    expect(issues[0].snippet).toContain('2 | =======');
  });

  it('rewrites safe scrollbar pseudo-element @apply usage to plain CSS', () => {
    const cleaned = sanitizeCssContent(
      'src/app/globals.css',
      `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900;
}

::-webkit-scrollbar {
  @apply w-2 bg-transparent;
}

::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded;
}
`
    );

    expect(cleaned).toContain('@apply bg-gray-50 text-gray-900;');
    expect(cleaned).toContain('width: 8px;');
    expect(cleaned).toContain('background: transparent;');
    expect(cleaned).toContain('background: #d1d5db;');
    expect(cleaned).toContain('border-radius: 0.25rem;');
    expect(cleaned).not.toContain('@apply w-2 bg-transparent;');
    expect(cleaned).not.toContain('@apply bg-gray-300 rounded;');
  });

  it('reports pseudo-element @apply usage that cannot be safely rewritten', () => {
    const issues = findCssSanityIssues([
      file(
        'src/app/globals.css',
        `@tailwind base;
@tailwind components;
@tailwind utilities;

::before {
  @apply content-[''] absolute inset-0;
}
`
      ),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('src/app/globals.css');
    expect(issues[0].reason).toMatch(/@apply is unsafe inside pseudo-element/i);
  });
});
