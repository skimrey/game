/**
 * The ranch — the pasture behind your house where every boss you've befriended lives. They
 * roam around their patch of grass (it grows as more come home: walk right to see them all),
 * hop, nap and look at you. Walk up to one to read its card (type, level, moves); the board by
 * the back door picks your Ring squad. The back door leads home.
 *
 *   const ranch = createRanch({ profile, onLeave, onSquad });
 *   ranch.open({ design });
 */
import { rect, pset, ellipse, line, poly, text, hline, textWidth, circle } from '../engine/pixel.js';
import { SLOT, heroBaseColors } from '../engine/palette.js';
import { createPlace, FLOOR, FEET, W, H, el } from './place2d.js';
import { drawMonster, ringPalette, RC, RAMP_SLOTS, TYPE_COLOR, monsterCanvas } from '../ring/art.js';
import { TYPES } from '../ring/monsters.js';
import { monsterCard } from '../ring/panels.js';
import { SQUAD } from '../ring/tamers.js';
import { sound } from '../audio/music.js';

const START = 232, GAP = 84;

export function createRanch({ profile, onLeave = () => {}, onSquad = () => {} } = {}) {
  const roam = new Map();                 // id → { x, dir, idle, hop }
  let slots = new Map();                  // id → palette ramp (the monsters on screen)
  const herd = () => profile.monsters();
  const homeX = i => START + i * GAP;
  const width = () => Math.max(W + 40, START + herd().length * GAP + 60);

  function visible(st) {
    const list = herd().map((m, i) => ({ m, x: roam.get(m.id)?.x ?? homeX(i) })).filter(({ x }) => x > st.cam - 40 && x < st.cam + W + 40);
    // keep the ramps of those still on screen, give free ones to the newcomers
    const next = new Map();
    for (const { m } of list) if (slots.has(m.id)) next.set(m.id, slots.get(m.id));
    const used = new Set(next.values());
    for (const { m } of list) if (!next.has(m.id)) { for (let k = 0; k < RAMP_SLOTS; k++) if (!used.has(k)) { next.set(m.id, k); used.add(k); break; } }
    const changed = next.size !== slots.size || [...next].some(([id, k]) => slots.get(id) !== k);
    slots = next;
    if (changed) st.paletteDirty = true;
    return list.filter(({ m }) => slots.has(m.id));
  }

  function palette(st) {
    const byRamp = [];
    const all = herd();
    for (const [id, k] of slots) byRamp[k] = all.find(m => m.id === id);
    return ringPalette({ hero: heroBaseColors(st.design), monsters: Array.from({ length: RAMP_SLOTS }, (_, k) => byRamp[k] || null) });
  }

  function hotspots(st) {
    const out = [{ id: 'door', x: 36, label: 'Back inside' }, { id: 'board', x: 110, label: herd().length >= SQUAD ? 'Ring squad board' : 'The squad board' }];
    herd().forEach((m, i) => out.push({ id: `mon:${m.id}`, x: roam.get(m.id)?.x ?? homeX(i), label: `${m.nick || m.name} · Lv ${m.level}`, mon: m, priority: true, reach: 26 }));
    return out;
  }

  function use(h, st) {
    if (h.id === 'door') { place.close(); onLeave(); return; }
    if (h.id === 'board') {
      if (herd().length < SQUAD) {
        place.showPanel('The squad board', [el('p', { class: 'home-text', text: `The Ring behind the inn takes squads of ${SQUAD}. You have ${herd().length}. At the end of each stage of a run, one of the bosses you beat there can come home with you — they'll live here.` })]);
        return;
      }
      st.paused = true;
      onSquad(() => place.resume());
      return;
    }
    if (h.mon) {
      const a = roam.get(h.mon.id);
      if (a) { a.idle = 2.5; a.hop = 0.6; }
      sound.fx('pet', { pitch: -8 });
      const inSquad = profile.squad().some(m => m.id === h.mon.id);
      place.showPanel(h.mon.nick || h.mon.name, [
        monsterCard(h.mon),
        el('p', { class: 'home-text', text: `${h.mon.title ? `Once “${h.mon.title}”. ` : ''}Befriended in ${h.mon.zone ? `the ${h.mon.zone}` : 'a rift'}. ${h.mon.wins ? `${h.mon.wins} Ring win${h.mon.wins === 1 ? '' : 's'}.` : 'It hasn’t fought in the Ring yet.'} ${inSquad ? 'It’s in your Ring squad.' : ''}` }),
      ]);
    }
  }

  function drawScene(s, cam, st, dt) {
    const X = x => Math.round(x - cam), world = width();
    // sky, sun, clouds, hills
    rect(s, 0, 0, W, FLOOR - 20, RC.SKY);
    rect(s, 0, 0, W, 14, RC.SKY_D);
    circle(s, X(cam * 0.9 + 260), 26, 10, RC.SUN);
    for (let k = 0; k < 6; k++) { const cx = ((k * 170 + st.clock * 6) % (world + 200)) - 100 - cam * 0.3; ellipse(s, cx, 30 + (k % 3) * 10, 16, 5, RC.CLOUD); ellipse(s, cx + 10, 27 + (k % 3) * 10, 10, 5, RC.CLOUD); }
    for (let x = -40; x < W + 40; x += 90) ellipse(s, x - ((cam * 0.4) % 90) + 45, FLOOR - 14, 70, 28, RC.HILL_D);
    for (let x = -20; x < W + 40; x += 70) ellipse(s, x - ((cam * 0.6) % 70) + 35, FLOOR - 6, 50, 18, RC.HILL);
    // the ground
    rect(s, 0, FLOOR - 6, W, H - FLOOR + 6, RC.GRASS);
    for (let y = FLOOR; y < H; y += 5) for (let x = ((y * 13) % 11) - (cam % 11); x < W; x += 11) pset(s, x, y, RC.GRASS_D);
    // the back of the house and its door
    rect(s, X(0), 40, 76, FLOOR - 34, RC.BARN); rect(s, X(0), 36, 80, 6, RC.BARN_D);
    for (let y = 48; y < FLOOR; y += 8) hline(s, X(0), X(75), y, RC.BARN_D);
    rect(s, X(24), FLOOR - 44, 26, 50, SLOT.INK); rect(s, X(26), FLOOR - 42, 22, 48, RC.WOOD); pset(s, X(44), FLOOR - 18, SLOT.GOLD);
    // the squad board
    rect(s, X(100), FLOOR - 40, 22, 18, RC.WOOD); rect(s, X(102), FLOOR - 38, 18, 14, RC.SAND); rect(s, X(109), FLOOR - 22, 3, 28, RC.FENCE_D);
    text(s, 'RING', X(111), FLOOR - 35, SLOT.INK, { align: 'center' });
    for (let k = 0; k < 3; k++) rect(s, X(104 + k * 5), FLOOR - 28, 3, 3, profile.squad()[k] ? TYPE_COLOR[profile.squad()[k].type] : SLOT.GRAY);
    // the fence along the back of the pasture, a pond, flowers
    for (let x = 140; x < world; x += 28) { rect(s, X(x), FLOOR - 30, 3, 26, RC.FENCE_D); }
    hline(s, X(140), X(world), FLOOR - 26, RC.FENCE); hline(s, X(140), X(world), FLOOR - 16, RC.FENCE);
    for (let x = 150; x < world; x += 37) { const c = [RC.FLOWER, SLOT.GOLD, SLOT.WHITE][(x / 37 | 0) % 3]; pset(s, X(x), FLOOR + 12 + (x % 5), c); pset(s, X(x) + 1, FLOOR + 12 + (x % 5), c); }
    if (herd().length > 3) { ellipse(s, X(START + GAP * 1.5), FLOOR + 22, 26, 5, RC.WATER); hline(s, X(START + GAP * 1.5) - 10, X(START + GAP * 1.5) + 6, FLOOR + 21, RC.CLOUD); }
    if (!herd().length) {
      const msg = ['AN EMPTY PASTURE.', 'BEAT BOSSES ON YOUR RUNS:', 'AT THE END OF EACH STAGE', 'ONE CAN COME HOME WITH YOU.'];
      msg.forEach((m, i) => { rect(s, X(250) - textWidth(m) / 2 - 3, 50 + i * 10, textWidth(m) + 6, 9, SLOT.PANEL); text(s, m, X(250), 52 + i * 10, SLOT.WHITE, { align: 'center' }); });
    }
    // the herd: roaming around their patch
    const list = visible(st);
    const all = herd();
    all.forEach((m, i) => {
      let a = roam.get(m.id);
      if (!a) { a = { x: homeX(i), dir: i % 2 ? -1 : 1, idle: (i % 3) * 0.7, hop: 0 }; roam.set(m.id, a); }
      a.hop = Math.max(0, a.hop - dt);
      a.idle -= dt;
      if (a.idle <= 0) {
        a.x += a.dir * 16 * dt;
        if (Math.abs(a.x - homeX(i)) > 30 || Math.random() < dt * 0.15) { a.dir = a.x > homeX(i) ? -1 : 1; a.idle = 1.2 + Math.random() * 2.5; }
      }
    });
    list.sort((a, b) => a.x - b.x);
    for (const { m } of list) {
      const a = roam.get(m.id), k = slots.get(m.id);
      const near = Math.abs(st.hero.x - a.x) < 40;
      const lift = a.hop > 0 ? Math.round(Math.sin((a.hop / 0.6) * Math.PI) * 8) : 0;
      const sleeping = !near && Math.sin(st.clock * 0.3 + m.monsterSeed % 10) > 0.85;
      drawMonster(s, m, k, X(a.x), FEET + 2 - lift, { pose: a.hop > 0 ? 'taunt' : 'idle', clock: sleeping ? 0 : st.clock, flip: near ? st.hero.x < a.x : a.dir < 0 });
      if (sleeping) text(s, 'Z', X(a.x) + 14, FEET - 44 - Math.floor(st.clock * 2) % 3 * 3, SLOT.WHITE, { shadow: SLOT.INK });
      // a little type tag on a post
      const tw = textWidth(TYPES[m.type].name.toUpperCase());
      rect(s, X(homeX(all.indexOf(m))) - tw / 2 - 2, FLOOR - 42, tw + 4, 7, TYPE_COLOR[m.type]);
      text(s, TYPES[m.type].name.toUpperCase(), X(homeX(all.indexOf(m))), FLOOR - 41, SLOT.INK, { align: 'center' });
      text(s, `L${m.level}`, X(homeX(all.indexOf(m))), FLOOR - 33, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
      if (profile.squad().some(q => q.id === m.id)) text(s, '*', X(homeX(all.indexOf(m))) + tw / 2 + 4, FLOOR - 42, SLOT.GOLD, { shadow: SLOT.INK });
    }
    // gold and the count
    const info = `${all.length} FRIEND${all.length === 1 ? '' : 'S'}`;
    rect(s, W - textWidth(info) - 10, 3, textWidth(info) + 7, 9, SLOT.PANEL); text(s, info, W - 6, 5, SLOT.GOLD, { align: 'right' });
  }

  const place = createPlace({ id: 'ranch', label: 'The ranch', width, hint: 'A D WALK  /  UP OR E MEET  /  ESC HOME', palette, hotspots, draw: drawScene, use, onLeave });
  return {
    open({ design }) { sound.place('ranch', 1); place.open({ design, x: 40 }); },
    close: () => place.close(), resume: opts => place.resume(opts), hideCanvas: () => place.hideCanvas(),
    get isOpen() { return place.isOpen; },
  };
}
export { monsterCanvas };
