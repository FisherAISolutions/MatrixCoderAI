/**
 * Static style audit — detects the "compiles but renders as
 * browser-default HTML" failure mode (June 2026 user report: generated
 * calorie tracker ran perfectly but shipped completely unstyled).
 *
 * Pure static analysis on the file tree (no WebContainer needed), so it
 * is effectively free. Runs as a validation step AFTER compilation
 * succeeds; failures feed the auto-fix loop exactly like build errors.
 *
 * Checks (Tailwind projects only — skipped otherwise):
 *   1. A global stylesheet exists and actually loads Tailwind
 *      (v3: `@tailwind base/components/utilities`; v4: `@import "tailwindcss"`).
 *   2. The root layout imports a stylesheet — the #1 cause of fully
 *      unstyled apps is a layout.tsx that never imports globals.css.
 *   3. PostCSS config exists and registers the plugin matching the
 *      installed Tailwind major.
 *   4. tailwind.config content globs cover the source roots actually in
 *      use (utilities used under uncovered roots are purged → no CSS).
 *   5. Components actually use Tailwind utility classes at all.
 */

import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import type { ParsedError } from './errorParser';

// Common Tailwind utility tokens — broad but specific enough to avoid
// matching ordinary prose. Used to verify components are actually styled.
const UTILITY_TOKEN_REGEX =
  /(?<![\w-])(?:flex|grid|hidden|inline-flex|p-\d|px-\d|py-\d|pt-\d|pb-\d|pl-\d|pr-\d|m-\d|mx-auto|mx-\d|my-\d|mt-\d|mb-\d|gap-\d|space-y-\d|space-x-\d|text-(?:xs|sm|base|lg|[2-9]?xl|center|left|right)|font-(?:bold|semibold|medium|light)|bg-[a-z]+-\d{2,3}|text-[a-z]+-\d{2,3}|border-[a-z]+-\d{2,3}|rounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?|shadow(?:-(?:sm|md|lg|xl|2xl))?|items-(?:center|start|end)|justify-(?:between|center|start|end|around)|w-full|h-(?:full|screen)|max-w-(?:xs|sm|md|lg|[2-9]?xl|full)|min-h-screen|grid-cols-\d|(?:hover|focus|sm|md|lg|xl):[a-z-]+)(?![\w-])/;

// className="..." / className='...' / className={`...`}
const CLASSNAME_ATTR_REGEX =
  /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/g;

export interface StyleAuditResult {
  /** False when this is not a Tailwind project (audit does not apply). */
  applicable: boolean;
  errors: ParsedError[];
  /** Human-readable findings summary (✓/✗ per check). */
  log: string;
}

function hasV3Directives(css: string): boolean {
  return css.includes('@tailwind base') && css.includes('@tailwind utilities');
}

