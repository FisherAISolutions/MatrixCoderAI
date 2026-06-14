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
});
