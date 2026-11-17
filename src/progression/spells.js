/**
 * Classes and the spellbook — what your hero can do in the 2D games.
 *
 * At the portal you choose a class for the run: Warrior, Hunter or Sorcerer. Each class
 * starts with one signature spell and has a spellbook of six; the NPC you meet in each
 * stage teaches you one more (you pick one of two), so by the end of a run you know up to
 * five. Spells are forgotten when the run ends (it's a roguelite) — the class is chosen
 * again at the portal.
 *
 * Spells work in every 2D mini-game (boss fights, checkpoints, journeys and quest duels)
 * because they only touch what every game shares (games/kit/common.js): hearts, the clock,
 * the boss's health (or the goal still to make), the hero's blink-time after a hit, and
 * how fast the game runs.
 *
 *   active   one cast per battle (keys 1–5 or the numpad; Tab casts the next one ready; or click the spell bar); Echo gives two. In a
 *            dungeon delve (games/delve/rules.js) spent spells recharge, and their hits land on
 *            the nearest foe (the game's spellHit)
 *   passive  always on
 *
 * The books are built to be complementary: every class has something to survive with,
 * something to win faster with, and a passive that makes the others better —
 *   Warrior   hold the line: guard, heal, a fourth heart, and turn the hits you take into
 *             hits on the boss (Thorns + Iron Skin + Last Stand make a tank that wins by
 *             being hit)
 *   Hunter    read, then strike: slow time down to land more good moves, and Predator turns
 *             good moves into extra hits (Eagle Eye + Predator, Keen Senses for the clock)
 *   Sorcerer  bend the rules: the strongest slow-down, bolts and time, and Echo casts every
 *             spell twice
 */
import { heal, hitBoss } from '../games/kit/common.js';
import { createSurface, rect, pset, ellipse, line, poly, ring, outline } from '../engine/pixel.js';

export const CLASSES = {
  warrior: { id: 'warrior', name: 'Warrior', motto: 'Hold the line', color: '#ff7a59', about: 'Tough and steady: shields, second winds, and hits that hit back.', signature: 'shieldwall', kit: 'sword & shield' },
  hunter: { id: 'hunter', name: 'Hunter', motto: 'Read, then strike', color: '#7bd88f', about: 'Sharp eyes and patience: slow the world down, then strike twice.', signature: 'eagleeye', kit: 'bow & dodge-roll' },
  sorcerer: { id: 'sorcerer', name: 'Sorcerer', motto: 'Bend the rules', color: '#b58cff', about: 'Time and arcane bolts — and every spell echoes a second time.', signature: 'timewarp', kit: 'arcane bolts & blink' },
};
export const CLASS_IDS = Object.keys(CLASSES);

/**
 * Every spell: { id, cls, name, kind: 'active' | 'passive', about, icon, effect }
 * effect (active): { guard: s } { heal: n } { hit: n } { volley: n } { slow: [s, scale] } { time: s }
 * passives are looked up by id in the runtime.
 */
