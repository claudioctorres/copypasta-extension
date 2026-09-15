const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isClipboardCombo } = require('../../src/lib/keys.js');

const ev = (overrides) => ({ key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...overrides });

describe('isClipboardCombo', () => {
  const combos = [
    ['Ctrl+C', ev({ key: 'c', ctrlKey: true })],
    ['Ctrl+V', ev({ key: 'v', ctrlKey: true })],
    ['Ctrl+X', ev({ key: 'x', ctrlKey: true })],
    ['Ctrl+A', ev({ key: 'a', ctrlKey: true })],
    ['Ctrl+Shift+V (paste plain)', ev({ key: 'V', ctrlKey: true, shiftKey: true })],
    ['Cmd+V (Mac)', ev({ key: 'v', metaKey: true })],
    ['Ctrl+V with CapsLock on', ev({ key: 'V', ctrlKey: true })],
    ['Ctrl+Insert (copy)', ev({ key: 'Insert', ctrlKey: true })],
    ['Shift+Insert (paste)', ev({ key: 'Insert', shiftKey: true })],
    ['Shift+Delete (cut)', ev({ key: 'Delete', shiftKey: true })],
  ];
  for (const [name, e] of combos) it(`${name} is a clipboard combo`, () => assert.equal(isClipboardCombo(e), true));

  const notCombos = [
    ['plain letter', ev({ key: 'v' })],
    ['Enter', ev({ key: 'Enter' })],
    ['Escape', ev({ key: 'Escape' })],
    ['Ctrl+S', ev({ key: 's', ctrlKey: true })],
    ['Ctrl+Z', ev({ key: 'z', ctrlKey: true })],
    ['Shift+A (typing a capital)', ev({ key: 'A', shiftKey: true })],
    ['AltGr+C on Windows (ctrl+alt)', ev({ key: 'ć', ctrlKey: true, altKey: true })],
    ['Ctrl+Alt+V', ev({ key: 'v', ctrlKey: true, altKey: true })],
    ['Delete alone', ev({ key: 'Delete' })],
    ['Insert alone', ev({ key: 'Insert' })],
    ['IME composing Ctrl+V', ev({ key: 'v', ctrlKey: true, isComposing: true })],
    ['no key field', { ctrlKey: true }],
  ];
  for (const [name, e] of notCombos) it(`${name} is NOT a clipboard combo`, () => assert.equal(isClipboardCombo(e), false));
});
