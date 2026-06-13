'use client';
/**
 * Matrix-themed Monaco editor wrapper (Milestone C + Monaco-bugfix pass).
 *
 * Why a wrapper instead of using <Editor/> directly inside FileViewer?
 *   1. Define the Matrix theme exactly ONCE per app session (theme defs
 *      are global on `monaco.editor`).
 *   2. Configure consistent options (font, line numbers, minimap off,
 *      cursor style, etc.) in a single place.
 *   3. Bind Ctrl/Cmd+S to the host save handler.
 *   4. Lazy-load via next/dynamic so Monaco never lands in the SSR bundle
 *      and the chat workspace doesn't pay for it until the user actually
 *      edits a file.
 *
 * Monaco-bugfix pass — why .tsx files were rendering as "plain text":
 *
 *   The previous version derived `language` from `file.language` (an
 *   internal `FileLanguage` enum) and never told Monaco the file
 *   EXTENSION. @monaco-editor/react creates one model per render, and
 *   without a `path` prop the model URI is generated as `inmemory://…`
 *   with no extension. Monaco's TypeScript language service uses the
 *   URI extension to decide whether a file is `.ts` vs `.tsx` (JSX
 *   parsing only kicks in for `.tsx`), so every TSX file ended up
 *   parsed as plain TypeScript — no JSX highlighting, no React error
 *   surfacing, no hover info.
 *
 *   Fix: take `path` directly from the FileNode, pass it as Monaco's
 *   `path` prop so the model URI has the right extension, and let
 *   Monaco infer the language from the extension (`.tsx`, `.ts`,
 *   `.jsx`, `.js`, `.json`, `.css`, …). We still keep a fallback path
 *   that includes the extension when the host didn't pass one.
 *
 *   Additionally, the TypeScript compiler defaults are configured so
 *   the language service treats files as a React + Next.js project
 *   (jsx: ReactJSX, allowJs, esModuleInterop, moduleResolution: NodeJs,
 *   target: ES2020). Diagnostics are enabled (syntactic + semantic)
 *   so red squiggles + hover info show up.
 */

import { useId } from 'react';
import dynamic from 'next/dynamic';
import type { OnMount, BeforeMount } from '@monaco-editor/react';
import type { FileLanguage } from '@/app/chat-workspace/components/types';

// Dynamic import — Monaco is a big dependency and is only needed in edit
// mode. ssr:false ensures it never lands in the server bundle.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full text-xs font-mono text-matrix-green-muted"
      data-testid="monaco-loading"
    >
      <span className="animate-pulse">// loading editor…</span>
    </div>
  ),
});

interface Props {
  value: string;
  /**
   * Internal CodePilot language enum. Kept for backwards compatibility,
   * but now only used as a fallback when no `path` is available. The
   * authoritative source of language is the file extension on `path`.
   */
  language?: FileLanguage;
  /**
   * Full project-relative file path (e.g. `src/app/page.tsx`,
   * `package.json`, `tailwind.config.ts`). When provided, Monaco creates
   * a stable model URI ending in the correct extension — this is what
   * makes .tsx files parse as JSX and .ts files as plain TypeScript.
   *
   * If omitted, we synthesize a path that at least carries the right
   * extension based on `language` so editors don't degrade silently.
   */
  path?: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Language / extension helpers
// ---------------------------------------------------------------------------

/**
 * Map a FileLanguage enum value to the file extension Monaco needs to
 * pick the right language service. Used ONLY as a fallback when the
 * host didn't pass `path`.
 */
function fallbackExtensionFor(language?: FileLanguage): string {
  switch (language) {
    case 'typescript':
      return '.ts';
    case 'javascript':
      return '.js';
    case 'python':
      return '.py';
    case 'css':
      return '.css';
    case 'html':
      return '.html';
    case 'json':
      return '.json';
    case 'markdown':
      return '.md';
    case 'bash':
      return '.sh';
    case 'sql':
      return '.sql';
    case 'yaml':
      return '.yaml';
    default:
      return '.txt';
  }
}

/**
 * Derive a Monaco language ID from a file path's extension.
 * Returns `undefined` when we want Monaco to infer from the model URI
 * itself (preferred for .ts/.tsx — keeps JSX detection working).
 */
function languageFromPath(path: string): string | undefined {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return undefined;
  switch (m[1]) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'css':
      return 'css';
    case 'scss':
    case 'sass':
      return 'scss';
    case 'less':
      return 'less';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'sql':
      return 'sql';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
      return 'java';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'env':
      return 'shell';
    default:
      return undefined;
  }
}

/**
 * Compute the final path Monaco should see. We make sure:
 *   - .ts / .tsx / .js / .jsx are preserved verbatim (drives JSX detection)
 *   - root files like `package.json`, `tailwind.config.ts`, `.env` keep
 *     their extension so the JSON / TS / shell language service kicks in
 *   - when no path is provided, we synthesize one with the right extension
 */
