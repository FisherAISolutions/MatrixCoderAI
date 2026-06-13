/**
 * GitHub repository import.
 *
 * Reuses the same `ParsedFile[]` shape produced by `parseZipFile` so the
 * existing ingestion pipeline (bulkSaveFiles → buildFileTree → indexer)
 * works unchanged. The only new code path is the network fetch +
 * recursive tree walk implemented here.
 *
 * Approach — single API call, server-side recursion:
 *   GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1
 *
 * This returns every blob in the tree in one shot (subject to GitHub's
 * 100k-entry / 7MB truncation cap, which is plenty for any sane repo).
 * For each surviving blob we then fetch the raw content via the CDN at
 *   https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
 * which has no rate limit when called unauthenticated for public repos.
 *
 * Public repos only for now — see the `PROBLEM_STATEMENT` "GitHub import
 * auth" decision. Adding PAT support later is a 5-line change: thread a
 * token through buildHeaders().
 */

import {
  isIgnoredPath,
  isBinaryFilename,
  sanitizePath,
  detectBinaryByContent,
  MAX_FILE_SIZE,
} from './ignore';
import type { ParsedFile } from './zipImport';

// ----- Types & limits ------------------------------------------------------

export interface GitHubImportProgress {
  total: number;
  processed: number;
  skipped: number;
  currentPath?: string;
}

export interface GitHubImportResult {
  files: ParsedFile[];
  totalEntries: number;
  imported: number;
  skipped: number;
  skippedReasons: {
    binary: number;
    tooLarge: number;
    ignored: number;
    invalidPath: number;
    fetchFailed: number;
  };
  rootFolder: string | null;
  projectName: string;
  repoOwner: string;
  repoName: string;
  ref: string;
  truncated: boolean;
}

export interface ParsedRepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

// Same caps the zip pipeline uses, so memory + UI behaviour matches.
export const MAX_REPO_ENTRIES = 5000;
export const MAX_REPO_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB

const LANG_EXT_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', cjs: 'javascript', py: 'python', css: 'css',
  scss: 'css', less: 'css', html: 'html', htm: 'html', json: 'json',
  md: 'markdown', mdx: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'unknown', env: 'unknown',
  go: 'unknown', rs: 'unknown', java: 'unknown', kt: 'unknown', c: 'unknown',
  cpp: 'unknown', h: 'unknown', hpp: 'unknown', rb: 'unknown', php: 'unknown',
  svelte: 'unknown', vue: 'unknown',
};

function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return LANG_EXT_MAP[ext] ?? 'unknown';
}

// ----- URL parsing ---------------------------------------------------------

/**
 * Parse any of these forms into {owner, repo, ref?}:
 *   - owner/repo
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo/tree/<branch>
 *   - git@github.com:owner/repo.git
 */
export function parseRepoUrl(input: string): ParsedRepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // owner/repo shorthand
  const shorthand = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  // https URL forms — try with and without protocol
  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/.test(url.hostname)) return null;

  const segs = url.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  const owner = segs[0];
  let repo = segs[1].replace(/\.git$/, '');
  let ref: string | undefined;

  // /owner/repo/tree/<branch>/<path?>
  if (segs[2] === 'tree' && segs[3]) {
    // Branch names can contain "/" — join everything after `tree/` until
    // the path looks like a directory traversal. GitHub doesn't expose
    // an unambiguous separator here, so we conservatively take the next
    // segment as the ref. (Users importing a non-default branch can
    // always supply the shorthand `owner/repo` + dropdown later.)
    ref = segs[3];
  }

  if (!owner || !repo) return null;
  return { owner, repo, ref };
}

// ----- GitHub API helpers --------------------------------------------------

interface RepoMeta {
  default_branch: string;
  name: string;
  full_name: string;
}

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
  sha: string;
}

interface TreeResponse {
  sha: string;
  tree: TreeEntry[];
  truncated: boolean;
}

function ghError(res: Response, action: string): Error {
  if (res.status === 404) {
    return new Error(`Repository not found (404). Check the URL and that the repo is public.`);
  }
  if (res.status === 403) {
    return new Error(`GitHub rate limit hit (403). Wait a few minutes and retry, or sign in to GitHub.`);
  }
  if (res.status === 401) {
    return new Error(`Unauthorized (401). Private repos require a personal access token.`);
  }
  return new Error(`GitHub ${action} failed: HTTP ${res.status} ${res.statusText}`);
}

async function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw ghError(res, 'repo metadata fetch');
  return (await res.json()) as RepoMeta;
}

async function fetchRepoTree(
  owner: string,
  repo: string,
  ref: string
): Promise<TreeResponse> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) throw ghError(res, 'tree fetch');
  return (await res.json()) as TreeResponse;
}

