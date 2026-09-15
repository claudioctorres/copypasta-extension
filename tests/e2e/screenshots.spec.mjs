// Produces the two 1280x800 Web Store screenshots (before/after) from the demo page.
// Run with: npm run screenshots
import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto } from './fixtures.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../docs/store/', import.meta.url));

test('store screenshots', async ({ context, sw }) => {
  mkdirSync(OUT, { recursive: true });
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await setClipboard(page, 'Hello from the clipboard 🍝');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await page.screenshot({ path: OUT + 'screenshot-1-1280x800.png' });

  await sw.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: origin + '/*' });
    await toggleOrigin(origin, tab.id);
  }, DEMO_ORIGIN);
  await page.reload(); // the registered document_start script handles the reloaded page
  await setClipboard(page, 'Hello from the clipboard 🍝');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await expect(page.locator('#key-blocked')).toHaveValue('Hello from the clipboard 🍝');
  await page.screenshot({ path: OUT + 'screenshot-2-1280x800.png' });
});