function resolveEditorPath(path?: string, language?: FileLanguage): string {
  if (path && path.trim().length > 0) return path;
  return `untitled${fallbackExtensionFor(language)}`;
}

// ---------------------------------------------------------------------------
// One-time TypeScript / language service configuration
// ---------------------------------------------------------------------------

let tsDefaultsConfigured = false;
let reactTypesAdded = false;

/**
 * Minimal ambient declaration block so the TS service doesn't yell
 * about missing React / JSX types when the project hasn't installed
 * them yet. Real `@types/react` (when the user has it in deps) takes
 * precedence the moment the file's import resolves.
 *
 * Kept intentionally tiny — we don't want to ship the full React types
 * just to make squiggles work for tutorial-sized snippets.
 */
const REACT_AMBIENT_FALLBACK = `
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ReactNode = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type FC<P = {}> = (props: P) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type CSSProperties = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useState<S>(initial: S): [S, (next: S) => void];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useEffect(fn: () => any, deps?: any[]): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useMemo<T>(fn: () => T, deps: any[]): T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useRef<T>(initial: T | null): { current: T | null };
}

declare namespace JSX {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface IntrinsicElements { [elem: string]: any; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Element { type: any; props: any; key: any; }
}
`;

/**
 * Configure Monaco's TypeScript + JavaScript language services so the
 * TSX / JSX experience matches the user's expectations from VS Code.
 *
 * Idempotent — running this multiple times is fine (the second call
 * just overwrites the previous defaults), but we gate behind a flag
 * to avoid re-parsing the React fallback typings on every mount.
 */
function configureTypeScriptDefaults(monaco: Parameters<BeforeMount>[0]): void {
  if (tsDefaultsConfigured) return;
  tsDefaultsConfigured = true;

  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: false,
    noEmit: true,
    allowNonTsExtensions: true,
    lib: ['esnext', 'dom', 'dom.iterable'],
    baseUrl: '.',
    paths: { '@/*': ['./src/*'] },
  });

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    // Suppress noisy diagnostics that fire because we can't resolve
    // node_modules from inside the in-browser language service:
    //   2307 — Cannot find module
    //   2304 — Cannot find name (e.g. `process`, `Buffer`)
    //   2305 — Module has no exported member (often false-positive
    //          because we ship a minimal React fallback below).
    //   1375 — 'await' expressions are only allowed at the top level
    //          of a file when that file is a module.
    //   1378 — Top-level 'await' expressions are only allowed when
    //          'module' is 'esnext' or higher (already set, but the
    //          model URI default sometimes overrides).
    diagnosticCodesToIgnore: [2307, 2304, 2305, 1375, 1378],
  });

  // Mirror the same settings for plain JS / JSX so .jsx files highlight
  // correctly and don't trip "JSX requires a JSX flag" errors.
  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    noEmit: true,
    allowNonTsExtensions: true,
    lib: ['esnext', 'dom', 'dom.iterable'],
  });

  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [2307, 2304, 2305],
  });

  // Eagerly load ts.workerOptions — without this, the worker may not
  // pick up the new defaults until the first model is opened.
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.javascriptDefaults.setEagerModelSync(true);

  if (!reactTypesAdded) {
    ts.typescriptDefaults.addExtraLib(
      REACT_AMBIENT_FALLBACK,
      'file:///node_modules/@types/react/index.d.ts'
    );
    ts.javascriptDefaults.addExtraLib(
      REACT_AMBIENT_FALLBACK,
      'file:///node_modules/@types/react/index.d.ts'
    );
    reactTypesAdded = true;
  }
}

// ---------------------------------------------------------------------------
// Matrix theme
// ---------------------------------------------------------------------------

