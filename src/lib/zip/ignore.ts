/**
 * Ignore + safety rules for zip import.
 * Single source of truth — keep this list lean and conservative.
 */

const IGNORED_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git', '.cache', 'coverage',
  '.turbo', '.parcel-cache', '.svelte-kit', '__pycache__', '.pytest_cache',
  '.idea', '.vscode', 'venv', '.venv', 'env', '.expo', '.nuxt',
  '.gradle', 'target', 'out', 'tmp', '.tmp', '.yarn',
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', 'package-lock.json',
  'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'composer.lock',
  'Gemfile.lock', '.eslintcache', 'tsconfig.tsbuildinfo',
]);

const BINARY_EXTENSIONS = new Set([
  // images
  'png','jpg','jpeg','gif','webp','heic','heif','ico','bmp','tiff','psd',
  // audio/video
  'mp3','mp4','mov','wav','ogg','flac','aac','avi','webm','mkv','wmv','mpg','mpeg','m4a','m4v',
  // archives
  'zip','tar','gz','tgz','rar','7z','bz2','xz',
  // documents
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  // compiled / native binaries
  'exe','dll','so','dylib','class','jar','war','o','a','obj','wasm','pyc','pyo',
  // fonts
  'ttf','otf','woff','woff2','eot',
  // db / binary data
  'db','sqlite','sqlite3','dat','bin',
]);

export const MAX_FILE_SIZE = 1_000_000; // 1MB per file cap

export function isIgnoredPath(path: string): boolean {
  const segments = path.split('/');
  for (const seg of segments) {
    if (IGNORED_DIRS.has(seg)) return true;
    if (IGNORED_FILES.has(seg)) return true;
  }
  return false;
}

export function isBinaryFilename(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Normalize + reject unsafe paths (traversal, absolute, etc.).
 * Returns null if path should be rejected.
 */
export function sanitizePath(rawPath: string): string | null {
  if (!rawPath) return null;
  // Normalize separators
  let p = rawPath.replace(/\\/g, '/').trim();
  // Strip leading "./" or "/"
  p = p.replace(/^\.?\/+/, '');
  // Strip trailing slash
  p = p.replace(/\/+$/, '');
  if (!p) return null;
  // Reject path traversal and empty segments
  const segs = p.split('/');
  for (const s of segs) {
    if (s === '..' || s === '') return null;
  }
  // Reject absolute Windows-style paths (e.g. C:/...)
  if (/^[a-zA-Z]:\//.test(p)) return null;
  // Limit nesting depth to prevent pathological zips
  if (segs.length > 25) return null;
  return p;
}

/**
 * Sniff first 512 bytes for null byte → likely binary.
 * Cheap and reliable; complements extension allow/deny lists.
 */
export function detectBinaryByContent(content: Uint8Array): boolean {
  const len = Math.min(content.length, 512);
  for (let i = 0; i < len; i++) {
    if (content[i] === 0) return true;
  }
  return false;
}