const SPELL_LIST = [
  // Warrior
  { id: 'shieldwall', cls: 'warrior', name: 'Shield Wall', kind: 'active', icon: 'shield', about: 'For 5 seconds, hits don’t cost hearts.', effect: { guard: 5 }, what: 'For 5 seconds, anything that would cost you a heart doesn’t.', when: 'Just before a hit you can’t dodge — or to push through a dangerous stretch.' },
  { id: 'secondwind', cls: 'warrior', name: 'Second Wind', kind: 'active', icon: 'heart', about: 'Win back a heart.', effect: { heal: 1 }, what: 'Wins back one heart you’ve lost.', when: 'After you’ve been hit (it does nothing at full health).' },
  { id: 'ironskin', cls: 'warrior', name: 'Iron Skin', kind: 'passive', icon: 'armor', about: 'Start every battle with a fourth heart.', what: 'You start every mini-game with a fourth heart.', when: 'Always on — nothing to press.' },
  { id: 'thorns', cls: 'warrior', name: 'Thorns', kind: 'passive', icon: 'thorns', about: 'Every heart you lose also hits the boss (or fills your goal).', what: 'Every heart you lose also damages the boss (or moves a checkpoint on).', when: 'Always on — nothing to press.' },
  { id: 'cleave', cls: 'warrior', name: 'Cleave', kind: 'active', icon: 'axe', about: 'A mighty blow: two hits on the boss (or two steps toward the goal).', effect: { hit: 2 }, what: 'Two instant hits on the boss (or two steps towards a checkpoint’s goal). It never misses.', when: 'Any time — it’s a great finisher when the boss is nearly down.' },
  { id: 'laststand', cls: 'warrior', name: 'Last Stand', kind: 'passive', icon: 'skull', about: 'Once a battle, a knock-out blow leaves you on one heart instead.', what: 'Once per mini-game, a hit that would knock you out leaves you on one heart instead.', when: 'Always on — nothing to press.' },
  // Hunter
  { id: 'eagleeye', cls: 'hunter', name: 'Eagle Eye', kind: 'active', icon: 'eye', about: 'Slow the world to half speed for 6 seconds.', effect: { slow: [6, 0.5] }, what: 'Slows the WHOLE game — the boss, its attacks and you — to half speed for 6 seconds, so you get twice the time to react.', when: 'Cast it when things get fast or busy: a flurry of attacks, tricky aiming, tight timing.' },
  { id: 'volley', cls: 'hunter', name: 'Volley', kind: 'active', icon: 'arrows', about: 'Three arrows, one after another: three hits.', effect: { volley: 3 }, what: 'Three hits on the boss, one after another over a second and a half.', when: 'Any time — handy when the boss is hard to reach.' },
  { id: 'rations', cls: 'hunter', name: 'Trail Rations', kind: 'active', icon: 'drumstick', about: 'A snack from your pack: win back a heart.', effect: { heal: 1 }, what: 'Wins back one heart you’ve lost.', when: 'After you’ve been hit (it does nothing at full health).' },
  { id: 'keensenses', cls: 'hunter', name: 'Keen Senses', kind: 'passive', icon: 'ear', about: 'Ten more seconds on every clock.', what: 'Ten more seconds on every mini-game’s clock.', when: 'Always on — nothing to press.' },
  { id: 'camouflage', cls: 'hunter', name: 'Camouflage', kind: 'active', icon: 'leaf', about: 'Blend in: for 4 seconds, hits don’t cost hearts.', effect: { guard: 4 }, what: 'For 4 seconds, anything that would cost you a heart doesn’t.', when: 'Just before a hit you can’t dodge.' },
  { id: 'predator', cls: 'hunter', name: 'Predator', kind: 'passive', icon: 'paw', about: 'Every fifth good move lands an extra hit.', what: 'Every fifth good move (a hit, a catch, a right key…) lands an extra hit on the boss.', when: 'Always on — nothing to press.' },
  // Sorcerer
  { id: 'timewarp', cls: 'sorcerer', name: 'Time Warp', kind: 'active', icon: 'hourglass', about: 'Slow time to 40 % for 5 seconds.', effect: { slow: [5, 0.4] }, what: 'Slows the WHOLE game — the boss, its attacks and you — to 40 % speed for 5 seconds, so everything comes at you more than twice as slowly.', when: 'Cast it when things get fast or busy: a flurry of attacks, tricky aiming, tight timing. Tap it and play on as usual — everything is just slower.' },
  { id: 'arcanebolt', cls: 'sorcerer', name: 'Arcane Bolt', kind: 'active', icon: 'bolt', about: 'Two hits on the boss (or two steps toward the goal).', effect: { hit: 2 }, what: 'Two instant hits on the boss (or two steps towards a checkpoint’s goal). It never misses.', when: 'Any time — a great finisher when the boss is nearly down.' },
  { id: 'chronoshift', cls: 'sorcerer', name: 'Chronoshift', kind: 'active', icon: 'clock', about: 'Twenty more seconds on the clock.', effect: { time: 20 }, what: 'Twenty more seconds on the clock.', when: 'When the clock is running low.' },
  { id: 'manashield', cls: 'sorcerer', name: 'Mana Shield', kind: 'active', icon: 'bubble', about: 'For 4 seconds, hits don’t cost hearts.', effect: { guard: 4 }, what: 'For 4 seconds, anything that would cost you a heart doesn’t.', when: 'Just before a hit you can’t dodge.' },
  { id: 'mend', cls: 'sorcerer', name: 'Mend', kind: 'active', icon: 'sparkle', about: 'Knit a lost heart back together.', effect: { heal: 1 }, what: 'Wins back one heart you’ve lost.', when: 'After you’ve been hit (it does nothing at full health).' },
  { id: 'echo', cls: 'sorcerer', name: 'Echo', kind: 'passive', icon: 'echo', about: 'Every spell can be cast twice a battle.', what: 'Every spell you press can be cast twice per mini-game instead of once.', when: 'Always on — nothing to press.' },
];
export const SPELLS = Object.fromEntries(SPELL_LIST.map(s => [s.id, s]));
export const SPELLBOOK = Object.fromEntries(CLASS_IDS.map(c => [c, SPELL_LIST.filter(s => s.cls === c).map(s => s.id)]));

