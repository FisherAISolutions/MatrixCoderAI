import { describe, expect, it } from 'vitest';
import {
  buildMatrixCoderStylePrompt,
  buildProfileTitle,
  buildStyleAnalysisPrompt,
  extractJsonObject,
  styleBriefFromJson,
} from '@/lib/styleInspirationPrompt';
import { normalizeStyleBrief } from '@/lib/styleInspiration';

describe('styleInspirationPrompt', () => {
  it('builds an analysis prompt that asks for visual inspiration instead of cloning', () => {
    const prompt = buildStyleAnalysisPrompt({
      appName: 'NotesDesk',
      feedback: 'I like the dark cards.',
      imageCount: 2,
    });

    expect(prompt).toContain('Target app name: NotesDesk');
    expect(prompt).toContain('visual inspiration');
    expect(prompt).toContain('Do not copy protected logos');
    expect(prompt).toContain('Return ONLY valid JSON');
  });

  it('extracts JSON even when a model wraps it in a fence', () => {
    const parsed = extractJsonObject('```json\n{"summary":"Clean","components":["Cards"]}\n```');
    expect(parsed).toEqual({ summary: 'Clean', components: ['Cards'] });
  });

  it('builds a reusable Matrix Coder prompt block', () => {
    const brief = normalizeStyleBrief(
      styleBriefFromJson({
        summary: 'Dark polished notes UI.',
        visualDirection: 'Compact and focused.',
        colorPalette: ['Dark navy', 'Bright cyan'],
        typography: 'Bold headings.',
        layout: 'Dashboard with cards.',
        components: ['Top nav', 'Cards'],
        interactions: ['Hover states'],
        implementationNotes: ['Use Tailwind.'],
        avoid: ['Do not copy logos.'],
      })
    );

    const prompt = buildMatrixCoderStylePrompt({
      title: buildProfileTitle('NotesDesk'),
      appName: 'NotesDesk',
      feedback: 'Use my own logo.',
      styleBrief: brief,
      promptBlock: '',
    });

    expect(prompt).toContain('App name: NotesDesk');
    expect(prompt).toContain('Treat this as visual inspiration only');
    expect(prompt).toContain('Use Next.js 15, TypeScript, Tailwind CSS, and src/app only');
  });
});
