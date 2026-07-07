import type { BuildManifest } from './types';

export function createBuildManifestPlanningContext(
  manifest: BuildManifest
): string {
  return [
    '## Matrix Build Suite Manifest',
    '',
    'Use this structured Build Manifest as the authoritative configuration for planning. The natural-language prompt is context only.',
    '',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
  ].join('\n');
}