function hasV4Import(css: string): boolean {
  return /@import\s+["']tailwindcss["']/.test(css);
}

export function runStyleAudit(files: FileNode[]): StyleAuditResult {
  const flat = flattenTree(files).filter(
    (f) => f.type === 'file' && typeof f.content === 'string'
  );
  const byPath = new Map(flat.map((f) => [f.path, f]));

  // ----- Is this a Tailwind project at all? -----
  let tailwindRange: string | undefined;
  const pkgNode = byPath.get('package.json');
  if (pkgNode) {
    try {
      const pkg = JSON.parse(pkgNode.content!);
      tailwindRange =
        pkg.devDependencies?.tailwindcss ?? pkg.dependencies?.tailwindcss;
    } catch {
      // Unparseable package.json is reported by the install step.
    }
  }
  const tailwindConfig = flat.find((f) =>
    /^tailwind\.config\.(?:m?js|ts|cjs)$/.test(f.path)
  );

  if (!tailwindRange && !tailwindConfig) {
    return {
      applicable: false,
      errors: [],
      log: 'Not a Tailwind project — style audit skipped.',
    };
  }

  const majorMatch = tailwindRange?.match(/(\d+)/);
  // Default to v3 (the curated registry + scaffold prompt pin ^3.4.0).
  const tailwindMajor = majorMatch ? Number(majorMatch[1]) : 3;
  const isV4 = tailwindMajor >= 4;

  const errors: ParsedError[] = [];
  const findings: string[] = [];
  const fail = (file: string | undefined, message: string) => {
    errors.push({ source: 'styling', file, message, raw: message });
    findings.push(`✗ ${message}`);
  };
  const pass = (message: string) => findings.push(`✓ ${message}`);

  // ----- 1. Global stylesheet loads Tailwind -----
  const cssFiles = flat.filter((f) => f.path.endsWith('.css'));
  const entryCss =
    byPath.get('src/app/globals.css') ??
    byPath.get('app/globals.css') ??
    cssFiles.find((f) => hasV3Directives(f.content!) || hasV4Import(f.content!)) ??
    cssFiles[0];

  if (!entryCss) {
    fail(
      'src/app/globals.css',
      'No global stylesheet found. Create globals.css starting with `@tailwind base;` `@tailwind components;` `@tailwind utilities;` and import it from the root layout.'
    );
  } else {
    const css = entryCss.content!;
    if (isV4) {
      if (!hasV4Import(css)) {
        fail(
          entryCss.path,
          hasV3Directives(css)
            ? `tailwindcss@^${tailwindMajor} is installed but \`${entryCss.path}\` uses the Tailwind v3 \`@tailwind\` directives, which generate NO CSS under v4. Use \`@import "tailwindcss";\` and the \`@tailwindcss/postcss\` plugin to match the installed major.`
            : `\`${entryCss.path}\` does not load Tailwind. With tailwindcss@^${tailwindMajor} add \`@import "tailwindcss";\` at the top.`
        );
      } else {
        pass('global stylesheet uses the Tailwind v4 @import');
      }
    } else if (!hasV3Directives(css)) {
      fail(
        entryCss.path,
        hasV4Import(css)
          ? `tailwindcss@^${tailwindMajor} (v3) is installed but \`${entryCss.path}\` uses the v4 \`@import "tailwindcss"\` syntax, which generates NO CSS under v3. Replace it with the three directives: \`@tailwind base;\` \`@tailwind components;\` \`@tailwind utilities;\`.`
          : `\`${entryCss.path}\` is missing the Tailwind directives. It must start with \`@tailwind base;\` \`@tailwind components;\` \`@tailwind utilities;\` or Tailwind generates no CSS at all.`
      );
    } else {
      pass('global stylesheet contains the @tailwind directives');
    }
  }

  // ----- 2. Root layout imports a stylesheet -----
  const layout =
    byPath.get('src/app/layout.tsx') ??
    byPath.get('app/layout.tsx') ??
    byPath.get('src/app/layout.jsx') ??
    byPath.get('app/layout.jsx');
  if (layout) {
    if (!/import\s+['"][^'"]+\.css['"]/.test(layout.content!)) {
      fail(
        layout.path,
        `\`${layout.path}\` does not import any stylesheet. Add \`import './globals.css';\` as its first import — without this single line the ENTIRE app renders as unstyled browser-default HTML.`
      );
    } else {
      pass('root layout imports a stylesheet');
    }
  }
  // (A missing layout entirely is caught by build/runtime steps.)

  // ----- 3. PostCSS plugin matches the installed major -----
  const postcss = flat.find((f) =>
    /^postcss\.config\.(?:m?js|ts|cjs)$/.test(f.path)
  );
  if (!isV4) {
    if (!postcss) {
      fail(
        'postcss.config.js',
        'postcss.config.js is missing — the `@tailwind` directives in globals.css are never compiled, so no Tailwind CSS reaches the browser. Create it with `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`'
      );
    } else if (postcss.content!.includes('@tailwindcss/postcss')) {
      fail(
        postcss.path,
        `\`${postcss.path}\` registers the Tailwind v4 plugin (\`@tailwindcss/postcss\`) but tailwindcss v${tailwindMajor} is installed. Use \`plugins: { tailwindcss: {}, autoprefixer: {} }\` instead.`
      );
    } else if (!postcss.content!.includes('tailwindcss')) {
      fail(
        postcss.path,
        `\`${postcss.path}\` does not register the \`tailwindcss\` plugin, so utility classes are never generated.`
      );
    } else {
      pass('postcss config registers the tailwindcss plugin');
    }
  } else if (postcss && !postcss.content!.includes('@tailwindcss/postcss')) {
    fail(
      postcss.path,
      `tailwindcss@^${tailwindMajor} requires the \`@tailwindcss/postcss\` plugin in \`${postcss.path}\` (the plain \`tailwindcss\` plugin only works with v3).`
    );
  }

  // ----- 4. Content globs cover the real source roots (v3 only) -----
  if (!isV4) {
    if (tailwindConfig) {
      const cfg = tailwindConfig.content!;
      const srcSources = flat.some(
        (f) => f.path.startsWith('src/') && /\.(?:tsx|jsx|ts|js|mdx)$/.test(f.path)
      );
      const appSources = flat.some(
        (f) => f.path.startsWith('app/') && /\.(?:tsx|jsx|ts|js|mdx)$/.test(f.path)
      );
      if (srcSources && !/['"`]\.?\/?src\//.test(cfg)) {
        fail(
          tailwindConfig.path,
          `\`${tailwindConfig.path}\` content globs do not cover \`./src\` — every utility class used under src/ is purged from the generated CSS. Add \`'./src/**/*.{js,ts,jsx,tsx,mdx}'\` to the \`content\` array.`
        );
      } else if (appSources && !/['"`]\.?\/?app\//.test(cfg)) {
        fail(
          tailwindConfig.path,
          `\`${tailwindConfig.path}\` content globs do not cover \`./app\` — utility classes used under app/ are purged. Add \`'./app/**/*.{js,ts,jsx,tsx,mdx}'\` to the \`content\` array.`
        );
      } else {
        pass('tailwind config content globs cover the source roots');
      }
    } else if (tailwindRange) {
      fail(
        'tailwind.config.js',
        'tailwindcss is installed but tailwind.config.* is missing — without content globs no utilities are generated. Create tailwind.config.js with `content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"]`.'
      );
    }
  }

  // ----- 5. Components actually use Tailwind utility classes -----
  const componentFiles = flat.filter(
    (f) => /\.(?:tsx|jsx)$/.test(f.path) && !f.path.endsWith('.d.ts')
  );
  if (componentFiles.length > 0) {
    let classValues = '';
    for (const f of componentFiles) {
      CLASSNAME_ATTR_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CLASSNAME_ATTR_REGEX.exec(f.content!)) !== null) {
        classValues += ` ${m[1] ?? m[2] ?? m[3] ?? ''}`;
      }
    }
    let styled = UTILITY_TOKEN_REGEX.test(classValues);
    if (!styled) {
      // Lenient fallback — dynamic className expressions (cn(), clsx(),
      // ternaries) don't match the literal-attr regex; scan whole files.
      styled = componentFiles.some(
        (f) =>
          f.content!.includes('className') && UTILITY_TOKEN_REGEX.test(f.content!)
      );
    }
    if (!styled) {
      const mainPage =
        byPath.get('src/app/page.tsx') ?? byPath.get('app/page.tsx');
      fail(
        mainPage?.path ?? componentFiles[0].path,
        'No Tailwind utility classes were found in any component — the app renders as browser-default HTML. Restyle every page and component to a production-quality bar: responsive layout (sm:/md:/lg:), a styled navigation bar, cards with padding/rounded corners/shadows, styled buttons with hover states, styled form inputs with labels and focus rings, a consistent spacing scale, and a clear typography hierarchy.'
      );
    } else {
      pass('components use Tailwind utility classes');
    }
  }

  const header = `Style audit (tailwindcss v${tailwindMajor} project) — ${errors.length === 0 ? 'PASSED' : `${errors.length} issue(s) found`}`;
  return {
    applicable: true,
    errors,
    log: [header, ...findings].join('\n'),
  };
}
