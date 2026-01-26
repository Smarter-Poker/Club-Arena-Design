import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('should show login page for unauthenticated users', async ({ page }) => {
        await page.goto('/clubs');

        // Should redirect to login
        await expect(page).toHaveURL(/.*login|auth/);
    });

    test('should show home page', async ({ page }) => {
        await page.goto('/');

        // Home page should load
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Navigation', () => {
    test('should navigate to clubs page', async ({ page }) => {
        await page.goto('/clubs');
        await expect(page.locator('body')).toBeVisible();
    });

    test('should navigate to tournaments page', async ({ page }) => {
        await page.goto('/tournaments');
        await expect(page.locator('body')).toBeVisible();
    });

    test('should navigate to leaderboard page', async ({ page }) => {
        await page.goto('/leaderboard');
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('VIP Page', () => {
    test('should redirect to auth for unauthenticated users', async ({ page }) => {
        await page.goto('/vip');

        // Protected route should redirect to auth
        await expect(page).toHaveURL(/.*auth/);
    });
});
