import type { FileNode, ChatMessage } from '@/app/chat-workspace/components/types';
import {
  buildImportGraph,
  rankByFilename,
  rankByImportGraph,
  rankByRecency,
  rankByChatMentions,
  flattenTree,
  type ImportGraph,
} from './heuristics';
import { supabase } from '@/lib/supabase';
import { isPgvectorDisabled } from './indexer';

/**
 * Repository context builder.
 *
 * Combines heuristic rankers into a single weighted score per file, picks
 * the top-K within a token budget, and produces a system-message-shaped string
 * the AI receives alongside the agent system prompt.
 *
 * Optional semantic step (Stage 2C) merges pgvector results via Reciprocal
 * Rank Fusion. If the semantic call fails for any reason, we silently fall
 * back to heuristic-only ranking.
 */

const CHARS_PER_TOKEN = 4; // conservative rough estimate
const DEFAULT_TOKEN_BUDGET = 6000; // ~24KB of context
const OPEN_FILE_CHAR_BUDGET = 3000;
const OTHER_FILE_CHAR_BUDGET = 1500;
const CONFIG_FILE_CHAR_BUDGET = 1200; // tight cap for pinned root configs
const HEAD_TAIL_SPLIT = 0.7; // for long files, keep 70% head + 30% tail

/**
 * Hardening pass #4 — root config files that the AI almost always benefits
 * from seeing when they exist (project shape, dependencies, framework
 * settings). Matched against file *path* (relative to project root) using
 * a mix of exact-match strings and regexes for extension variants.
 *
 * Files are PINNED into the context (assembled before regular ranked
 * results) so they are guaranteed inclusion when present — subject to a
 * tight per-file cap so they can't blow the token budget.
 */
const ROOT_CONFIG_EXACT = new Set<string>([
  'package.json',
  'tsconfig.json',
  '.env.example',
  'README.md',
  'readme.md',
]);
const ROOT_CONFIG_REGEXES: RegExp[] = [
  /^next\.config\.(?:js|mjs|cjs|ts)$/i,
  /^tailwind\.config\.(?:js|cjs|ts)$/i,
  /^supabase\//, // any file inside supabase/
];

function isRootConfigFile(path: string): boolean {
  if (ROOT_CONFIG_EXACT.has(path)) return true;
  for (const re of ROOT_CONFIG_REGEXES) if (re.test(path)) return true;
  return false;
}

export interface BuildContextOpts {
  query: string;
  files: FileNode[]; // can be tree or flat — both accepted
  openFile?: FileNode | null;
  messages: ChatMessage[];
  tokenBudget?: number;
  sessionId?: string;
  /** Optional semantic search results { path, score } from /api/embeddings/search */
  semanticResults?: SemanticHit[] | null;
}

export interface SemanticHit {
  file_path: string;
  chunk_content?: string;
  similarity?: number;
}

export interface BuildContextResult {
  systemContext: string;
  includedPaths: string[];
  totalChars: number;
  truncated: boolean;
  stats: {
    fileCount: number;
    heuristicHits: number;
    semanticHits: number;
    importGraphSize: number;
  };
}

interface Scored {
  path: string;
  file: FileNode;
  score: number;
  reasons: string[];
}

const W = {
  open: 1.0,
  filename: 0.35,
  importGraph: 0.3,
  chat: 0.25,
  recency: 0.15,
  semantic: 0.4,
};

function asFlatFiles(filesOrTree: FileNode[]): FileNode[] {
  const hasFolders = filesOrTree.some((f) => f.type === 'folder');
  return hasFolders ? flattenTree(filesOrTree) : filesOrTree.filter((f) => f.type === 'file');
}

function trimFileContent(content: string, budget: number): string {
  if (content.length <= budget) return content;
  const headLen = Math.floor(budget * HEAD_TAIL_SPLIT);
  const tailLen = budget - headLen - 32; // small margin for ellipsis line
  const head = content.slice(0, headLen);
  const tail = content.slice(content.length - tailLen);
  return `${head}\n\n/* ... ${content.length - headLen - tailLen} chars truncated ... */\n\n${tail}`;
}

function mergeScores(
  ...maps: Array<{ map: Map<string, number>; weight: number; label: string }>
): Map<string, { score: number; reasons: string[] }> {
  const out = new Map<string, { score: number; reasons: string[] }>();
  for (const { map, weight, label } of maps) {
    for (const [path, raw] of map.entries()) {
      const cur = out.get(path) ?? { score: 0, reasons: [] };
      cur.score += raw * weight;
      cur.reasons.push(label);
      out.set(path, cur);
    }
  }
  return out;
}

