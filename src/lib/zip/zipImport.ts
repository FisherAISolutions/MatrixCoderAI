import JSZip from 'jszip';
import {
  isIgnoredPath,
  isBinaryFilename,
  sanitizePath,
  detectBinaryByContent,
  MAX_FILE_SIZE,
} from './ignore';

const LANG_EXT_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'unknown',
  env: 'unknown',
  go: 'unknown',
  rs: 'unknown',
  java: 'unknown',
  kt: 'unknown',
  c: 'unknown',
  cpp: 'unknown',
  h: 'unknown',
  hpp: 'unknown',
  rb: 'unknown',
  php: 'unknown',
  svelte: 'unknown',
  vue: 'unknown',
};

export interface ParsedFile {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
}

export interface ZipImportProgress {
  total: number;
  processed: number;
  skipped: number;
  currentPath?: string;
}

export interface ZipImportResult {
  files: ParsedFile[];
  totalEntries: number;
  imported: number;
  skipped: number;
  skippedReasons: {
    binary: number;
    tooLarge: number;
    ignored: number;
    invalidPath: number;
  };
  rootFolder: string | null;
  projectName: string;
}

// Hardening pass #5 — server-side safety caps for zip imports. Refuse
// pathologically large archives BEFORE we spend memory unzipping them.
export const MAX_ZIP_ENTRIES = 5000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB

function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return LANG_EXT_MAP[ext] ?? 'unknown';
}

/**
 * Many zips wrap everything inside a single top-level folder (e.g. "my-app/...").
 * Detect that and strip it so the imported tree starts at the project root.
 */
function detectRootFolder(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const firstSegs = paths[0].split('/');
  if (firstSegs.length < 2) return null;
  const candidate = firstSegs[0];
  if (!candidate) return null;
  for (const p of paths) {
    if (!p.startsWith(candidate + '/')) return null;
  }
  return candidate;
}

function stripRoot(path: string, root: string | null): string {
  if (!root) return path;
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
}

/**
 * Parse a .zip File into ParsedFile[] in a UI-safe, chunked, memory-aware way.
 *
 *  - Streams entries in chunks of 25 (event loop yields between chunks)
 *  - Skips ignored dirs, lock files, binaries (by ext + null-byte sniff)
 *  - Enforces MAX_FILE_SIZE per file
 *  - Sanitizes paths (no traversal, no absolute paths)
 *  - Reports progress through onProgress callback
 */
export async function parseZipFile(
  file: File,
  onProgress?: (p: ZipImportProgress) => void
): Promise<ZipImportResult> {
  const zip = await JSZip.loadAsync(file);

  const allEntries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    allEntries.push({ path: relativePath, entry });
  });

  // Hardening pass #5 — refuse pathologically large archives early so we
  // don't OOM the browser tab. The error bubbles up to the import handler
  // in ChatWorkspacePage which already shows a clear toast.
  if (allEntries.length > MAX_ZIP_ENTRIES) {
    throw new Error(
      `Zip contains ${allEntries.length} files — limit is ${MAX_ZIP_ENTRIES}. ` +
        `Trim the project (delete node_modules / build outputs / .git) and try again.`
    );
  }
  let totalUncompressed = 0;
  for (const e of allEntries) {
    // _data._dataLength on JSZipObject internals = uncompressedSize (typed loosely)
    const internalLen = (e.entry as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize;
    if (typeof internalLen === 'number') totalUncompressed += internalLen;
  }
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Zip is too large: ${Math.round(totalUncompressed / 1024 / 1024)} MB uncompressed — ` +
        `limit is ${Math.round(MAX_ZIP_UNCOMPRESSED_BYTES / 1024 / 1024)} MB. ` +
        `Remove build outputs / large binary assets and re-zip.`
    );
  }

  const rawPaths = allEntries.map((e) => e.path);
  const rootFolder = detectRootFolder(rawPaths);
  const projectName =
    (rootFolder ?? file.name.replace(/\.zip$/i, '')).trim() || 'imported-project';

  const files: ParsedFile[] = [];
  const reasons = { binary: 0, tooLarge: 0, ignored: 0, invalidPath: 0 };
  let processed = 0;

  const CHUNK_SIZE = 25;

  for (let i = 0; i < allEntries.length; i += CHUNK_SIZE) {
    const chunk = allEntries.slice(i, i + CHUNK_SIZE);

    const chunkResults = await Promise.all(
      chunk.map(async ({ path, entry }) => {
        try {
          const stripped = stripRoot(path, rootFolder);
          const sanitized = sanitizePath(stripped);
          if (!sanitized) {
            reasons.invalidPath++;
            return null;
          }
          if (isIgnoredPath(sanitized)) {
            reasons.ignored++;
            return null;
          }
          const name = sanitized.split('/').pop() ?? sanitized;
          if (isBinaryFilename(name)) {
            reasons.binary++;
            return null;
          }

          const bytes = await entry.async('uint8array');
          if (bytes.byteLength > MAX_FILE_SIZE) {
            reasons.tooLarge++;
            return null;
          }
          if (detectBinaryByContent(bytes)) {
            reasons.binary++;
            return null;
          }

          const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          const parsed: ParsedFile = {
            path: sanitized,
            name,
            content,
            language: getLanguage(name),
            size: content.length,
          };
          return parsed;
        } catch {
          reasons.invalidPath++;
          return null;
        }
      })
    );

    for (const r of chunkResults) {
      if (r) files.push(r);
    }

    processed += chunk.length;
    onProgress?.({
      total: allEntries.length,
      processed,
      skipped:
        reasons.binary + reasons.tooLarge + reasons.ignored + reasons.invalidPath,
      currentPath: chunk[chunk.length - 1]?.path,
    });

    // Yield to event loop so the UI stays responsive on large repos
    await new Promise((res) => setTimeout(res, 0));
  }

  return {
    files,
    totalEntries: allEntries.length,
    imported: files.length,
    skipped: reasons.binary + reasons.tooLarge + reasons.ignored + reasons.invalidPath,
    skippedReasons: reasons,
    rootFolder,
    projectName,
  };
}
