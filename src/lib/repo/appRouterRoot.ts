import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from './heuristics';

export interface AppRouterRootPlan {
  mixed: boolean;
  rootAppFiles: FileNode[];
  srcAppFiles: FileNode[];
  upserts: Array<{ fromPath?: string; file: FileNode }>;
  deleteIds: string[];
}

function isFile(node: FileNode): node is FileNode & { content: string } {
  return node.type === 'file' && typeof node.content === 'string';
}

function withSrcAppPath(file: FileNode): FileNode {
  const nextPath = `src/${file.path}`;
  const name = nextPath.split('/').pop() ?? file.name;
  return {
    ...file,
    id: `${file.id}:src-app`,
    path: nextPath,
    name,
    parentPath: nextPath.split('/').slice(0, -1).join('/'),
    lastModified: new Date().toISOString(),
  };
}

export function ensureLayoutImportsGlobals(content: string): string {
  if (/import\s+['"]\.\/globals\.css['"]\s*;?/.test(content)) return content;
  return `import './globals.css';\n${content.replace(/^\s+/, '')}`;
}

export function getAppRouterRootFiles(files: FileNode[]): {
  rootAppFiles: FileNode[];
  srcAppFiles: FileNode[];
} {
  const flat = flattenTree(files).filter(isFile);
  return {
    rootAppFiles: flat.filter((file) => file.path.startsWith('app/')),
    srcAppFiles: flat.filter((file) => file.path.startsWith('src/app/')),
  };
}

export function hasMixedAppRouterRoots(files: FileNode[]): boolean {
  const { rootAppFiles, srcAppFiles } = getAppRouterRootFiles(files);
  return rootAppFiles.length > 0 && srcAppFiles.length > 0;
}

export function planAppRouterRootNormalization(files: FileNode[]): AppRouterRootPlan {
  const { rootAppFiles, srcAppFiles } = getAppRouterRootFiles(files);
  const mixed = rootAppFiles.length > 0 && srcAppFiles.length > 0;
  if (!mixed) {
    return { mixed: false, rootAppFiles, srcAppFiles, upserts: [], deleteIds: [] };
  }

  const byPath = new Map([...rootAppFiles, ...srcAppFiles].map((file) => [file.path, file]));
  const upserts: AppRouterRootPlan['upserts'] = [];

  for (const rootFile of rootAppFiles) {
    const targetPath = `src/${rootFile.path}`;
    if (byPath.has(targetPath)) continue;
    upserts.push({ fromPath: rootFile.path, file: withSrcAppPath(rootFile) });
  }

  const layoutPath = 'src/app/layout.tsx';
  const movedLayout = upserts.find((item) => item.file.path === layoutPath)?.file;
  const existingLayout = byPath.get(layoutPath);
  const layout = movedLayout ?? existingLayout;
  if (layout?.content) {
    const nextContent = ensureLayoutImportsGlobals(layout.content);
    if (nextContent !== layout.content) {
      const updated = {
        ...layout,
        content: nextContent,
        size: nextContent.length,
        lastModified: new Date().toISOString(),
      };
      const existingUpsert = upserts.find((item) => item.file.path === layoutPath);
      if (existingUpsert) existingUpsert.file = updated;
      else upserts.push({ file: updated });
    }
  }

  return {
    mixed: true,
    rootAppFiles,
    srcAppFiles,
    upserts,
    deleteIds: rootAppFiles.map((file) => file.id),
  };
}
