const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    workers: 1,
    use: {
        baseURL: 'http://localhost:19480',
        // Only browser UI tests bypass trust. test-client.js validates the real CA.
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 }
    },
    webServer: {
        command: 'npm start',
        url: 'http://localhost:19480/test/none/status',
        env: { HTTP_PORT: '19480', HTTPS_PORT: '19443', PUBLIC_HTTP_URL: '', PUBLIC_HTTPS_URL: '' },
        reuseExistingServer: false,
        timeout: 60000
    }
});
