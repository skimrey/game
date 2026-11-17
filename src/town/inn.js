/**
 * The inn — the Tipsy Teapot, on the square's west side (2D, like your home):
 *
 *   the tavern       Bertha the innkeeper behind the bar (a foaming tankard in hand), Pippa the barmaid (a tip with every
 *                    chat) and the CHALLENGE BOARD: three mini-games, new after every run, each
 *                    paying gold once (gold is for cosmetics: the tailor)
 *   the tailor       paint patterns onto clothes you own (tops, capes, wings) and recolour
 *                    trails, for gold
 *   the yard         out the back door: the RING, where tamers from every world pit their
 *                    monsters against each other. The Ring Master keeps the ladder and your
 *                    squad; three tamers wait to be challenged (new ones after every run)
 *
 * This module draws the place and says what's where; app/inn.js decides what happens.
 *
 *   const inn = createInn({ profile, people: () => ({ keeper, tailor, master, tamers }), onUse(id, st) });
 *   inn.open({ design, x });
 */
import { rect, pset, ellipse, line, poly, text, hline, vline, textWidth, circle, blit, frame } from '../engine/pixel.js';
import { SLOT, HR, NPC_MAP, heroBaseColors, hexToRgb255 } from '../engine/palette.js';
import { createHeroSheet, HERO_W, HERO_H } from '../characters/heroSprite.js';
import { createPlace, FLOOR, FEET, W, H } from './place2d.js';
import { ringPalette, RC } from '../ring/art.js';

export const INN = { door: 28, keeper: 150, keeperAt: 150, board: 243, fire: 306, barmaid: [270, 610], tailor: 478, backdoor: 650, master: 716, tamers: [806, 884, 962], width: 1040 };
const C = { WALL: 240, WALL_D: 241, BEAM: 242, FLOORW: 243, FLOOR_D: 244, BAR: 245, BAR_D: 246, BOTTLE: 247, FIRE: 248, FIRE_L: 249, BRICK: 250, CORK: 251, NOTE: 252, SILK: 253, SILK_D: 254, MIRROR: 255 };
const TAVERN = {
  [C.WALL]: '#e9cf9c', [C.WALL_D]: '#d3b37c', [C.BEAM]: '#6b4428', [C.FLOORW]: '#9a6a3e', [C.FLOOR_D]: '#7a4e2a', [C.BAR]: '#8a5a34', [C.BAR_D]: '#5e3b22',
  [C.BOTTLE]: '#4fb06a', [C.FIRE]: '#ff7a2a', [C.FIRE_L]: '#ffd23f', [C.BRICK]: '#a24a3a', [C.CORK]: '#c08a50', [C.NOTE]: '#fff3dc', [C.SILK]: '#7a4ab8', [C.SILK_D]: '#5a3490', [C.MIRROR]: '#bfe6ff',
};
const rampBase = k => 104 + k * 16;
const rampMaps = Array.from({ length: 6 }, (_, k) => { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i >= HR.SKIN && i < HR.SKIN + 16 ? rampBase(k) + (i - HR.SKIN) : i; return m; });

