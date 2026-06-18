import type { StyleBrief, StyleProfileDraft } from './styleInspiration';
import { styleBriefToMarkdown } from './styleInspiration';

export type StyleAnalysisRequest = {
  appName: string;
  feedback: string;
  imageCount: number;
};

export function buildStyleAnalysisPrompt({
  appName,
  feedback,
  imageCount,
}: StyleAnalysisRequest): string {
  const targetName = appName.trim() || 'the user app';
  const notes = feedback.trim() || 'No extra user notes were provided.';

  return `Analyze ${imageCount} uploaded screenshot reference(s) for visual inspiration.

Target app name: ${targetName}
User feedback and preferences:
${notes}

Return ONLY valid JSON with this exact shape:
{
  "summary": "one sentence",
  "visualDirection": "clear design direction",
  "colorPalette": ["color or role", "color or role"],
  "typography": "typography guidance",
  "layout": "layout guidance",
  "components": ["component pattern"],
  "interactions": ["interaction pattern"],
  "implementationNotes": ["Tailwind/Next.js implementation note"],
  "avoid": ["what not to copy"]
}

Important:
- Use the screenshots as visual inspiration, not as an exact copy target.
- Do not copy protected logos, brand names, exact copy, images, or proprietary UI one-for-one.
- Prefer reusable product-design language that Matrix Coder can use to build an original app.
- Mention concrete Tailwind-friendly color, spacing, component, and layout guidance.`;
}

export function buildMatrixCoderStylePrompt(profile: StyleProfileDraft): string {
  const appName = profile.appName.trim() || 'my app';
  return `Use this saved visual inspiration profile to build an original app.

App name: ${appName}
Style profile: ${profile.title}

User style notes:
${profile.feedback.trim() || 'Use the visual brief as the source of style direction.'}

Visual brief:
${styleBriefToMarkdown(profile.styleBrief)}

Build guidance:
- Treat this as visual inspiration only, not an exact clone.
- Use the user's own app name, content, routes, and assets.
- Preserve any route names the user asks for exactly.
- Use Next.js 15, TypeScript, Tailwind CSS, and src/app only unless the user asks otherwise.
- Keep route page.tsx files as Server Components unless client behavior is absolutely required.
- Move interactive behavior into child Client Components.
- Build a polished, professional UI that follows the visual brief while remaining original.`;
}

export function buildProfileTitle(appName: string): string {
  const trimmed = appName.trim();
  return trimmed ? `${trimmed} Style Profile` : 'Visual Inspiration Profile';
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(unfenced);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(unfenced.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

export function styleBriefFromJson(json: Record<string, unknown>): StyleBrief {
  return {
    summary: stringValue(json.summary),
    visualDirection: stringValue(json.visualDirection),
    colorPalette: stringArray(json.colorPalette),
    typography: stringValue(json.typography),
    layout: stringValue(json.layout),
    components: stringArray(json.components),
    interactions: stringArray(json.interactions),
    implementationNotes: stringArray(json.implementationNotes),
    avoid: stringArray(json.avoid),
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}
