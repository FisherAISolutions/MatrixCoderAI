/**
 * Curated registry of recent stable versions for the most common
 * packages CodePilot users build with.
 *
 * Used by the resolver when auto-adding missing deps to package.json.
 * For packages not in this table, we fall back to `"latest"` — npm
 * resolves it at install time inside the WebContainer.
 *
 * Update strategy:
 *   - Bumping a version here is safe; it only affects newly-added deps.
 *   - Already-installed deps are NEVER touched by the resolver.
 *   - The registry is intentionally hand-curated (not auto-synced) so
 *     we don't ship surprise breakage when an upstream major lands.
 *
 * `devDeps` flag determines which package.json section the resolver
 * adds the entry to.
 */

export interface KnownPackage {
  version: string;
  devDeps?: boolean;
}

export const KNOWN_PACKAGES: Record<string, KnownPackage> = {
  // ----- Core React / Next.js ecosystem -----
  // NOTE: All React 19.x versions <= 19.2.6 are published. We pin to
  // `^19.1.0` rather than `^19.0.0` so npm picks up the recent patch
  // releases (19.0.0 had a couple of edge-case bugs that landed in
  // 19.0.1-19.0.6 and 19.1.x).
  'react': { version: '^19.1.0' },
  'react-dom': { version: '^19.1.0' },
  'next': { version: '^15.1.0' },
  '@types/react': { version: '^19.0.0', devDeps: true },
  '@types/react-dom': { version: '^19.0.0', devDeps: true },
  '@types/node': { version: '^20.0.0', devDeps: true },

  // ----- Styling -----
  'tailwindcss': { version: '^3.4.0', devDeps: true },
  'tailwindcss-animate': { version: '^1.0.7', devDeps: true },
  '@tailwindcss/typography': { version: '^0.5.16' },
  '@tailwindcss/forms': { version: '^0.5.10' },
  'autoprefixer': { version: '^10.4.0', devDeps: true },
  'postcss': { version: '^8.4.0', devDeps: true },
  'sass': { version: '^1.77.0', devDeps: true },
  'clsx': { version: '^2.1.1' },
  'class-variance-authority': { version: '^0.7.1' },
  'tailwind-merge': { version: '^2.5.0' },

  // ----- UI / Animation libs -----
  'framer-motion': { version: '^11.11.0' },
  'motion': { version: '^11.11.0' },
  'lucide-react': { version: '^0.460.0' },
  '@heroicons/react': { version: '^2.2.0' },
  'react-icons': { version: '^5.4.0' },
  'sonner': { version: '^1.7.0' },
  'react-hot-toast': { version: '^2.4.1' },
  '@radix-ui/react-dialog': { version: '^1.1.4' },
  '@radix-ui/react-dropdown-menu': { version: '^2.1.4' },
  '@radix-ui/react-popover': { version: '^1.1.4' },
  '@radix-ui/react-slot': { version: '^1.1.1' },
  '@radix-ui/react-tabs': { version: '^1.1.2' },
  '@radix-ui/react-toast': { version: '^1.2.4' },
  '@radix-ui/react-tooltip': { version: '^1.1.4' },
  'recharts': { version: '^2.15.0' },
  '@dnd-kit/core': { version: '^6.3.1' },

  // ----- Forms / validation -----
  'react-hook-form': { version: '^7.54.0' },
  '@hookform/resolvers': { version: '^3.10.0' },
  'zod': { version: '^4.0.0' },
  'yup': { version: '^1.6.0' },

  // ----- State / data fetching -----
  'zustand': { version: '^5.0.0' },
  '@tanstack/react-query': { version: '^5.62.0' },
  'swr': { version: '^2.2.5' },
  'axios': { version: '^1.7.0' },

  // ----- Editors / code -----
  '@monaco-editor/react': { version: '^4.7.0' },
  'monaco-editor': { version: '^0.52.0' },
  '@uiw/react-textarea-code-editor': { version: '^3.1.0' },
  'jszip': { version: '^3.10.1' },

  // ----- Auth / backend -----
  '@supabase/supabase-js': { version: '^2.47.0' },
  '@supabase/ssr': { version: '^0.5.2' },
  'firebase': { version: '^11.1.0' },
  'stripe': { version: '^17.5.0' },
  '@stripe/stripe-js': { version: '^5.4.0' },
  '@stripe/react-stripe-js': { version: '^3.1.0' },

  // ----- AI SDKs -----
  'openai': { version: '^4.77.0' },
  '@anthropic-ai/sdk': { version: '^0.32.0' },
  '@google/generative-ai': { version: '^0.21.0' },

  // ----- Utilities -----
  'date-fns': { version: '^4.1.0' },
  'dayjs': { version: '^1.11.13' },
  'uuid': { version: '^11.0.0' },
  '@types/uuid': { version: '^10.0.0', devDeps: true },
  'lodash': { version: '^4.17.21' },
  '@types/lodash': { version: '^4.17.0', devDeps: true },
  'nanoid': { version: '^5.0.9' },

  // ----- Dev tooling -----
  'typescript': { version: '^5.7.0', devDeps: true },
  'eslint': { version: '^9.17.0', devDeps: true },
  'eslint-config-next': { version: '^15.1.0', devDeps: true },
  'eslint-config-prettier': { version: '^9.1.0', devDeps: true },
  'eslint-plugin-prettier': { version: '^5.2.0', devDeps: true },
  'prettier': { version: '^3.4.0', devDeps: true },
  '@typescript-eslint/parser': { version: '^8.18.0', devDeps: true },
  '@typescript-eslint/eslint-plugin': { version: '^8.18.0', devDeps: true },
  '@eslint/eslintrc': { version: '^3.2.0', devDeps: true },

  // ----- Vite ecosystem (when AI scaffolds Vite instead of Next) -----
  'vite': { version: '^6.0.0', devDeps: true },
  '@vitejs/plugin-react': { version: '^4.3.0', devDeps: true },
  '@vitejs/plugin-react-swc': { version: '^3.7.0', devDeps: true },
};

/**
 * Decide whether a given package should land in devDependencies even
 * if we don't have an explicit entry in KNOWN_PACKAGES.
 *
 * Used as a fallback so `@types/foo`, `eslint-*`, and friends always
 * go to the right section.
 */
export function isLikelyDevDep(pkgName: string): boolean {
  if (pkgName.startsWith('@types/')) return true;
  if (pkgName.startsWith('eslint')) return true;
  if (pkgName.startsWith('@eslint/')) return true;
  if (pkgName.startsWith('@typescript-eslint/')) return true;
  if (pkgName.startsWith('@vitejs/')) return true;
  if (
    [
      'typescript', 'prettier', 'tailwindcss', 'postcss', 'autoprefixer',
      'sass', 'less', 'vite', 'webpack', 'rollup', 'esbuild',
      '@babel/core', '@babel/preset-env', '@babel/preset-react',
      'babel-loader', 'ts-node', 'tsx', 'nodemon', 'jest', 'vitest',
      '@testing-library/react', '@testing-library/jest-dom',
      'cypress', 'playwright', 'happy-dom', 'jsdom',
    ].includes(pkgName)
  ) {
    return true;
  }
  return false;
}

/**
 * Look up the curated version for a package, or return `"latest"` as
 * a fallback. Callers can still override.
 */
export function pickVersionFor(pkgName: string): { version: string; devDeps: boolean } {
  const known = KNOWN_PACKAGES[pkgName];
  if (known) return { version: known.version, devDeps: !!known.devDeps };
  return { version: 'latest', devDeps: isLikelyDevDep(pkgName) };
}