export const SPELL_RULES = {
  maxKnown: 5,           // the signature spell + one per stage
  offer: 2,              // an NPC offers this many to choose from
  predatorEvery: 5,
  volleyGap: 0.45,       // s between a volley's arrows
  lastStandGuard: 2,
  keenSenses: 10,
};

/** Spells of a class the hero doesn't know yet, in book order. */
export function unlearned(cls, known = []) {
  return (SPELLBOOK[cls] || []).filter(id => !known.includes(id));
}

/** The spells an NPC offers: `offer` unlearned ones, drawn with rng (fewer when the book runs out). */
export function spellOffer(cls, known, rng = Math.random, n = SPELL_RULES.offer) {
  const left = unlearned(cls, known);
  for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
  return left.slice(0, n);
}

/**
 * The spells at work in one battle. The battle screen calls:
 *   begin(game)            passives that change the start (a fourth heart, more time)
 *   cast(i, game)          an active spell (→ { ok, spell, reason })
 *   afterStep(game)        after every game step: guards, Thorns, Predator, Last Stand,
 *                          volleys (reads the step's new events; marks blocked hits)
 *   tick(dtReal)           real-time countdowns (slow motion lasts real seconds)
 *   timeScale              how fast the game should run right now
 *   drained()              the screen drained the game's events
 */
export function createSpellRuntime(known = [], { kind = 'boss', recharge = 0 } = {}) {
  const has = id => known.includes(id);
  const charges = has('echo') ? 2 : 1;
  // a hit from a spell: on the boss — or, in a game with foes of its own (the delve), on the nearest foe
  const strike = (g, n, how) => (g.spellHit ? g.spellHit(n, how) : hitBoss(g, n));
  const rt = {
    kind,
    recharge,              // s for a spent spell to come back (0: once per game — the delve recharges)
    version: 0,            // bumps whenever a charge or a recharge countdown changes (the spell bar redraws)
    spells: known.map(id => SPELLS[id]).filter(Boolean).map(s => ({ ...s, left: s.kind === 'active' ? charges : 0, max: s.kind === 'active' ? charges : 0, cd: 0 })),
    guard: 0,
    slow: 0,
    slowScale: 1,
    volley: [],            // game times at which an arrow lands
    good: 0,
    lastStand: has('laststand'),
    seen: 0,
    flash: null,           // { text, t } — the name of the spell just cast (drawing)
    get timeScale() { return this.slow > 0 ? this.slowScale : 1; },
    get active() { return this.spells.filter(s => s.kind === 'active'); },

    begin(g) {
      if (has('ironskin')) { g.maxHearts += 1; g.hearts += 1; }
      if (has('keensenses')) g.timeLeft += SPELL_RULES.keenSenses;
      this.seen = g.events.length;
    },

    cast(i, g) {
      const s = this.active[i];
      if (!s) return { ok: false, reason: 'none' };
      if (s.left <= 0) return { ok: false, reason: 'spent', spell: s };
      if (g.result !== 'playing' || g.victory > 0) return { ok: false, reason: 'over', spell: s };
      const e = s.effect;
      if (e.heal && g.hearts >= g.maxHearts) return { ok: false, reason: 'full', spell: s };
      s.left--;
      if (recharge && s.cd <= 0) s.cd = recharge;
      this.version++;
      if (e.guard) this.guard = Math.max(this.guard, e.guard);
      if (e.heal) for (let k = 0; k < e.heal; k++) heal(g);
      if (e.hit) strike(g, e.hit, 'spell');
      if (e.volley) for (let k = 1; k <= e.volley; k++) this.volley.push(g.time + k * SPELL_RULES.volleyGap);
      if (e.slow) { this.slow = e.slow[0]; this.slowScale = e.slow[1]; }
      if (e.time) g.timeLeft += e.time;
      this.flash = { text: s.name, t: 1.2 };
      g.events.push({ type: 'spell', spell: s.id });
      this.seen = g.events.length;
      return { ok: true, spell: s };
    },

    afterStep(g) {
      // volleys land over time (game time: they slow down with the world)
      while (this.volley.length && g.time >= this.volley[0] && g.result === 'playing') { this.volley.shift(); strike(g, 1, 'arrow'); g.events.push({ type: 'arrow' }); }
      const fresh = g.events.slice(this.seen);
      for (const e of fresh) {
        if (e.type === 'hurt' && !e.blocked) {
          if (this.guard > 0) {
            // the guard soaks it: the heart comes back (the knock itself still happens)
            e.blocked = true;
            g.hearts = Math.min(g.maxHearts, g.hearts + 1);
            if (g.result === 'lost' && g.reason === 'hearts') { g.result = 'playing'; g.reason = null; }
            continue;
          }
          if (has('thorns')) { strike(g, 1, 'thorns'); g.events.push({ type: 'thorns' }); }
          if (g.result === 'lost' && g.reason === 'hearts' && this.lastStand) {
            this.lastStand = false;
            g.result = 'playing'; g.reason = null; g.hearts = 1;
            g.invulnerable = Math.max(g.invulnerable, SPELL_RULES.lastStandGuard);
            this.flash = { text: 'Last Stand', t: 1.2 };
            g.events.push({ type: 'laststand' });
          }
        } else if (e.type === 'good' && has('predator')) {
          if (++this.good % SPELL_RULES.predatorEvery === 0 && g.bossHp > 0) { strike(g, 1, 'pounce'); g.events.push({ type: 'pounce' }); }
        }
      }
      this.seen = g.events.length;
    },

    tick(dt) {
      if (recharge) {
        for (const s of this.spells) {
          if (s.kind !== 'active' || s.left >= s.max) continue;
          const shown = Math.ceil(s.cd);
          s.cd -= dt;
          if (s.cd <= 0) { s.left++; s.cd = s.left < s.max ? recharge : 0; this.version++; }
          else if (Math.ceil(s.cd) !== shown) this.version++;
        }
      }
      this.guard = Math.max(0, this.guard - dt * this.timeScale);
      this.slow = Math.max(0, this.slow - dt);
      if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    },

    drained() { this.seen = 0; },
  };
  return rt;
}

