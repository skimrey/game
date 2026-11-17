/**
 * Run worker — plans a run's levels off the main thread (levels/runLevels.js: remixes and
 * fresh layouts, each checked by the level, fun, encounter and campaign audits — a
 * few hundred milliseconds to a few seconds per level).
 *
 * Messages in:  { type: 'start', runSeed, want }   plan levels 0..want
 *               { type: 'want', index }           plan up to `index` (one level ahead of the player)
 *               { type: 'quest', id, spec }       generate an NPC's rift level (generateLevel spec)
 * Messages out: { type: 'level', index, level, source, tries }
 *               { type: 'quest', id, level, audit } (or { error })
 *
 * Work is done one level at a time, only as far ahead as asked, so the worker stays
 * quiet while the player is busy (weak machines keep their cores for rendering).
 */
import { createRunPlanner } from './runLevels.js';
import { generateLevel } from './generator.js';

let planner = null, want = -1, next = 0, scheduled = false;

function pump() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(work, 0);
}

function work() {
  scheduled = false;
  if (!planner || planner.done || next > want) return;
  const result = planner.next();
  next = result.index + 1;
  postMessage({ type: 'level', index: result.index, level: result.level, source: result.source, tries: result.tries });
  pump();
}

self.onmessage = ({ data }) => {
  if (data.type === 'start') {
    planner = createRunPlanner(data.runSeed);
    next = 0;
    want = data.want ?? 0;
    pump();
  } else if (data.type === 'quest') {
    try {
      const { level, audit } = generateLevel(data.spec);
      postMessage({ type: 'quest', id: data.id, level, audit });
    } catch (error) {
      postMessage({ type: 'quest', id: data.id, error: error.message });
    }
  } else if (data.type === 'want') {
    want = Math.max(want, data.index);
    pump();
  }
};