const MATRIX_THEME_NAME = 'codepilot-matrix';
const matrixTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: '', foreground: '00ff41' },
    { token: 'comment', foreground: '006600', fontStyle: 'italic' },
    { token: 'keyword', foreground: '00ff41', fontStyle: 'bold' },
    { token: 'string', foreground: 'ffaa00' },
    { token: 'number', foreground: 'ffaa00' },
    { token: 'regexp', foreground: 'ffaa00' },
    { token: 'type', foreground: '4da6ff' },
    { token: 'type.identifier', foreground: '4da6ff' },
    { token: 'identifier', foreground: '00ff41' },
    { token: 'delimiter', foreground: '00cc33' },
    { token: 'operator', foreground: '00cc33' },
    { token: 'tag', foreground: '4da6ff' },
    { token: 'attribute.name', foreground: 'cc44ff' },
    { token: 'attribute.value', foreground: 'ffaa00' },
    { token: 'variable', foreground: '00ff41' },
    { token: 'variable.predefined', foreground: '4da6ff' },
    { token: 'function', foreground: '00ff41', fontStyle: 'bold' },
    { token: 'invalid', foreground: 'ff4444' },
  ],
  colors: {
    'editor.background': '#0a0a0a',
    'editor.foreground': '#00ff41',
    'editor.lineHighlightBackground': '#001a00',
    'editor.lineHighlightBorder': '#001a00',
    'editorLineNumber.foreground': '#006600',
    'editorLineNumber.activeForeground': '#00ff41',
    'editorCursor.foreground': '#00ff41',
    'editor.selectionBackground': '#003b00',
    'editor.inactiveSelectionBackground': '#001a00',
    'editor.selectionHighlightBackground': '#001a00',
    'editor.wordHighlightBackground': '#001a00',
    'editor.findMatchBackground': '#003b00',
    'editor.findMatchHighlightBackground': '#001a00',
    'editorBracketMatch.background': '#003b00',
    'editorBracketMatch.border': '#00ff41',
    'editorIndentGuide.background': '#003b00',
    'editorIndentGuide.activeBackground': '#006600',
    'editorWhitespace.foreground': '#003b00',
    'editorWidget.background': '#0d1a0d',
    'editorWidget.border': '#003b00',
    'editorSuggestWidget.background': '#0d1a0d',
    'editorSuggestWidget.border': '#003b00',
    'editorSuggestWidget.foreground': '#00ff41',
    'editorSuggestWidget.selectedBackground': '#003b00',
    'editorSuggestWidget.highlightForeground': '#00ff41',
    'scrollbarSlider.background': '#003b0066',
    'scrollbarSlider.hoverBackground': '#006600aa',
    'scrollbarSlider.activeBackground': '#00ff41aa',
    'editorGutter.background': '#0a0a0a',
    'minimap.background': '#0a0a0a',
  },
};

// ---------------------------------------------------------------------------

export default function MatrixMonacoEditor({
  value,
  language,
  path,
  onChange,
  onSave,
  readOnly,
}: Props) {
  // Stable instance ID — used to namespace synthetic paths when the
  // host doesn't pass a real `path`. Prevents collisions when multiple
  // editors are mounted (history navigation, etc.).
  const instanceId = useId();

  const editorPath = resolveEditorPath(path, language);
  // Detect the Monaco language ID from the extension. When the file
  // is .ts/.tsx/.js/.jsx we return 'typescript' / 'javascript' — but
  // we also rely on the path's extension being correct in the model
  // URI, because Monaco's TS service uses the URI to decide JSX vs
  // plain TS parsing.
  const detectedLanguage =
    languageFromPath(editorPath) ?? (language ? languageFromPath(`x${fallbackExtensionFor(language)}`) : undefined);

  const handleBeforeMount: BeforeMount = (monaco) => {
    // Idempotent: re-defining the same theme just replaces it.
    monaco.editor.defineTheme(MATRIX_THEME_NAME, matrixTheme);
    configureTypeScriptDefaults(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    monaco.editor.setTheme(MATRIX_THEME_NAME);

    if (onSave) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave();
      });
    }
  };

  // The `path` prop on @monaco-editor/react becomes the model's URI
  // (or matches an existing model with that URI, enabling cross-file
  // navigation). Including the file extension here is what makes the
  // .tsx language service kick in.
  const monacoPath = editorPath.includes('.')
    ? editorPath
    : `${editorPath}.${detectedLanguage === 'javascript' ? 'jsx' : 'tsx'}`;

  // Defensive: ensure the path is unique per editor instance so React
  // hot-reload + parallel viewers never share a stale model. We DON'T
  // do this for real paths because that would defeat go-to-definition
  // across views — only synthetic fallbacks get the suffix.
  const finalPath =
    path && path.trim().length > 0
      ? monacoPath
      : `${instanceId}-${monacoPath}`;

  return (
    <MonacoEditor
      value={value}
      // When we have a TS/JS family extension on the path, prefer the
      // model URI (let Monaco infer JSX from the extension). For other
      // languages, set both — Monaco honours `language` and the path
      // becomes the URI tag.
      language={detectedLanguage}
      path={finalPath}
      defaultPath={finalPath}
      theme={MATRIX_THEME_NAME}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(v) => onChange(v ?? '')}
      options={{
        readOnly: readOnly ?? false,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorStyle: 'line',
        cursorWidth: 2,
        renderLineHighlight: 'all',
        roundedSelection: false,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        padding: { top: 12, bottom: 12 },
        automaticLayout: true,
        wordWrap: 'on',
        tabSize: 2,
        insertSpaces: true,
        renderWhitespace: 'selection',
        guides: {
          indentation: true,
          highlightActiveIndentation: true,
        },
        bracketPairColorization: { enabled: true },
        // Quick-suggestion + IntelliSense — these were implicit before
        // but worth pinning explicitly so the TSX experience matches
        // what users expect from VS Code.
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        snippetSuggestions: 'top',
      }}
    />
  );
}
