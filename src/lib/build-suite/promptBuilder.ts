import {
  buildSuiteCatalog,
  findBuildSuiteItem,
  findBuildSuiteItems,
} from './catalog';
import type {
  BuildSuiteCatalog,
  BuildSuiteItem,
  BuildSuiteSelection,
} from './types';

export interface BuildSuitePromptResult {
  prompt: string;
  selectedItems: BuildSuiteItem[];
  missingSelection: string[];
}

const REQUIRED_SELECTIONS: Array<{
  key: keyof BuildSuiteSelection;
  label: string;
}> = [
  { key: 'appTypeId', label: 'App Type' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'paletteId', label: 'Color Palette' },
  { key: 'styleId', label: 'UI Style' },
  { key: 'layoutId', label: 'Layout' },
  { key: 'animationId', label: 'Animations' },
  { key: 'mobileId', label: 'Mobile' },
];

function section(title: string, lines: string[]): string {
  if (!lines.length) return `## ${title}\n- None selected.`;
  return `## ${title}\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function itemLine(item: BuildSuiteItem): string {
  return `${item.label}: ${item.promptInstruction}`;
}

export function getBuildSuiteSelectedItems(
  selection: BuildSuiteSelection,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteItem[] {
  const directIds = [
    selection.appTypeId,
    selection.paletteId,
    selection.styleId,
    selection.layoutId,
    selection.animationId,
    selection.mobileId,
  ].filter((id): id is string => Boolean(id));

  return [
    ...directIds
      .map((id) => findBuildSuiteItem(id, catalog))
      .filter((item): item is BuildSuiteItem => Boolean(item)),
    ...findBuildSuiteItems(selection.componentIds, catalog),
    ...findBuildSuiteItems(selection.aiFeatureIds, catalog),
    ...findBuildSuiteItems(selection.integrationIds, catalog),
  ];
}

export function getMissingBuildSuiteSelections(
  selection: BuildSuiteSelection
): string[] {
  return REQUIRED_SELECTIONS.filter(({ key }) => !selection[key]).map(
    ({ label }) => label
  );
}

export function buildMatrixBuildSuitePrompt(
  selection: BuildSuiteSelection,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuitePromptResult {
  const appType = findBuildSuiteItem(selection.appTypeId, catalog);
  const palette = findBuildSuiteItem(selection.paletteId, catalog);
  const style = findBuildSuiteItem(selection.styleId, catalog);
  const layout = findBuildSuiteItem(selection.layoutId, catalog);
  const animation = findBuildSuiteItem(selection.animationId, catalog);
  const mobile = findBuildSuiteItem(selection.mobileId, catalog);
  const components = findBuildSuiteItems(selection.componentIds, catalog);
  const aiFeatures = findBuildSuiteItems(selection.aiFeatureIds, catalog);
  const integrations = findBuildSuiteItems(selection.integrationIds, catalog);
  const selectedItems = getBuildSuiteSelectedItems(selection, catalog);
  const missingSelection = getMissingBuildSuiteSelections(selection);

  const prompt = [
    'Build a complete Next.js 15, TypeScript, Tailwind CSS application with the App Router.',
    '',
    section('App Type', appType ? [itemLine(appType)] : []),
    '',
    section('Appearance', selection.appearance ? [`Use a ${selection.appearance} visual mode.`] : []),
    '',
    section('Color Palette', palette ? [itemLine(palette)] : []),
    '',
    section('UI Style', style ? [itemLine(style)] : []),
    '',
    section('Layout', layout ? [itemLine(layout)] : []),
    '',
    section('Components and Add-ons', components.map(itemLine)),
    '',
    section('AI Features', aiFeatures.map(itemLine)),
    '',
    section('Integrations', integrations.map(itemLine)),
    '',
    section('Animations', animation ? [itemLine(animation)] : []),
    '',
    section('Mobile', mobile ? [itemLine(mobile)] : []),
    '',
    '## Implementation Rules',
    '- Use src/app only.',
    '- Use Next.js 15 App Router patterns.',
    '- Keep app/.../page.tsx files as Server Components; place hooks, state, forms, localStorage, and browser APIs in route-specific Client Components.',
    '- Preserve route names implied by the selected app domain and workflows.',
    '- Do not create notes-style /add-note or /history routes unless the prompt explicitly asks for them.',
    '- Build a polished, complete first screen and functional primary workflows.',
  ].join('\n');

  return {
    prompt,
    selectedItems,
    missingSelection,
  };
}
