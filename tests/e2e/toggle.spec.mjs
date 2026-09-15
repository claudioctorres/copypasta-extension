import { test, expect, DEMO_ORIGIN, DEMO_URL, setClipboard, pasteInto, pageLog } from './fixtures.mjs';

const toggle = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  return toggleOrigin(origin, tab ? tab.id : undefined);
}, DEMO_ORIGIN);
const registeredIds = (sw) => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
const expectedId = (sw) => sw.evaluate((origin) => scriptIdFor(origin), DEMO_ORIGIN);
const badgeOfDemoTab = (sw) => sw.evaluate(async (origin) => {
  const [tab] = await chrome.tabs.query({ url: origin + '/*' });
  return chrome.action.getBadgeText({ tabId: tab.id });
}, DEMO_ORIGIN);

test.beforeEach(async ({ sw }) => {
  // The e2e build pre-grants the demo origin, so reconcile() auto-enables it at install.
  // Start every test from "nothing enabled", the production state.
  await sw.evaluate(async () => { await reconcile(); await chrome.scripting.unregisterContentScripts(); });
});

test('enable: registers the origin, injects without reload, and the document_start script works after reload', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);

  expect(await toggle(sw)).toBe(true);
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);
  const [registration] = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  expect(registration).toMatchObject({ matches: [DEMO_ORIGIN + '/*'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true });

  // no reload yet: injected on the spot
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('ciao');
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('ON');

  // after a reload the registered document_start script does the work on its own
  await page.reload();
  await setClipboard(page, 'prego');
  await pasteInto(page, '#paste-blocked');
  await pasteInto(page, '#key-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('prego');
  await expect(page.locator('#key-blocked')).toHaveValue('prego');
  expect(await pageLog(page)).not.toContain('paste blocked by page');
});

test('disable: unregisters, reloads the tab, and the page blocks again', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  expect(await toggle(sw)).toBe(true);

  const reloaded = page.waitForEvent('load');
  expect(await toggle(sw)).toBe(false);
  await reloaded;

  expect(await registeredIds(sw)).toEqual([]);
  await setClipboard(page, 'ciao');
  await pasteInto(page, '#paste-blocked');
  await expect(page.locator('#paste-blocked')).toHaveValue('');
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('');
});

test('reconcile: re-registers every granted origin after registrations were wiped (extension update)', async ({ sw }) => {
  expect(await toggle(sw)).toBe(true);
  await sw.evaluate(() => chrome.scripting.unregisterContentScripts()); // what an update/reload does
  expect(await registeredIds(sw)).toEqual([]);

  await sw.evaluate(() => reconcile());
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);

  await sw.evaluate(() => reconcile()); // idempotent
  expect(await registeredIds(sw)).toEqual([await expectedId(sw)]);
});

test('badge follows navigation between an enabled and a non-http page', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  expect(await toggle(sw)).toBe(true);
  await expect.poll(() => badgeOfDemoTab(sw)).toBe('ON');

  // grab the tab id while its URL is still visible to the extension (host permission for the demo origin)
  const tabId = await sw.evaluate(async (origin) => (await chrome.tabs.query({ url: origin + '/*' }))[0].id, DEMO_ORIGIN);

  await page.goto('about:blank');
  await expect.poll(() => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('');
});
