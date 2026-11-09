const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('all profiles have copyable, complete connection handoffs', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.profile-button')).toHaveCount(8);
    for (const id of ['none-http', 'none-https', 'basic', 'netrc', 'bearer', 'oauth2', 'mtls-pki', 'mtls-pkcs12']) {
        await page.locator(`[data-profile="${id}"]`).click();
        await expect(page.locator('#connection-detail')).toContainText('gdalinfo');
        await page.getByRole('button', { name: 'Copy connection handoff' }).click();
        await expect(page.locator('#toast')).toHaveText('Copied to clipboard');
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain('Raster URL:');
        expect(copied).toContain('curl.exe');
        expect(copied).toContain('gdalinfo');
        if (id !== 'none-http') {
            expect(copied).toContain('--ssl-revoke-best-effort');
            expect(copied).toContain('http://localhost:19480/downloads/ca.crt');
            expect(copied).toContain("Join-Path $HOME 'Downloads'");
            expect(copied).not.toContain('Invoke-WebRequest');
        }
        if (id.startsWith('mtls')) expect(copied).toContain('GDAL_HTTP_SSLCERT');
        if (id === 'oauth2') expect(copied).toContain('Token URL: https://localhost:19443/oauth/token');
    }
    expect(errors).toEqual([]);
});

for (const [protocol, origin] of [['HTTP', 'http://localhost:19480'], ['HTTPS', 'https://localhost:19443']]) {
    test(`${protocol}: every profile downloads its required setup files directly`, async ({ page }) => {
        await page.goto(origin);
        const assets = {
            'none-http': [],
            'none-https': ['ca.crt'],
            basic: ['ca.crt'],
            netrc: ['ca.crt', 'test.netrc'],
            bearer: ['ca.crt'],
            oauth2: ['ca.crt'],
            'mtls-pki': ['ca.crt', 'client.crt', 'client.key'],
            'mtls-pkcs12': ['ca.crt', 'client.p12']
        };
        const detail = page.locator('#connection-detail');
        for (const [id, names] of Object.entries(assets)) {
            await page.locator(`[data-profile="${id}"]`).click();
            await expect(detail.locator('a[download]')).toHaveCount(names.length);
            if (!names.length) {
                await expect(detail).toContainText('No certificate or credential files are required');
                continue;
            }
            await expect(detail).toContainText('browser saves to Downloads');
            await expect(detail.locator('details')).toHaveJSProperty('open', false);
            expect((await detail.locator('pre:visible').allTextContents()).join('\n')).not.toContain('Invoke-WebRequest');
            for (const name of names) {
                const link = detail.locator(`a[download="${name}"]`);
                await expect(link).toHaveAttribute('href', `/downloads/${name}`);
                const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
                expect(download.suggestedFilename()).toBe(name);
                expect(await download.failure()).toBeNull();
                const chunks = [];
                for await (const chunk of await download.createReadStream()) chunks.push(chunk);
                const expected = name === 'test.netrc'
                    ? Buffer.from('machine localhost\nlogin admin\npassword admin\n')
                    : await fs.readFile(path.join(__dirname, '..', 'certs', name));
                expect(Buffer.concat(chunks).equals(expected)).toBe(true);
            }
            await detail.getByText('Optional: download with PowerShell instead', { exact: true }).click();
            await expect(detail.locator('details pre')).toBeVisible();
            await expect(detail.locator('details pre')).toContainText('Invoke-WebRequest');
        }
    });
}

test('both no-auth profiles expose the Brotli case with correct URLs', async ({ page }) => {
    await page.goto('/');
    for (const [id, origin] of [['none-http', 'http://localhost:19480'], ['none-https', 'https://localhost:19443']]) {
        await page.locator(`[data-profile="${id}"]`).click();
        await page.getByLabel('No Auth test case').selectOption('brotli');
        await expect(page.locator('#connection-detail')).toContainText(`${origin}/test/none/brotli/cog.tif`);
        await expect(page.locator('#connection-detail')).toContainText('/vsicurl_streaming/');
        await expect(page.locator('#connection-detail')).toContainText('Accept-Encoding: br');
        await page.getByLabel('No Auth test case').selectOption('standard');
        await expect(page.locator('#connection-detail')).toContainText(`${origin}/test/none/cog.tif`);
    }
});