// ---------------------------------------------------------------------------
// Pixel icons (16×16, their own little palette — see ICON_COLORS)
// ---------------------------------------------------------------------------
export const ICON_COLORS = [
  [0, 0, 0], [27, 16, 40], [255, 248, 240], [255, 59, 92], [255, 210, 63], [154, 160, 180], [94, 240, 255], [123, 216, 143],
  [181, 140, 255], [176, 122, 18], [255, 122, 89], [60, 120, 70], [120, 80, 200], [58, 53, 80],
];
const I = { INK: 1, WHITE: 2, RED: 3, GOLD: 4, GRAY: 5, CYAN: 6, GREEN: 7, VIOLET: 8, BROWN: 9, ORANGE: 10, DGREEN: 11, DVIOLET: 12, DARK: 13 };

const ICONS = {
  shield: s => { poly(s, [[3, 2], [12, 2], [12, 8], [7.5, 14], [3, 8]], I.GRAY); poly(s, [[5, 4], [10, 4], [10, 8], [7.5, 11], [5, 8]], I.RED); rect(s, 7, 4, 1, 7, I.GOLD); },
  heart: s => { for (const [x, y, w] of [[3, 4, 4], [9, 4, 4], [2, 5, 12], [2, 6, 12], [3, 8, 10], [4, 9, 8], [5, 10, 6], [6, 11, 4], [7, 12, 2]]) rect(s, x, y, w, 1, I.RED); rect(s, 2, 7, 12, 1, I.RED); pset(s, 4, 5, I.WHITE); rect(s, 11, 1, 1, 5, I.GREEN); rect(s, 9, 3, 5, 1, I.GREEN); },
  armor: s => { rect(s, 3, 3, 10, 10, I.GRAY); rect(s, 3, 3, 3, 3, I.DARK); rect(s, 10, 3, 3, 3, I.DARK); rect(s, 5, 6, 6, 5, I.WHITE); rect(s, 7, 4, 2, 9, I.GOLD); },
  thorns: s => { line(s, 2, 13, 13, 2, I.DGREEN); line(s, 3, 13, 13, 3, I.GREEN); for (const [x, y] of [[5, 10], [8, 7], [11, 4]]) { pset(s, x - 1, y - 1, I.WHITE); pset(s, x + 1, y + 1, I.WHITE); } ellipse(s, 12, 12, 2, 2, I.RED); },
  axe: s => { line(s, 3, 13, 11, 5, I.BROWN); line(s, 4, 13, 12, 5, I.BROWN); poly(s, [[8, 2], [14, 4], [13, 9], [10, 6]], I.GRAY); line(s, 14, 4, 13, 9, I.WHITE); },
  skull: s => { ellipse(s, 8, 7, 5, 5, I.WHITE); rect(s, 5, 10, 6, 3, I.WHITE); rect(s, 5, 6, 2, 2, I.INK); rect(s, 9, 6, 2, 2, I.INK); pset(s, 8, 9, I.INK); rect(s, 6, 12, 1, 1, I.INK); rect(s, 9, 12, 1, 1, I.INK); },
  eye: s => { ellipse(s, 8, 8, 6, 4, I.WHITE); ellipse(s, 8, 8, 3, 3, I.GOLD); ellipse(s, 8, 8, 1.5, 1.5, I.INK); pset(s, 7, 7, I.WHITE); },
  arrows: s => { for (const k of [0, 3, 6]) { line(s, 2 + k, 13, 9 + k, 6 - 3, I.BROWN); pset(s, 9 + k, 3, I.GRAY); pset(s, 8 + k, 3, I.GRAY); pset(s, 9 + k, 4, I.GRAY); } },
  drumstick: s => { ellipse(s, 6, 6, 4, 4, I.ORANGE); ellipse(s, 5, 5, 2, 2, I.GOLD); line(s, 9, 9, 13, 13, I.WHITE); rect(s, 12, 12, 2, 2, I.WHITE); },
  ear: s => { ellipse(s, 8, 8, 5, 6, I.ORANGE); ellipse(s, 8, 8, 3, 4, I.RED); rect(s, 7, 6, 2, 5, I.ORANGE); for (const k of [0, 2]) pset(s, 14, 4 + k * 4, I.CYAN); line(s, 13, 6, 14, 8, I.CYAN); },
  leaf: s => { poly(s, [[2, 13], [4, 5], [12, 2], [11, 10]], I.GREEN); line(s, 2, 13, 11, 4, I.DGREEN); },
  paw: s => { ellipse(s, 8, 10, 4, 3, I.BROWN); for (const [x, y] of [[4, 5], [7, 3], [10, 3], [12, 6]]) ellipse(s, x, y, 1.5, 1.5, I.BROWN); },
  hourglass: s => { rect(s, 3, 2, 10, 2, I.BROWN); rect(s, 3, 12, 10, 2, I.BROWN); poly(s, [[4, 4], [12, 4], [8, 8]], I.CYAN); poly(s, [[8, 8], [12, 12], [4, 12]], I.GOLD); },
  bolt: s => { poly(s, [[9, 1], [3, 9], [7, 9], [5, 15], [12, 6], [8, 6]], I.VIOLET); line(s, 9, 1, 5, 8, I.WHITE); },
  clock: s => { ellipse(s, 8, 8, 6, 6, I.WHITE); ring(s, 8, 8, 6, I.GOLD); line(s, 8, 8, 8, 4, I.INK); line(s, 8, 8, 11, 8, I.INK); },
  bubble: s => { ellipse(s, 8, 8, 6, 6, I.DVIOLET); ellipse(s, 8, 8, 5, 5, I.VIOLET); rect(s, 5, 5, 2, 2, I.WHITE); },
  sparkle: s => { for (const [x, y, r] of [[8, 8, 5], [3, 3, 2], [13, 12, 2]]) { line(s, x - r, y, x + r, y, I.CYAN); line(s, x, y - r, x, y + r, I.CYAN); } pset(s, 8, 8, I.WHITE); },
  echo: s => { ring(s, 8, 8, 6, I.DVIOLET); ring(s, 8, 8, 4, I.VIOLET); ellipse(s, 8, 8, 2, 2, I.WHITE); },
};

/** A spell's 16×16 icon (indices into ICON_COLORS), outlined. */
export function spellIcon(id) {
  const s = createSurface(16, 16);
  (ICONS[SPELLS[id]?.icon] || ICONS.sparkle)(s);
  return outline(s, I.INK);
}

/** Paint a spell icon into a canvas (browser): scale × 16 px. */
export function paintSpellIcon(canvas, id, { scale = 3, dim = false } = {}) {
  const s = spellIcon(id);
  canvas.width = canvas.height = 16 * scale;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(16 * scale, 16 * scale);
  for (let y = 0; y < 16 * scale; y++) for (let x = 0; x < 16 * scale; x++) {
    const c = s.buf[(y / scale | 0) * 16 + (x / scale | 0)], i = (y * 16 * scale + x) * 4;
    if (!c) continue;
    const [r, g, b] = ICON_COLORS[c];
    const k = dim ? 0.35 : 1;
    img.data[i] = r * k + (dim ? 40 : 0); img.data[i + 1] = g * k + (dim ? 40 : 0); img.data[i + 2] = b * k + (dim ? 50 : 0); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
