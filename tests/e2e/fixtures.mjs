import { test as base, chromium, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_ORIGIN = 'http://127.0.0.1:4173';
export const DEMO_URL = DEMO_ORIGIN + '/';
export const PASTE = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const EXT_PATH = fileURLToPath(new URL('../../dist/test-ext', import.meta.url));

export const test = base.extend({
  // Fresh profile per test: extension state (registrations, badges) never leaks between tests.
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'copypasta-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false, // Ctrl+V must go through the real OS clipboard
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DEMO_ORIGIN });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    // The e2e build pre-grants the demo origin, so install-time reconcile auto-enables it.
    // Start every test from "nothing enabled" — the production state.
    await sw.evaluate(async () => { await reconcile(); await chrome.scripting.unregisterContentScripts(); });
    await use(sw);
  },
});

export { expect };

export async function setClipboard(page, text) {
  await page.bringToFront();
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

// Clears the field first so Chrome's form restoration on reload can never fake a success.
export async function pasteInto(page, selector) {
  await page.fill(selector, '');
  await page.focus(selector);
  await page.keyboard.press(PASTE);
}

export const pageLog = (page) => page.evaluate(() => window.__log);
export const userSelectOf = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).userSelect, selector);
