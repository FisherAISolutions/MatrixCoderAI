export interface PatchMarkerLine {
  line: number;
  text: string;
}

const PATCH_MARKER_LINE_REGEX = /^\s*(?:<{5,}.*|={5,}|>{5,}.*)\s*$/;

export function findPatchMarkerLines(content: string): PatchMarkerLine[] {
  const lines = content.split(/\r?\n/);
  const markers: PatchMarkerLine[] = [];

  lines.forEach((line, index) => {
    if (PATCH_MARKER_LINE_REGEX.test(line)) {
      markers.push({ line: index + 1, text: line.trim() });
    }
  });

  return markers;
}

export function containsPatchMarkers(content: string): boolean {
  return findPatchMarkerLines(content).length > 0;
}

export function describePatchMarkerLeak(content: string): string | null {
  const markers = findPatchMarkerLines(content);
  if (markers.length === 0) return null;
  const first = markers[0];
  const more = markers.length > 1 ? ` and ${markers.length - 1} more` : '';
  return `SEARCH/REPLACE marker leaked into file content at line ${first.line}: ${first.text}${more}`;
}
