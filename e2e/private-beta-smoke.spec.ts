import { expect, test } from '@playwright/test';

test.describe('private beta public journey', () => {
  test('landing provides working entry, support, and policy routes', async ({
    page,
  }) => {
    await page.goto('/');
    const signupLink = page.getByRole('link', { name: 'Sign up', exact: true }).first();
    await expect(signupLink).toBeVisible();
    await signupLink.click();
    await expect(page).toHaveURL(/sign-up-login-screen/, { timeout: 30_000 });

    await page.goto('/support');
    await expect(
      page.getByRole('heading', { name: /private beta support/i })
    ).toBeVisible();

    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();
  });

  test('authentication mode switch is keyboard accessible', async ({ page }) => {
    await page.goto('/sign-up-login-screen');
    const signupTab = page.getByRole('tab', { name: /sign up/i });
    await signupTab.focus();
    await signupTab.press('Enter');
    await expect(signupTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('controlled beta access is enforced by the server', async ({ request }) => {
    const invited = await request.post('/api/beta/access', {
      data: { email: 'invited@example.com' },
    });
    expect(invited.status()).toBe(200);

    const unknown = await request.post('/api/beta/access', {
      data: { email: 'unknown@example.com' },
    });
    expect(unknown.status()).toBe(403);
  });

  test('public surfaces do not overflow the viewport', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });

  test('protected product routes recover to authentication', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/sign-up-login-screen/);
    await expect(page.getByRole('tab', { name: /login/i })).toBeVisible();
  });
});