/**
 * Build a repo context string for prompt injection. Always returns a usable
 * result even when files is empty or every score is zero — in that case
 * systemContext is an empty string and the caller should simply not include it.
 */
export function buildContextForPrompt(opts: BuildContextOpts): BuildContextResult {
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const charBudget = tokenBudget * CHARS_PER_TOKEN;
  const flatFiles = asFlatFiles(opts.files);

  if (flatFiles.length === 0) {
    return {
      systemContext: '',
      includedPaths: [],
      totalChars: 0,
      truncated: false,
      stats: { fileCount: 0, heuristicHits: 0, semanticHits: 0, importGraphSize: 0 },
    };
  }

  // Build import graph once
  const graph: ImportGraph = buildImportGraph(flatFiles);

  // Compute heuristic rankers
  const filenameMap = rankByFilename(opts.query, flatFiles);
  const recencyMap = rankByRecency(flatFiles);
  const chatMap = rankByChatMentions(opts.messages, flatFiles);
  const seedPaths = opts.openFile ? [opts.openFile.path] : [];
  const importMap = seedPaths.length > 0 ? rankByImportGraph(seedPaths, graph, 2) : new Map();

  // Optional semantic ranking → convert ranks to scores (top result = 1, decay)
  const semanticMap = new Map<string, number>();
  if (opts.semanticResults && opts.semanticResults.length > 0) {
    opts.semanticResults.forEach((hit, idx) => {
      const decay = 1 / (idx + 1); // RRF-ish
      const prev = semanticMap.get(hit.file_path) ?? 0;
      if (decay > prev) semanticMap.set(hit.file_path, decay);
    });
  }

  const combined = mergeScores(
    { map: filenameMap, weight: W.filename, label: 'filename' },
    { map: importMap, weight: W.importGraph, label: 'import-graph' },
    { map: chatMap, weight: W.chat, label: 'chat-ref' },
    { map: recencyMap, weight: W.recency, label: 'recency' },
    { map: semanticMap, weight: W.semantic, label: 'semantic' }
  );

  // Path → file lookup
  const byPath = new Map(flatFiles.map((f) => [f.path, f]));

  // Always include openFile with max score
  if (opts.openFile) {
    const existing = combined.get(opts.openFile.path) ?? { score: 0, reasons: [] };
    existing.score = Math.max(existing.score, W.open) + W.open; // ensure top
    existing.reasons.push('open-file');
    combined.set(opts.openFile.path, existing);
  }

  // Materialize Scored[] sorted by score desc
  const scored: Scored[] = [];
  for (const [path, val] of combined.entries()) {
    const file = byPath.get(path);
    if (!file || !file.content) continue;
    scored.push({ path, file, score: val.score, reasons: val.reasons });
  }
  scored.sort((a, b) => b.score - a.score);

  // Hardening pass #4 — pin root config files (package.json, tsconfig.json,
  // next.config.*, tailwind.config.*, supabase/*, .env.example, README.md)
  // so the AI always sees the project's shape when answering. Each pinned
  // config is capped at CONFIG_FILE_CHAR_BUDGET so they can never blow the
  // overall token budget. Configs are assembled BEFORE the regular ranked
  // list, except we still keep the openFile pinned at the very top if any.
  const pinnedConfigPaths = new Set<string>();
  const pinnedConfigs: Scored[] = [];
  for (const f of flatFiles) {
    if (!f.content) continue;
    if (!isRootConfigFile(f.path)) continue;
    if (opts.openFile?.path === f.path) continue; // open-file handled separately
    pinnedConfigPaths.add(f.path);
    pinnedConfigs.push({
      path: f.path,
      file: f,
      score: 999, // sentinel — pinned configs don't compete with scores
      reasons: ['root-config'],
    });
  }

  // Token-safe assembly
  const includedPaths: string[] = [];
  const sections: string[] = [];
  let used = 0;
  let truncated = false;

  const buildSection = (s: Scored, budget: number, label: string): string => {
    const trimmed = trimFileContent(s.file.content ?? '', budget);
    const header = `### ${s.path}${label}  [${s.reasons.join(', ')}]`;
    const fence = '```';
    const lang = (s.file.language ?? '').toString();
    return `${header}\n${fence}${lang}\n${trimmed}\n${fence}\n`;
  };

  // 1) Pinned configs first (small per-file cap; skip silently if they
  //    don't fit individually — never block the regular list).
  for (const s of pinnedConfigs) {
    const section = buildSection(s, CONFIG_FILE_CHAR_BUDGET, '');
    if (used + section.length > charBudget) {
      truncated = true;
      continue; // try next config — they're small enough one might still fit
    }
    sections.push(section);
    used += section.length;
    includedPaths.push(s.path);
  }

  // 2) Regular ranked list (skipping anything we've already pinned).
  for (const s of scored) {
    if (pinnedConfigPaths.has(s.path)) continue;
    const isOpen = opts.openFile?.path === s.path;
    const fileBudget = isOpen ? OPEN_FILE_CHAR_BUDGET : OTHER_FILE_CHAR_BUDGET;
    const section = buildSection(s, fileBudget, isOpen ? '  (currently open)' : '');
    if (used + section.length > charBudget) {
      truncated = true;
      // Try to fit a smaller version if NOTHING has been included yet.
      if (sections.length === 0) {
        const minimalSec = buildSection(
          s,
          Math.floor(charBudget * 0.6),
          isOpen ? '  (currently open)' : ''
        );
        sections.push(minimalSec);
        used += minimalSec.length;
        includedPaths.push(s.path);
      }
      break;
    }
    sections.push(section);
    used += section.length;
    includedPaths.push(s.path);
    if (includedPaths.length >= 12) break; // hard cap
  }

  if (sections.length === 0) {
    return {
      systemContext: '',
      includedPaths: [],
      totalChars: 0,
      truncated: false,
      stats: {
        fileCount: flatFiles.length,
        heuristicHits: combined.size,
        semanticHits: semanticMap.size,
        importGraphSize: graph.size,
      },
    };
  }

  const preamble = [
    '## Repository Context',
    `You are working inside an existing project. Below are the most relevant files for the user's request.`,
    `When modifying existing files, prefer emitting structured edit blocks (will be defined by the coding agent).`,
    `Files included: ${includedPaths.length}${truncated ? ' (truncated by token budget)' : ''}.`,
    '',
  ].join('\n');

  return {
    systemContext: preamble + '\n' + sections.join('\n'),
    includedPaths,
    totalChars: used,
    truncated,
    stats: {
      fileCount: flatFiles.length,
      heuristicHits: combined.size,
      semanticHits: semanticMap.size,
      importGraphSize: graph.size,
    },
  };
}