async function fetchRawBlob(
  owner: string,
  repo: string,
  ref: string,
  path: string
): Promise<Uint8Array> {
  // raw.githubusercontent.com → no API rate limit for public repos.
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) throw ghError(res, `raw fetch (${path})`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ----- Main import ---------------------------------------------------------

/**
 * Import a public GitHub repository as a flat list of ParsedFile entries.
 *
 * The output is intentionally shape-compatible with `parseZipFile`'s
 * result so callers can pipe it straight into the existing zip-import
 * flow (`bulkSaveFiles` → `loadSessionFiles` → `buildFileTree`).
 */
export async function importGithubRepo(
  repoInput: string,
  opts: {
    onProgress?: (p: GitHubImportProgress) => void;
    ref?: string;
    /** Soft cap on concurrent blob fetches; keep this gentle to play nice with rate limits. */
    concurrency?: number;
  } = {}
): Promise<GitHubImportResult> {
  const parsed = parseRepoUrl(repoInput);
  if (!parsed) {
    throw new Error(
      'Could not parse GitHub URL. Expected something like ' +
        '"https://github.com/owner/repo" or "owner/repo".'
    );
  }
  const { owner, repo } = parsed;
  const explicitRef = opts.ref || parsed.ref;

  console.info(`[github] resolving ${owner}/${repo}${explicitRef ? `@${explicitRef}` : ''}`);

  // Resolve the ref. If the caller passed one explicitly use it,
  // otherwise look up the default branch.
  let ref = explicitRef;
  let meta: RepoMeta | null = null;
  if (!ref) {
    meta = await fetchRepoMeta(owner, repo);
    ref = meta.default_branch;
  }

  // Pull the entire recursive tree in one shot.
  const tree = await fetchRepoTree(owner, repo, ref);
  if (tree.truncated) {
    console.warn(
      `[github] tree response truncated by GitHub for ${owner}/${repo}@${ref}; some files may be missing`
    );
  }

  // Filter to blobs only and apply the same ignore rules as zip import.
  const reasons = {
    binary: 0,
    tooLarge: 0,
    ignored: 0,
    invalidPath: 0,
    fetchFailed: 0,
  };
  const blobs = tree.tree.filter((t) => t.type === 'blob');

  if (blobs.length > MAX_REPO_ENTRIES) {
    throw new Error(
      `Repository contains ${blobs.length} files — limit is ${MAX_REPO_ENTRIES}. ` +
        `Pick a smaller repo or a sub-tree.`
    );
  }
  const totalSize = blobs.reduce((acc, b) => acc + (b.size ?? 0), 0);
  if (totalSize > MAX_REPO_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Repository is too large: ${Math.round(totalSize / 1024 / 1024)} MB — ` +
        `limit is ${Math.round(MAX_REPO_UNCOMPRESSED_BYTES / 1024 / 1024)} MB.`
    );
  }

  // Pre-screen blobs against the ignore lists / size caps before issuing
  // any raw-content fetches. Saves bandwidth and avoids hitting raw.gh
  // for ignored paths.
  type WorkItem = { sanitized: string; name: string; sha: string };
  const todo: WorkItem[] = [];
  for (const b of blobs) {
    const sanitized = sanitizePath(b.path);
    if (!sanitized) {
      reasons.invalidPath++;
      continue;
    }
    if (isIgnoredPath(sanitized)) {
      reasons.ignored++;
      continue;
    }
    const name = sanitized.split('/').pop() ?? sanitized;
    if (isBinaryFilename(name)) {
      reasons.binary++;
      continue;
    }
    if (typeof b.size === 'number' && b.size > MAX_FILE_SIZE) {
      reasons.tooLarge++;
      continue;
    }
    todo.push({ sanitized, name, sha: b.sha });
  }

  console.info(
    `[github] ${blobs.length} blobs → ${todo.length} to fetch ` +
      `(skipped: binary=${reasons.binary} ignored=${reasons.ignored} ` +
      `tooLarge=${reasons.tooLarge} invalidPath=${reasons.invalidPath})`
  );

  const files: ParsedFile[] = [];
  const total = todo.length;
  let processed = 0;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 8, 16));

  // Simple promise-pool. Avoids importing a 3rd-party dep.
  const queue = todo.slice();
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const bytes = await fetchRawBlob(owner, repo, ref!, item.sanitized);
        if (bytes.byteLength > MAX_FILE_SIZE) {
          reasons.tooLarge++;
        } else if (detectBinaryByContent(bytes)) {
          reasons.binary++;
        } else {
          const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          files.push({
            path: item.sanitized,
            name: item.name,
            content,
            language: getLanguage(item.name),
            size: content.length,
          });
        }
      } catch (e) {
        reasons.fetchFailed++;
        console.warn(`[github] fetch failed for ${item.sanitized}:`, e instanceof Error ? e.message : e);
      } finally {
        processed++;
        opts.onProgress?.({
          total,
          processed,
          skipped:
            reasons.binary +
            reasons.tooLarge +
            reasons.ignored +
            reasons.invalidPath +
            reasons.fetchFailed,
          currentPath: item.sanitized,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Sort files so the resulting tree is deterministic across imports.
  files.sort((a, b) => a.path.localeCompare(b.path));

  const projectName = (meta?.name ?? repo).trim() || 'imported-repo';

  return {
    files,
    totalEntries: blobs.length,
    imported: files.length,
    skipped:
      reasons.binary +
      reasons.tooLarge +
      reasons.ignored +
      reasons.invalidPath +
      reasons.fetchFailed,
    skippedReasons: reasons,
    rootFolder: null,
    projectName,
    repoOwner: owner,
    repoName: repo,
    ref: ref!,
    truncated: tree.truncated,
  };
}
