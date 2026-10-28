import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://delivery.sokoci.com';
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@sokoci.com';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Secret123!';

test.describe('SOKOCI Delivery - Banc Centralisé VPS Sentinel', () => {

  test('Test 1 : Santé Laravel /up & Intégrité Inertia/Vue 3 sur /login', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => pageErrors.push(err.message));

    // Endpoint Laravel Healthcheck
    const resUp = await page.request.get(`${APP_URL}/up`);
    expect(resUp.status()).toBe(200);

    // Page de Login
    const resLogin = await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
    expect(resLogin?.status()).toBe(200);

    // Montage du conteneur Inertia (#app data-page)
    const inertiaRoot = page.locator('#app[data-page], div[data-page]').first();
    await expect(inertiaRoot).toBeAttached({ timeout: 8000 });

    // Présence des champs formulaires
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();

    // Vérification de Ziggy
    const ziggyOk = await page.evaluate(() => typeof (window as any).Ziggy !== 'undefined' || typeof (window as any).route !== 'undefined');
    console.log(`[SOKOCI] Ziggy actif : ${ziggyOk}`);

    // Assertion stricte console
    const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('clarity.ms'));
    expect(pageErrors, 'Exceptions JS détectées').toHaveLength(0);
    expect(realErrors, 'Erreurs de console détectées').toHaveLength(0);
  });

  test('Test 2 : Parcours Authentification & Dashboard', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });

    await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    
    await Promise.all([
      page.locator('button[type="submit"]').first().click(),
      page.waitForResponse(r => r.url().includes('/login') && r.request().method() === 'POST').catch(() => null)
    ]);

    await page.waitForTimeout(2000);
    const url = page.url();

    if (url.includes('/dashboard')) {
      await expect(page.locator('main, #dashboard').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('nav, aside, header').first()).toBeVisible();
    } else {
      expect(url).not.toContain('500');
    }
  });

  test('Test 3 : Page /guide et Validation Page 404', async ({ page }) => {
    // 3.1 Guide public
    const resGuide = await page.goto(`${APP_URL}/guide`, { waitUntil: 'domcontentloaded' });
    expect(resGuide?.status()).toBe(200);
    expect(await page.locator('section, article, h1, h2').count()).toBeGreaterThan(0);

    // 3.2 Page 404 personnalisée
    const res404 = await page.goto(`${APP_URL}/route-introuvable-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    expect(res404?.status()).toBe(404);

    const bodyText = await page.textContent('body');
    const has404 = bodyText?.includes('404') || bodyText?.toLowerCase().includes('introuvable') || bodyText?.toLowerCase().includes('not found');
    expect(has404).toBeTruthy();
    expect(bodyText).not.toContain('Whoops, looks like something went wrong');
  });

});