test('request playground executes actual auth, range and decoded Brotli requests', async ({ page }) => {
    await page.goto('/');
    for (const id of ['none-http:standard', 'none-https:standard', 'basic:standard', 'bearer:standard', 'oauth2:standard']) {
        await page.locator('#request-profile').selectOption(id);
        await page.getByRole('button', { name: 'Send request' }).click();
        await expect(page.locator('#request-status')).toContainText('206');
        await expect(page.locator('#request-output')).toContainText('Received 32 decoded bytes');
    }
    for (const id of ['none-http:brotli', 'none-https:brotli']) {
        await page.locator('#request-profile').selectOption(id);
        await expect(page.locator('#request-range')).toBeDisabled();
        await page.getByRole('button', { name: 'Send request' }).click();
        await expect(page.locator('#request-status')).toContainText('200');
        await expect(page.locator('#request-output')).toContainText('content-encoding: br');
        await expect(page.locator('#request-output')).toContainText('Received 4,339,079 decoded bytes');
    }
    await page.locator('#request-method').selectOption('HEAD');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('#request-output')).toContainText('Received 0 decoded bytes');
});

test('certificate guide provides active assets and host-side trust instructions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#trust-command')).toContainText('Cert:\\CurrentUser\\Root');
    await expect(page.locator('#trust-command')).not.toContainText('Invoke-WebRequest');
    await expect(page.locator('#certificates')).toContainText('Install Certificate');
    await expect(page.locator('#ca-fingerprint')).toContainText('SHA-256:');
    await expect(page.locator('#verify-command')).toContainText('--cacert');
    await expect(page.locator('#verify-command')).toContainText('--ssl-revoke-best-effort');
    for (const name of ['ca.crt', 'server.crt', 'client.crt', 'client.key', 'client.p12']) {
        const link = page.locator(`#certificates a[href="/downloads/${name}"]`);
        await expect(link).toHaveCount(1);
        expect((await page.request.get(`/downloads/${name}`)).status()).toBe(200);
    }
});

test('logs render untrusted text safely and support pause, filter and expansion', async ({ page }) => {
    await page.request.get('/test/none/status', { headers: { 'X-Custom-Header': '<img src=x onerror=alert(1)>' } });
    await page.goto('/logs.html');
    await expect(page.locator('#log-status')).toContainText('Live');
    await page.getByRole('button', { name: 'Pause updates' }).click();
    await expect(page.locator('#log-status')).toContainText('Paused');
    await page.getByLabel('Filter requests').fill('/test/none/status');
    await page.locator('.log-entry summary').first().click();
    await expect(page.locator('.log-entry[open]')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('.log-entry img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh now' }).click();
    await expect(page.locator('.log-entry[open]')).toHaveCount(1);
    await page.getByLabel('Filter requests').fill('no-matching-request');
    await expect(page.locator('#logs-container')).toContainText('No requests match');
    await page.route('**/api/logs', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.getByRole('button', { name: 'Refresh now' }).click();
    await expect(page.locator('#log-status')).toContainText('Could not refresh logs: HTTP 503');
});

test('mobile layout does not overflow and profile controls remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-profile="mtls-pkcs12"]').click();
    await expect(page.locator('#connection-detail')).toContainText('Bundle password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-catalog.png', fullPage: true });
    await page.goto('/logs.html');
    await expect(page.locator('#log-status')).toContainText('Live');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('configuration and request failures are visible, not success-shaped', async ({ page }) => {
    await page.route('**/api/config', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await expect(page.locator('#load-status')).toContainText('503');
    await expect(page.locator('#send-request')).toBeDisabled();
    await page.unroute('**/api/config');
    await page.goto('/');
    await page.route('**/test/none/cog.tif', route => route.abort());
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('#request-status')).toHaveText('Request failed');
    await expect(page.locator('#request-output')).toContainText('Check that both ports are reachable');
});

test('desktop documentation renders without overflow or external assets', async ({ page }) => {
    const external = [];
    page.on('request', request => {
        if (!new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)) external.push(request.url());
    });
    await page.goto('/');
    await expect(page.locator('#load-status')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/desktop-catalog.png', fullPage: true });
    expect(external).toEqual([]);
});

test('HTTP callback authorization page uses the shared design and preserves state', async ({ page }) => {
    const query = new URLSearchParams({ redirect_uri: 'http://localhost:19480/callback?existing=1', state: 'test & state' });
    await page.goto(`https://localhost:19443/oauth/authorize?${query}`);
    await expect(page.getByRole('heading', { name: 'A simulated sign-in.' })).toBeVisible();
    const href = await page.getByRole('link', { name: 'Authorize test client' }).getAttribute('href');
    const callback = new URL(href);
    expect(callback.searchParams.get('existing')).toBe('1');
    expect(callback.searchParams.get('state')).toBe('test & state');
    expect(callback.searchParams.get('code')).toBe('mock_auth_code_123');
});
