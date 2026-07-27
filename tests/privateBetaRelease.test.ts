import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateBetaSignupAccess,
  getBetaAccessMode,
  getBetaAllowedEmails,
} from '@/lib/release/betaAccess';
import { isProjectExportPath } from '@/lib/deployment/projectZip';

describe('private beta release controls', () => {
  it('defaults production registration to controlled access', () => {
    expect(getBetaAccessMode({ NODE_ENV: 'production' })).toBe('controlled');
    expect(
      evaluateBetaSignupAccess({
        email: 'unknown@example.com',
        source: { NODE_ENV: 'production' },
      }).allowed
    ).toBe(false);
  });

  it('allows only normalized allowlisted emails in controlled mode', () => {
    const source = {
      MATRIX_BETA_ACCESS_MODE: 'controlled',
      MATRIX_BETA_ALLOWED_EMAILS: ' Invited@Example.com,second@example.com ',
    };
    expect(getBetaAllowedEmails(source)).toEqual(
      new Set(['invited@example.com', 'second@example.com'])
    );
    expect(
      evaluateBetaSignupAccess({ email: 'INVITED@example.com', source }).allowed
    ).toBe(true);
    expect(
      evaluateBetaSignupAccess({ email: 'other@example.com', source }).allowed
    ).toBe(false);
  });

  it('supports explicit open and closed modes without hard-coded identities', () => {
    expect(
      evaluateBetaSignupAccess({
        email: 'anyone@example.com',
        source: { MATRIX_BETA_ACCESS_MODE: 'open' },
      }).allowed
    ).toBe(true);
    expect(
      evaluateBetaSignupAccess({
        email: 'anyone@example.com',
        source: { MATRIX_BETA_ACCESS_MODE: 'closed' },
      }).allowed
    ).toBe(false);

    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/release/betaAccess.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('keeps secret environment files out of exported projects', () => {
    expect(isProjectExportPath('.env')).toBe(false);
    expect(isProjectExportPath('.env.local')).toBe(false);
    expect(isProjectExportPath('src/.env.production')).toBe(false);
    expect(isProjectExportPath('.env.example')).toBe(true);
  });

  it('links signup consent to real policy surfaces', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/app/sign-up-login-screen/components/SignUpForm.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('href="/legal/terms"');
    expect(source).toContain('href="/legal/privacy"');
    expect(source).not.toContain('href="#"');
  });
});
