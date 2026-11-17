import test from 'node:test';
import assert from 'node:assert/strict';

test('saved stats survive a page load (regression: the constructor used to overwrite them with defaults)', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const { GameState } = await import('../src/engine/state.js');
    const first = new GameState();
    first.loadFromLocalStorage();
    first.updateLevelTime('First steps', 9.5);
    first.markLevelComplete('First steps');
    first.saveToLocalStorage();

    const next = new GameState();          // a new page load
    next.loadFromLocalStorage();
    assert.equal(next.getStat('bestTimes')['First steps'], 9.5);
    assert.ok(next.isLevelComplete('First steps'));
  } finally {
    delete globalThis.localStorage;
  }
});