export function createInn({ profile, people, onUse = () => {}, onLeave = () => {} } = {}) {
  const sheets = new Map();
  const sheetFor = npc => { const key = npc.seed ?? npc.name; if (!sheets.has(key)) sheets.set(key, createHeroSheet({ ...npc.design, silly: npc.face })); return sheets.get(key); };
  const cast = () => { const p = people(); return [p.keeper, p.tailor, p.master, ...p.tamers.map(t => t.npc)].filter(Boolean); };

  function palette(st) {
    const pal = ringPalette({ hero: heroBaseColors(st.design), npc: heroBaseColors(people().barmaid.design) });
    cast().slice(0, 6).forEach((npc, k) => heroBaseColors(npc.design).forEach((rgb, i) => { pal[rampBase(k) + i] = rgb; }));
    for (const [i, hex] of Object.entries(TAVERN)) pal[i] = hexToRgb255(hex);
    return pal;
  }

  function hotspots() {
    const p = people();
    const out = [
      { id: 'door', x: INN.door, label: 'Back to the square' },
      { id: 'keeper', x: INN.keeper, label: `${p.keeper.first} (innkeeper)`, labelY: 50, reach: 44 },     // she's big: talk to her from anywhere along her end of the bar
      { id: 'barmaid', x: pippa.x, label: `${p.barmaid.first} (barmaid)`, priority: true, reach: 24 },
      { id: 'board', x: INN.board, label: 'The challenge board' },
      { id: 'tailor', x: INN.tailor, label: `${p.tailor.first} the tailor` },
      { id: 'master', x: INN.master, label: `${p.master.first} (Ring Master)` },
    ];
    p.tamers.forEach((t, i) => out.push({ id: `tamer:${i}`, x: INN.tamers[i], label: `${t.npc.first} · ${t.label}`, tamer: t }));
    return out;
  }

  function person(s, cam, npc, k, x, { face = 1, pose = 'idle', clock = 0, view = 'front', frame = 0, lift = 0, scale = 2 } = {}) {
    const spr = sheetFor(npc).get(view, pose, frame, Math.floor(clock * 6) % 4);
    blit(s, spr, Math.round(x - cam - HERO_W * scale / 2), FEET - HERO_H * scale - lift, { scale, map: k === 'npc' ? NPC_MAP : rampMaps[k], flip: face < 0 });
  }
  // Pippa the barmaid carries a tray between the tables (she stops to chat when you're close)
  const pippa = { x: 300, dir: 1, wait: 0 };
  function walkPippa(st, dt) {
    const near = Math.abs(st.hero.x - pippa.x) < 30;
    if (near || st.paused) return;
    if (pippa.wait > 0) { pippa.wait -= dt; return; }
    pippa.x += pippa.dir * 28 * dt;
    if (pippa.x < INN.barmaid[0] || pippa.x > INN.barmaid[1]) { pippa.dir *= -1; pippa.x = Math.max(INN.barmaid[0], Math.min(INN.barmaid[1], pippa.x)); pippa.wait = 1.5; }
    else if (Math.abs(pippa.x - 352) < 1 || Math.abs(pippa.x - 590) < 1) pippa.wait = 1.2;     // at a table
  }

  function draw(s, cam, st, dt = 0) {
    const X = x => Math.round(x - cam), p = people(), t = st.clock;
    walkPippa(st, dt);
    // --- the tavern (0–650)
    rect(s, X(0), 0, 650, FLOOR, C.WALL);
    for (let x = 0; x < 650; x += 12) rect(s, X(x), 14, 1, FLOOR - 44, C.WALL_D);
    rect(s, X(0), 0, 650, 12, C.BEAM); hline(s, X(0), X(650), 11, SLOT.INK);
    for (let x = 40; x < 650; x += 90) rect(s, X(x), 12, 8, FLOOR - 12, C.BEAM);
    rect(s, X(0), FLOOR - 30, 650, 30, C.BAR_D);
    // the tailor's corner: silk wallpaper
    rect(s, X(376), 12, 264, FLOOR - 42, C.SILK);
    for (let y = 18; y < FLOOR - 34; y += 10) for (let x = 382 + ((y / 10) % 2) * 6; x < 636; x += 12) pset(s, X(x), y, C.SILK_D);
    rect(s, X(0), FLOOR, 650, H - FLOOR, C.FLOORW);
    for (let y = FLOOR + 5; y < H; y += 7) hline(s, X(0), X(650), y, C.FLOOR_D);
    hline(s, X(0), X(650), FLOOR, SLOT.INK);
    // front door
    rect(s, X(12), 56, 32, FLOOR - 56, SLOT.INK); rect(s, X(14), 58, 28, FLOOR - 58, C.BAR); pset(s, X(38), 104, SLOT.GOLD);
    // the bar: shelves of bottles, the counter
    rect(s, X(74), 40, 140, 4, C.BAR_D); rect(s, X(74), 62, 140, 4, C.BAR_D);
    for (let k = 0; k < 13; k++) { rect(s, X(78 + k * 10), 30, 4, 10, [C.BOTTLE, C.FIRE, RC.XP][k % 3]); rect(s, X(79 + k * 10), 27, 2, 3, C.BOTTLE); rect(s, X(80 + k * 10), 52, 5, 10, [RC.XP, C.BOTTLE, C.FIRE][k % 3]); }
    // Bertha behind her bar — large as life, a foaming tankard raised — then the counter in front of her
    person(s, cam, p.keeper, 0, INN.keeperAt, { clock: t, pose: 'toast', face: -1, scale: 3, lift: 30 });        // on a step: the counter comes up to her waist
    rect(s, X(66), FLOOR - 30, 164, 34, C.BAR); rect(s, X(64), FLOOR - 33, 168, 5, C.BAR_D);
    for (let x = 78; x < 224; x += 24) rect(s, X(x), FLOOR - 24, 2, 22, C.BAR_D);                 // panelling
    for (const mx of [78, 96, 196, 212]) { rect(s, X(mx), FLOOR - 41, 7, 8, C.NOTE); rect(s, X(mx + 7), FLOOR - 39, 2, 4, C.NOTE); rect(s, X(mx), FLOOR - 43, 7, 2, SLOT.WHITE); }
    // the challenge board
    rect(s, X(222), 44, 42, 36, C.BAR_D); rect(s, X(224), 46, 38, 32, C.CORK);
    const board = p.board || [];
    board.forEach((c, i) => {
      const nx = X(227 + i * 12), ny = 50 + (i % 2) * 6;
      rect(s, nx, ny, 10, 12, c.paid ? SLOT.GRAY : C.NOTE); pset(s, nx + 5, ny + 1, SLOT.RED);
      hline(s, nx + 2, nx + 7, ny + 5, SLOT.INK); hline(s, nx + 2, nx + 6, ny + 8, SLOT.INK);
      if (!c.paid && Math.floor(t * 2 + i) % 2) pset(s, nx + 8, ny + 10, SLOT.GOLD);
    });
    text(s, 'GOLD!', X(243), 68, SLOT.INK, { align: 'center' });
    // the fireplace and tables
    rect(s, X(280), 58, 52, FLOOR - 58, C.BRICK); rect(s, X(276), 54, 60, 6, C.BAR_D); rect(s, X(290), 86, 32, FLOOR - 86, SLOT.INK);
    for (let k = 0; k < 5; k++) { const h = 10 + Math.round(Math.sin(t * 9 + k * 1.7) * 4); poly(s, [[X(294 + k * 6), FLOOR], [X(297 + k * 6), FLOOR - h - 6], [X(300 + k * 6), FLOOR]], k % 2 ? C.FIRE : C.FIRE_L); }
    for (const tx of [352, 590]) { ellipse(s, X(tx), FLOOR + 4, 18, 4, C.BAR_D); rect(s, X(tx - 2), FLOOR + 4, 4, 14, C.BAR_D); rect(s, X(tx - 8), FLOOR - 2, 5, 6, C.NOTE); }
    // Pippa and her tray
    const near = Math.abs(st.hero.x - pippa.x) < 30;
    person(s, cam, p.barmaid, 'npc', pippa.x, { clock: t, view: near ? 'front' : 'side', pose: near ? 'idle' : 'run', frame: Math.floor(t * 6) % 4, face: near ? 1 : pippa.dir });
    const tx = X(pippa.x) + (near ? 14 : pippa.dir * 16), ty = FEET - 46;
    rect(s, tx - 8, ty, 16, 2, C.BAR_D); for (let k = 0; k < 3; k++) { rect(s, tx - 6 + k * 5, ty - 6, 4, 6, C.NOTE); pset(s, tx - 5 + k * 5, ty - 7, SLOT.WHITE); }
    // the tailor's corner: a mannequin, rolls of cloth, a mirror
    rect(s, X(412), 70, 12, 26, C.SILK_D); ellipse(s, X(418), 66, 6, 6, C.WALL_D); rect(s, X(417), 96, 2, FLOOR - 96, C.BAR_D); rect(s, X(410), FLOOR - 2, 16, 2, C.BAR_D);
    for (let k = 0; k < 4; k++) { rect(s, X(502 + k * 9), FLOOR - 40, 7, 40, [RC.BANNER, RC.XP, RC.BANNER2, RC.HP][k]); rect(s, X(502 + k * 9), FLOOR - 40, 7, 2, SLOT.INK); }
    rect(s, X(548), 50, 26, 48, C.BAR_D); rect(s, X(550), 52, 22, 44, C.MIRROR); line(s, X(554), 58, X(562), 50 + 20, SLOT.WHITE);
    person(s, cam, p.tailor, 1, INN.tailor, { clock: t });
    text(s, 'TAILOR', X(INN.tailor), 30, SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
    // the back door: open, the yard beyond
    rect(s, X(634), 50, 30, FLOOR - 50, SLOT.INK); rect(s, X(636), 52, 26, FLOOR - 52, RC.SKY);
    // --- the yard and the Ring (650–1040)
    rect(s, X(664), 0, 400, FLOOR - 20, RC.SKY);
    for (let k = 0; k < 4; k++) ellipse(s, X(700 + k * 110 + ((t * 5) % 40)), 24 + (k % 2) * 10, 18, 5, RC.CLOUD);
    rect(s, X(664), FLOOR - 40, 400, 24, RC.CROWD_D);
    for (let x = 668; x < 1040; x += 9) { const bob = Math.sin(t * 5 + x) > 0.7 ? -1 : 0; ellipse(s, X(x), FLOOR - 34 + bob, 3, 3, (x / 9) % 2 < 1 ? RC.CROWD : SLOT.DARK); rect(s, X(x) - 3, FLOOR - 31 + bob, 6, 6, (x / 9) % 2 < 1 ? RC.CROWD : SLOT.DARK); }
    rect(s, X(664), FLOOR - 18, 400, 8, RC.FENCE); for (let x = 668; x < 1040; x += 22) rect(s, X(x), FLOOR - 20, 3, 12, RC.FENCE_D);
    rect(s, X(664), FLOOR - 10, 400, H - FLOOR + 10, RC.SAND);
    for (let y = FLOOR; y < H; y += 6) for (let x = 670 + (y * 7) % 13; x < 1040; x += 17) pset(s, X(x), y, RC.SAND_D);
    rect(s, X(696), 54, 40, 16, RC.BANNER); text(s, 'RING', X(716), 58, SLOT.WHITE, { align: 'center' }); rect(s, X(714), 70, 4, FLOOR - 80, RC.FENCE_D);
    person(s, cam, p.master, 2, INN.master, { clock: t });
    p.tamers.forEach((tm, i) => {
      person(s, cam, tm.npc, 3 + i, INN.tamers[i], { clock: t + i, pose: tm.beaten ? 'cheer' : 'idle', face: -1 });
      const lbl = tm.beaten ? 'BEATEN' : tm.label.toUpperCase();
      rect(s, X(INN.tamers[i]) - textWidth(lbl) / 2 - 3, 92, textWidth(lbl) + 6, 9, tm.beaten ? SLOT.DARK : SLOT.PANEL);
      text(s, lbl, X(INN.tamers[i]), 94, tm.beaten ? SLOT.GRAY : SLOT.GOLD, { align: 'center' });
    });
    // gold, top right
    const gold = `GOLD ${profile.gold()}`;
    rect(s, W - textWidth(gold) - 14, 3, textWidth(gold) + 11, 10, SLOT.PANEL);
    circle(s, W - textWidth(gold) - 8, 8, 3, SLOT.GOLD); text(s, gold, W - 5, 5, SLOT.GOLD, { align: 'right' });
  }

  const place = createPlace({ id: 'inn', label: 'The Tipsy Teapot', width: () => INN.width, hint: 'A D WALK  /  UP OR E TALK  /  ESC SQUARE', palette, hotspots, draw, use: (h, st) => onUse(h, st), onLeave });
  return {
    open: opts => place.open(opts), close: () => place.close(), resume: opts => place.resume(opts), hideCanvas: () => place.hideCanvas(),
    showPanel: (...a) => place.showPanel(...a), hidePanel: () => place.hidePanel(), pause: () => place.pause(), refresh: () => place.refresh(),
    get isOpen() { return place.isOpen; }, get state() { return place.state; },
  };
}
