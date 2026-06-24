import { describe, expect, it } from 'vitest';
import {
  inferRequestedRouteSlugs,
  inferRequiredPathsForBatch,
} from '@/lib/generation/routePlanning';

describe('large app route planning', () => {
  it('preserves explicit notes benchmark routes without inventing note route', () => {
    const request =
      'Create a simple Next.js notes app with Home page, Add Note page at /add-note, and Notes History page at /history.';

    expect(new Set(inferRequestedRouteSlugs(request))).toEqual(
      new Set(['add-note', 'history'])
    );
  });

  it('does not infer notes routes from a general fitness tracker request', () => {
    const request =
      'Build a fitness tracker app with workouts, progress charts, personal plans, nutrition summaries, and a training timer.';

    expect(inferRequestedRouteSlugs(request)).toEqual([]);
  });

  it('infers explicitly listed domain routes', () => {
    const request = 'Build a fitness tracker with pages: workouts, progress, timer, calories.';

    expect(inferRequestedRouteSlugs(request)).toEqual([
      'workouts',
      'progress',
      'timer',
      'calories',
    ]);
  });

  it('gates secondary route batches on requested routes, not generic history', () => {
    const request = 'Build a fitness tracker with pages: workouts, progress, timer, calories.';
    const required = inferRequiredPathsForBatch(request, {
      title: 'secondary feature routes and workflows',
    });

    expect(required).toEqual([
      'src/app/timer/page.tsx',
      'src/app/calories/page.tsx',
    ]);
    expect(required).not.toContain('src/app/history/page.tsx');
    expect(required).not.toContain('src/app/add-note/page.tsx');
  });

  it('ignores route-name instructions and negative examples as app routes', () => {
    const request =
      'Build a fitness tracker with workouts, progress, timer, and calories. Preserve requested route names exactly. Do not create /add-note, /history, /preserve, or /names; they were not part of the original requested route set.';

    expect(inferRequestedRouteSlugs(request)).toEqual([]);

    const required = inferRequiredPathsForBatch(request, {
      title: 'secondary feature routes and workflows',
    });

    expect(required).not.toContain('src/app/preserve/page.tsx');
    expect(required).not.toContain('src/app/names/page.tsx');
    expect(required).not.toContain('src/app/add-note/page.tsx');
    expect(required).not.toContain('src/app/history/page.tsx');
  });

  it('reads slash-route bullet lists without inventing a dash route', () => {
    const request =
      'Build a Personal CRM application. Requirements: Routes: * / * /contacts * /companies * /tasks * /pipeline Features: Dashboard (/) Contacts (/contacts) Companies (/companies) Tasks (/tasks) Pipeline (/pipeline). Preserve route names exactly. Do not create /add-note. Do not create /history.';

    expect(inferRequestedRouteSlugs(request)).toEqual([
      'contacts',
      'companies',
      'tasks',
      'pipeline',
    ]);

    expect(
      inferRequiredPathsForBatch(request, {
        title: 'primary feature routes and shared components',
      })
    ).toEqual(['src/app/contacts/page.tsx', 'src/app/companies/page.tsx']);

    expect(
      inferRequiredPathsForBatch(request, {
        title: 'secondary feature routes and workflows',
      })
    ).toEqual(['src/app/tasks/page.tsx', 'src/app/pipeline/page.tsx']);
  });
});