/** Default abort timeout (ms) for the semantic-search round-trip. */
export const SEMANTIC_SEARCH_TIMEOUT_MS = 3000;

/**
 * Optional helper for Stage 2C: try semantic search, swallow failures.
 * Returns null on any error / timeout so callers can fall back to
 * heuristic-only context.
 *
 * Timeout behavior:
 *   - An internal AbortController fires after SEMANTIC_SEARCH_TIMEOUT_MS
 *     (default 3s). The fetch is aborted cleanly and `null` is returned.
 *   - Callers may also pass an external AbortSignal which will be honored
 *     in addition to the internal timeout.
 *   - This function NEVER throws — UI code can safely await it without
 *     try/catch and is guaranteed not to hang.
 */
export async function trySemanticSearch(
  sessionId: string,
  query: string,
  k: number = 8,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<SemanticHit[] | null> {
  if (!sessionId || sessionId.startsWith('demo-')) return null;
  if (isPgvectorDisabled()) return null;

  const timeoutMs = options?.timeoutMs ?? SEMANTIC_SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Bridge external signal → internal controller
  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    let auth = '';
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) auth = `Bearer ${token}`;
    }
    const resp = await fetch('/api/embeddings/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ sessionId, query, k }),
      signal: controller.signal,
    });
    if (resp.status === 503) return null;
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data?.matches)) return null;
    return data.matches as SemanticHit[];
  } catch (err) {
    // AbortError is the common "timed out" path — silent.
    if (err instanceof Error && err.name === 'AbortError') {
      console.info('[contextBuilder] semantic search aborted (timeout or external signal)');
    }
    return null;
  } finally {
    clearTimeout(timer);
    if (options?.signal) options.signal.removeEventListener('abort', onExternalAbort);
  }
}
