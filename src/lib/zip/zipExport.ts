/**
 * Zip export — Milestone B.
 *
 * Walks the FileNode tree, adds every file at its original path into a
 * JSZip archive (folder structure is preserved automatically because
 * JSZip splits paths on "/"), then triggers a browser download.
 *
 * Uses the existing `jszip` dependency that already ships with the app
 * (see package.json) — no new deps introduced.
 *
 * Notes
 * -----
 *   * Empty folders are NOT exported (there is nothing meaningful to put
 *     into the zip). This matches every other "download project as zip"
 *     tool out there.
 *   * Binary content was already filtered out at import time (see
 *     `src/lib/zip/zipImport.ts` / `ignore.ts`) — so every file in the
 *     tree has UTF-8 string content. We add it as such.
 *   * The download filename is derived from the session/project name,
 *     sanitized to filesystem-safe characters and suffixed with a short
 *     timestamp so two exports of the same session don't clobber each
 *     other in the user's Downloads folder.
 */

import JSZip from 'jszip';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { pushTerminalLog } from '@/lib/terminal/store';

export interface ExportZipResult {
  fileCount: number;
  byteSize: number;
  filename: string;
}

/** Recursively yield every file leaf in the tree. */
function* iterFiles(nodes: FileNode[]): Generator<FileNode> {
  for (const node of nodes) {
    if (node.type === 'file') {
      yield node;
    } else if (node.type === 'folder' && node.children?.length) {
      yield* iterFiles(node.children);
    }
  }
}

/** Make a string safe for use as a filename across OSes. */
function sanitizeFilename(name: string): string {
  return (name || 'codepilot-export')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'codepilot-export';
}

/** Short, sortable timestamp suffix (YYYYMMDD-HHMM). */
function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

/**
 * Build a zip blob from the in-memory file tree.
 *
 * Returns the blob + the count of files included. Does NOT trigger any
 * UI side effects — call `triggerBrowserDownload` afterwards if you want
 * the browser to save it.
 */
export async function buildProjectZip(
  fileTree: FileNode[]
): Promise<{ blob: Blob; fileCount: number; byteSize: number }> {
  const zip = new JSZip();
  let fileCount = 0;

  for (const file of iterFiles(fileTree)) {
    if (!file.path) continue;
    // JSZip splits on "/" internally → folder structure preserved exactly.
    zip.file(file.path, file.content ?? '');
    fileCount += 1;
  }

  pushTerminalLog({
    level: 'info',
    text: `[export-consistency] zip source file count=${fileCount}\n`,
    timestamp: Date.now(),
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { blob, fileCount, byteSize: blob.size };
}

/**
 * Trigger a browser download for a blob by synthesizing a hidden <a>
 * with `download` attribute and clicking it. Works in all modern browsers.
 *
 * Returns the filename that was used.
 */
export function triggerBrowserDownload(blob: Blob, projectName: string): string {
  const filename = `${sanitizeFilename(projectName)}-${timestampSuffix()}.zip`;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR / non-browser env — caller shouldn't have got here.
    return filename;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  return filename;
}

/**
 * Convenience: build + download in one call.
 */
export async function exportProjectAsZip(
  fileTree: FileNode[],
  projectName: string
): Promise<ExportZipResult> {
  const { blob, fileCount, byteSize } = await buildProjectZip(fileTree);
  const filename = triggerBrowserDownload(blob, projectName);
  return { fileCount, byteSize, filename };
}
