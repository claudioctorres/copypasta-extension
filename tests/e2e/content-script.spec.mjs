import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto, pageLog, userSelectOf } from './fixtures.mjs';

const injectIntoDemoTab = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  await injectNow(tab.id);
}, DEMO_ORIGIN);

test('baseline: the demo page blocks paste, Ctrl+V, right-click and selection', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await page.dispatchEvent('#p', 'contextmenu', { bubbles: true, cancelable: true });

  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await expect(page.locator('#key-blocked')).toHaveValue('');
  const log = await pageLog(page);
  expect(log).toContain('paste blocked by page');
  expect(log).toContain('keydown ctrl+v blocked by page');
  expect(log).toContain('contextmenu blocked by page');
  expect(await userSelectOf(page, '#p')).toBe('none');
});

test('injected content script: paste works, page handlers are bypassed, Enter still reaches the page', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await injectIntoDemoTab(sw);

  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await page.dispatchEvent('#p', 'contextmenu', { bubbles: true, cancelable: true });
  await page.keyboard.press('Enter');

  await expect(page.locator('#paste-blocked')).toHaveValue('ciao');
  await expect(page.locator('#key-blocked')).toHaveValue('ciao');
  const log = await pageLog(page);
  expect(log).not.toContain('paste blocked by page');
  expect(log).not.toContain('keydown ctrl+v blocked by page');
  expect(log).not.toContain('contextmenu blocked by page');
  expect(log).toContain('keydown enter reached page');
  await expect.poll(() => userSelectOf(page, '#p')).toBe('text');
});

test('injecting twice into the same page does not throw', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await injectIntoDemoTab(sw);
  await injectIntoDemoTab(sw); // top-level const/let in a content script would throw here
  await setClipboard(page, 'prego');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('prego');
});
