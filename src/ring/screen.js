/**
 * The Ring (2D pixel art, 400×225): your three monsters against a tamer's three.
 *
 *   const ring = createRingScreen();
 *   const { won, draw, skipped, battle } = await ring.start({
 *     mine: [mon, mon, mon], foes: [mon, mon, mon],
 *     me: { design, name }, foe: { name, title, design, skill }, seed, title });
 *
 * A round: choose a command for each of your monsters in turn (← → ↑ ↓ a move, Enter; if it
 * needs a target: ← → and Enter; Esc goes back a step) — or click a move, then a monster.
 * Then the round plays out in speed order: lunges, type-coloured bursts, damage numbers,
 * "super effective!", knock-outs, statuses. The fight is the rules of ring/battle.js; the
 * other side is ring/ai.js.
 */
import { createSurface, rect, pset, blit, ellipse, line, text, ring, frame, poly, textWidth, present, hline, stipple, circle } from '../engine/pixel.js';
import { SLOT, packPalette, heroBaseColors, NPC_MAP } from '../engine/palette.js';
import { createHeroSheet } from '../characters/heroSprite.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';
import { mulberry32, hashSeed } from '../levels/generator.js';
import { createBattle, resolveRound, commandsFor, targetsFor, damageOf, alive } from './battle.js';
import { chooseCommands } from './ai.js';
import { TYPES, effectiveness, BODIES } from './monsters.js';
import { drawMonster, ringPalette, typeBadge, statusIcon, RC, TYPE_COLOR, MON_SIZE } from './art.js';
import { sound } from '../audio/music.js';

export const W = 400, H = 225;
const SLOTS = [[[70, 104], [122, 136], [70, 168]], [[330, 104], [278, 136], [330, 168]]];   // [foe side, my side] (feet)
const PANEL_Y = 174;
const MOVE_BTN = k => ({ x: 96 + (k % 2) * 100, y: PANEL_Y + 4 + Math.floor(k / 2) * 23, w: 96, h: 20 });
const MIN_FRAME_MS = 1000 / 60;
const SCREEN_SIDE = side => (side === 0 ? 1 : 0);          // rules side 0 = you → drawn on the right

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

export const RING_RULES_HTML = `
  <li>Three monsters a side. Each round every monster gets one command; then everything happens in <strong>speed order</strong> (Guard and a few quick moves go first).</li>
  <li><strong>Types</strong>: each hits two others hard (×1.5) — Flame › Leaf & Frost · Tide › Flame & Stone · Leaf › Tide & Stone · Stone › Flame & Gem · Frost › Spore & Gem · Spore › Tide & Star · Gem › Spore & Star · Star › Frost & Leaf.</li>
  <li>Every monster has a basic attack, a <strong>signature move</strong> from the game you fought it in, a move from its body, and <strong>Guard</strong> (half damage). Big moves need a few rounds to come back.</li>
  <li>Keys: <strong>arrows</strong> choose · <strong>Enter</strong> confirm · <strong>Esc</strong> back. Or click a move, then a monster.</li>`;

export function createRingScreen({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'card-screen ring-screen', 'aria-label': 'The Ring' });
  root.hidden = true;
  const canvas = el('canvas', { width: W, height: H, class: 'card-canvas', tabindex: '-1', 'aria-hidden': 'true' });
  const card = el('div', { class: 'boss-card card-card', role: 'dialog' });
  card.hidden = true;
  root.append(canvas, card);
  parent.append(root);
  fitPixelCanvas(canvas, { w: W, h: H });
  const ctx = canvas.getContext('2d', { alpha: false });
  const target = { ctx, image: null };
  const screen = createSurface(W, H);
  let st = null;

  function showCard(html, buttons) {
    card.replaceChildren();
    card.insertAdjacentHTML('beforeend', html);
    const row = el('div', { class: 'boss-buttons' });
    for (const [label, action, primary] of buttons) row.append(el('button', { type: 'button', class: primary ? 'primary' : '', text: label, onclick: action }));
    card.append(row);
    card.hidden = false;
    row.querySelector('button.primary, button')?.focus();
  }
  const hideCard = () => { card.hidden = true; };

  // ---------------------------------------------------------------------------
  // Where things are
  // ---------------------------------------------------------------------------
  const posOf = (side, slot) => { const [x, y] = SLOTS[SCREEN_SIDE(side)][slot]; return st?.quake > 0 ? [x + Math.round(Math.sin(st.clock * 70) * 2), y + Math.round(Math.cos(st.clock * 55))] : [x, y]; };
  const ramp = (side, slot) => side * 3 + slot;        // palette ramps 0–2 yours, 3–5 theirs
  const disp = (side, slot) => st.disp[side][slot];

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------
  /** Your monsters that will act this round (frozen, stunned or resting ones sit it out). */
  const actors = () => alive(st.b, 0).filter(u => !(u.st.freeze > 0 || u.st.stun || u.st.rest));
  const current = () => actors()[st.cmdIdx] || null;
  function movesNow(u) { const can = commandsFor(st.b, u); return u.moves.map(m => ({ move: m, ok: can.includes(m) })); }

  function beginCommands() {
    st.phase = 'command';
    st.commands = [];
    st.cmdIdx = 0; st.sel = 0; st.picking = null;
    if (!actors().length) submit();
    else if (st.auto) autoCommands();
  }
  function chooseMove(k) {
    const u = current(); if (!u) return;
    const m = u.moves[k];
    if (!m || !commandsFor(st.b, u).includes(m)) { sound.fx('wrong'); return; }
    const targets = targetsFor(st.b, u, m);
    if (m.target === 'foe' || m.target === 'ally') {
      const best = m.target === 'foe' ? targets.reduce((a, t) => (damageOf(u, t, m.power || 1) / t.hp > damageOf(u, a, m.power || 1) / a.hp ? t : a), targets[0]) : targets.reduce((a, t) => (t.hp / t.maxHp < a.hp / a.maxHp ? t : a), targets[0]);
      st.picking = { move: m, targets, k: Math.max(0, targets.indexOf(best)) };
      sound.fx('select');
      return;
    }
    commit(u, m, null);
  }
  function commit(u, m, t) {
    st.commands.push({ side: 0, slot: u.slot, move: m.id, target: t ? t.slot : null });
    st.picking = null;
    sound.fx('select');
    st.cmdIdx++;
    st.sel = 0;
    if (st.cmdIdx >= actors().length) submit();
  }
  function back() {
    if (st.picking) { st.picking = null; sound.fx('close'); return; }
    if (st.cmdIdx > 0) { st.cmdIdx--; st.commands.pop(); sound.fx('close'); }
  }
  function autoCommands() {
    st.commands = chooseCommands(st.b, 0, { skill: 1, rng: st.rng });
    submit();
  }
  function submit() {
    const theirs = chooseCommands(st.b, 1, { skill: st.foe.skill ?? 0.8, rng: st.rng });
    const events = resolveRound(st.b, [...st.commands, ...theirs]);
    st.queue = events.slice();
    st.phase = 'playback';
    st.wait = 0.2;
  }

  // ---------------------------------------------------------------------------
  // Playback: events → motion, numbers, sound
  // ---------------------------------------------------------------------------
  const say = (str, c = SLOT.WHITE, t = 0.9) => { st.banner = { str, c, t }; };
  function pop(side, slot, str, c, big = false) {
    const [x, bottom] = posOf(side, slot);
    st.pops.push({ x, y: bottom - MON_SIZE + 6, str, c, t: 0.9, big });
  }
  function burstAt(side, slot, color, n = 14) {
    const [x, bottom] = posOf(side, slot);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60; st.parts.push({ x, y: bottom - 22, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0.5 + Math.random() * 0.3, c: color }); }
  }
  function nameOf(side, slot) { return st.b.units[side][slot].mon.name.split(' ')[0].toUpperCase(); }
  // How each move looks: a dash and a strike, a projectile of its type, a wave across the other
  // side, or something on itself / an ally.
  const MELEE = new Set(['walker', 'whack', 'echo', 'maze', 'delve']);
  const WAVES = { sled: 'snow', bomber: 'spore', brute: 'sound', flyer: 'wind' };
  const SHOTS = { quickdraw: 'bullet', fireball: 'fireball', runner: 'spike', invaders: 'laser', shards: 'shard', tennis: 'ball', fishing: 'hook', starbeat: 'note', cannon: 'cannonball' };
  function styleOf(u, id) {
    if (WAVES[id]) return { style: 'wave', kind: WAVES[id] };
    if (SHOTS[id]) return { style: 'shot', kind: SHOTS[id] };
    if (MELEE.has(id)) return { style: 'melee' };
    if (id === 'basic') return ['flyer', 'floater'].includes(u.mon.body) ? { style: 'shot', kind: u.type } : { style: 'melee' };
    return { style: 'support' };
  }
  const center = (side, slot) => { const [x, b] = posOf(side, slot); return [x, b - 22]; };
  const fx = (kind, o) => st.fx.push({ kind, t: 0, ...o });

  function play(e) {
    const u = e.side !== undefined ? st.b.units[e.side]?.[e.slot] : null;
    switch (e.type) {
      case 'round': say(`ROUND ${e.round}`, SLOT.GOLD, 0.7); return 0.55;
      case 'move': {
        st.act = { side: e.side, slot: e.slot, id: e.move, ...styleOf(u, e.move) };
        say(`${nameOf(e.side, e.slot)}: ${e.name.toUpperCase()}`, e.side === 0 ? SLOT.GOLD : SLOT.WHITE, 1.1);
        const d = disp(e.side, e.slot);
        d.wind = 0.3;                                             // a little wind-up before anything happens
        if (st.act.style === 'wave') {
          const [x, y] = center(e.side, e.slot);
          fx('wave', { side: 1 - e.side, from: x, y, dur: 0.55, wave: st.act.kind, c: TYPE_COLOR[u.type] });
          sound.fx({ snow: 'frost', spore: 'fog', sound: 'horn', wind: 'dash' }[st.act.kind] || 'swing');
          return 0.5;
        }
        if (e.move === 'guard') { sound.fx('block'); return 0.25; }
        if (st.act.style === 'support') { sound.fx('spell'); return 0.3; }
        return 0.28;
      }
      case 'mimic': say(`MIMICS ${e.name.toUpperCase()}!`, RC.XP); { const [x, y] = center(e.side, e.slot); fx('ring', { x, y, dur: 0.4, c: RC.XP, r: 26 }); } return 0.35;
      case 'hit': {
        const [x0, y0] = center(e.side, e.slot), [x1, y1] = center(e.tside, e.tslot);
        const act = st.act && st.act.side === e.side && st.act.slot === e.slot ? st.act : { style: 'melee' };
        st.lastColor = TYPE_COLOR[u?.type] ?? SLOT.WHITE;
        st.lastStyle = act.style;
        if (act.style === 'melee') {
          disp(e.side, e.slot).dash = { tx: x1 - x0 + (e.side === 0 ? 26 : -26), ty: y1 - y0, t: 0, dur: 0.42 };
          sound.fx('dash');
          return 0.2;                                            // the blow lands halfway through the dash
        }
        if (act.style === 'shot') {
          const dur = act.kind === 'bullet' || act.kind === 'laser' ? 0.13 : act.kind === 'cannonball' ? 0.42 : act.kind === 'hook' ? 0.22 : 0.28;
          fx('shot', { x0, y0, x1, y1, dur, shot: act.kind, c: st.lastColor, arc: ['bullet', 'laser', 'hook'].includes(act.kind) ? 0 : act.kind === 'cannonball' ? 30 : 14 });
          sound.fx(act.kind === 'bullet' ? 'shoot' : act.kind === 'laser' ? 'bolt' : act.kind === 'cannonball' ? 'slam' : 'shoot');
          return dur;
        }
        return 0.06;                                             // a wave: it's already on its way
      }
      case 'miss': { const d = disp(e.tside, e.tslot); d.dodge = 0.35; pop(e.tside, e.tslot, 'MISS', SLOT.GRAY); sound.fx('move'); return 0.35; }
      case 'crit': { st.quake = 0.35; st.whiteout = 0.18; pop(e.side, e.slot, 'CRITICAL!', SLOT.GOLD); return 0.05; }
      case 'damage': {
        const d = disp(e.side, e.slot), t = st.b.units[e.side][e.slot];
        d.hp = e.hp; d.flash = 0.28; d.knock = 0.3;
        const [x, y] = center(e.side, e.slot), col = e.counter ? SLOT.GOLD : st.lastColor ?? SLOT.WHITE;
        pop(e.side, e.slot, `-${e.n}`, e.counter ? RC.XP : e.eff > 1 ? SLOT.GOLD : SLOT.WHITE, true);
        fx('ring', { x, y, dur: 0.3, c: col, r: 18 + Math.min(20, e.n / 2) });
        if (st.lastStyle === 'melee' || e.counter) fx('slash', { x, y, dur: 0.25, c: e.counter ? SLOT.GOLD : SLOT.WHITE, dir: e.side === 1 ? 1 : -1 });
        burstAt(e.side, e.slot, col, 10 + Math.min(16, e.n / 2));
        if (e.n > t.maxHp * 0.28) { st.quake = Math.max(st.quake, 0.3); }
        if (e.eff > 1) { say('SUPER EFFECTIVE!', RC.HP, 0.8); sound.fx('good', { combo: 4 }); }
        else if (e.eff < 1) { say('NOT VERY EFFECTIVE...', SLOT.GRAY, 0.8); }
        sound.fx(e.n > t.maxHp * 0.28 ? 'slam' : 'hurt');
        return e.eff !== 1 ? 0.5 : 0.32;
      }
      case 'ko': {
        const d = disp(e.side, e.slot);
        d.ko = 0.001;
        st.quake = Math.max(st.quake, 0.25);
        say(`${nameOf(e.side, e.slot)} IS KNOCKED OUT!`, SLOT.BAD, 1.1);
        sound.fx('crumble');
        return 0.9;
      }
      case 'heal': { const d = disp(e.side, e.slot); d.hp = e.hp; pop(e.side, e.slot, `+${e.n}`, RC.HEAL, true); const [x, y] = center(e.side, e.slot); fx('rise', { x, y, dur: 0.7, c: RC.HEAL, glyph: '+' }); sound.fx('heal'); return 0.4; }
      case 'shield': { const [x, y] = center(e.side, e.slot); fx('bubble', { x, y, dur: 0.5, c: RC.SHIELD }); pop(e.side, e.slot, 'SHIELD', RC.SHIELD); sound.fx('block'); return 0.3; }
      case 'shieldHit': { const [x, y] = center(e.side, e.slot); fx('ring', { x, y, dur: 0.25, c: RC.SHIELD, r: 24 }); pop(e.side, e.slot, `BLOCK ${e.n}`, RC.SHIELD); return 0.15; }
      case 'guard': { const [x, y] = center(e.side, e.slot); fx('bubble', { x, y, dur: 0.35, c: SLOT.WHITE }); pop(e.side, e.slot, 'GUARD', RC.SHIELD); return 0.25; }
      case 'riposte': { const [x, y] = center(e.side, e.slot); fx('glint', { x, y: y - 10, dur: 0.4 }); pop(e.side, e.slot, 'EN GARDE', SLOT.GOLD); sound.fx('parry'); return 0.3; }
      case 'parry': { const [x, y] = center(e.side, e.slot); fx('glint', { x, y, dur: 0.35 }); fx('slash', { x, y, dur: 0.25, c: SLOT.GOLD, dir: e.side === 0 ? 1 : -1 }); pop(e.side, e.slot, 'PARRY!', SLOT.GOLD); sound.fx('parry'); return 0.35; }
      case 'taunt': { const [x, y] = center(e.side, e.slot); fx('ring', { x, y, dur: 0.5, c: SLOT.BAD, r: 30 }); pop(e.side, e.slot, 'OVER HERE!', SLOT.BAD); sound.fx('horn'); return 0.35; }
      case 'buff': { const [x, y] = center(e.side, e.slot); fx('rise', { x, y, dur: 0.6, c: RC.HP, glyph: '^' }); pop(e.side, e.slot, `${e.stat.toUpperCase()} UP`, RC.HP); return 0.22; }
      case 'debuff': { const [x, y] = center(e.side, e.slot); fx('rise', { x, y, dur: 0.6, c: SLOT.BAD, glyph: 'v', fall: true }); pop(e.side, e.slot, `${e.stat.toUpperCase()} DOWN`, SLOT.BAD); return 0.22; }
      case 'status': { const c = { burn: RC.FIRE, poison: RC.POISON, freeze: RC.ICE, stun: SLOT.GOLD }[e.status]; pop(e.side, e.slot, { burn: 'BURNED', poison: 'POISONED', freeze: 'FROZEN', stun: 'STUNNED' }[e.status], c); burstAt(e.side, e.slot, c, 12); if (e.status === 'stun') { const [x, y] = center(e.side, e.slot); fx('stars', { x, y: y - 26, dur: 0.8 }); } sound.fx(e.status === 'freeze' ? 'frost' : e.status === 'poison' ? 'fog' : 'burn'); return 0.35; }
      case 'cleanse': { const [x, y] = center(e.side, e.slot); fx('rise', { x, y, dur: 0.5, c: RC.SHIELD, glyph: '*' }); pop(e.side, e.slot, 'CLEAN!', RC.SHIELD); return 0.25; }
      case 'frozen': { const [x, y] = center(e.side, e.slot); fx('ring', { x, y, dur: 0.4, c: RC.ICE, r: 22 }); pop(e.side, e.slot, 'FROZEN SOLID', RC.ICE); return 0.45; }
      case 'stunned': { const [x, y] = center(e.side, e.slot); fx('stars', { x, y: y - 26, dur: 0.7 }); pop(e.side, e.slot, 'SEES STARS', SLOT.GOLD); return 0.45; }
      case 'rest': pop(e.side, e.slot, 'CATCHING ITS BREATH', SLOT.GRAY); return 0.45;
      case 'bounce': say('IT BOUNCES!', SLOT.GOLD); return 0.3;
      case 'burnTick': burstAt(e.side, e.slot, RC.FIRE, 8); return 0.12;
      case 'poisonTick': burstAt(e.side, e.slot, RC.POISON, 8); return 0.12;
      case 'end': return 0.7;
      default: return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function onKey(e) {
    if (!st || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!card.hidden) return;
    e.preventDefault(); e.stopPropagation();
    if (st.phase !== 'command') { if (e.code === 'Escape') pause(); return; }
    const u = current();
    if (!u) return;
    if (st.picking) {
      const n = st.picking.targets.length;
      if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) { st.picking.k = (st.picking.k + n - 1) % n; sound.fx('move'); }
      else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(e.code)) { st.picking.k = (st.picking.k + 1) % n; sound.fx('move'); }
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') commit(u, st.picking.move, st.picking.targets[st.picking.k]);
      else if (e.code === 'Escape' || e.code === 'Backspace') back();
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { st.sel = st.sel % 2 ? st.sel - 1 : st.sel; sound.fx('move'); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { st.sel = st.sel % 2 ? st.sel : st.sel + 1; sound.fx('move'); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { st.sel = st.sel >= 2 ? st.sel - 2 : st.sel; sound.fx('move'); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { st.sel = st.sel < 2 ? st.sel + 2 : st.sel; sound.fx('move'); }
    else if (/^Digit[1-4]$/.test(e.code)) chooseMove(Number(e.code.slice(5)) - 1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') chooseMove(st.sel);
    else if (e.code === 'Escape') { if (st.cmdIdx > 0) back(); else pause(); }
    else if (e.code === 'Backspace') back();
  }
  function toScreen(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
  function hit(x, y) {
    for (let k = 0; k < 4; k++) { const b = MOVE_BTN(k); if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return { move: k }; }
    for (const side of [0, 1]) for (let slot = 0; slot < 3; slot++) { const [cx, bottom] = posOf(side, slot); if (Math.abs(x - cx) < 22 && y > bottom - 46 && y < bottom + 2) return { unit: [side, slot] }; }
    return null;
  }
  function onPointer(e) {
    if (!st || !card.hidden || st.phase !== 'command') return;
    const [x, y] = toScreen(e), h = hit(x, y), u = current();
    if (!h || !u) return;
    if (h.move !== undefined) { st.sel = h.move; st.picking = null; chooseMove(h.move); return; }
    if (h.unit && st.picking) {
      const t = st.picking.targets.find(q => q.side === h.unit[0] && q.slot === h.unit[1]);
      if (t) commit(u, st.picking.move, t);
    }
  }
  function onMove(e) { if (!st) return; const [x, y] = toScreen(e); st.hover = hit(x, y); if (st.hover?.unit && st.picking) { const i = st.picking.targets.findIndex(q => q.side === st.hover.unit[0] && q.slot === st.hover.unit[1]); if (i >= 0) st.picking.k = i; } if (st.hover?.move !== undefined && !st.picking) st.sel = st.hover.move; }

  function pause() {
    if (st.phase === 'over') return;
    const was = st.phase;
    st.phase = 'paused';
    showCard(`<p class="boss-kicker">The Ring · ${st.title}</p><h2>Paused</h2><ul class="boss-rules">${RING_RULES_HTML}</ul>`,
      [['Resume', () => { hideCard(); st.phase = was; canvas.focus?.(); }, true], ['Give up', () => close({ won: false, conceded: true, battle: st.b })]]);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function drawArena() {
    // sky and the stands
    rect(screen, 0, 0, W, 40, RC.SKY);
    for (let x = 0; x < W; x += 40) ellipse(screen, x + 20, 36, 26, 8, RC.SKY_D);
    rect(screen, 0, 36, W, 38, RC.CROWD_D);
    for (let row = 0; row < 3; row++) for (let x = (row % 2) * 5; x < W; x += 10) {
      const bob = Math.sin(st.clock * 6 + x * 0.3 + row) > 0.6 ? -1 : 0;
      ellipse(screen, x + 4, 44 + row * 10 + bob, 3, 3, row % 2 ? RC.CROWD : SLOT.DARK);
      rect(screen, x + 1, 47 + row * 10 + bob, 6, 4, row % 2 ? RC.CROWD : SLOT.DARK);
    }
    // banners
    for (let x = 30; x < W; x += 85) { rect(screen, x, 22, 14, 16, (x / 85) % 2 < 1 ? RC.BANNER : RC.BANNER2); poly(screen, [[x, 38], [x + 7, 34], [x + 14, 38]], RC.CROWD_D); rect(screen, x - 1, 20, 16, 2, RC.FENCE_D); }
    // the fence and the sand
    rect(screen, 0, 72, W, 8, RC.FENCE); hline(screen, 0, W - 1, 72, RC.FENCE_D); hline(screen, 0, W - 1, 79, RC.FENCE_D);
    for (let x = 4; x < W; x += 24) rect(screen, x, 70, 3, 12, RC.FENCE_D);
    rect(screen, 0, 80, W, PANEL_Y - 80, RC.SAND);
    for (let y = 84; y < PANEL_Y; y += 6) for (let x = (y * 7) % 13; x < W; x += 17) pset(screen, x, y, RC.SAND_D);
    ellipse(screen, W / 2, 136, 70, 22, RC.SAND_D); ellipse(screen, W / 2, 136, 66, 19, RC.SAND);
  }

  function drawUnit(side, slot) {
    const u = st.b.units[side][slot], d = disp(side, slot);
    if (!u) return;
    const [cx0, bottom] = posOf(side, slot);
    if (d.ko !== null && d.ko > 1) return;
    const dir = side === 0 ? -1 : 1;                         // you face left, they face right
    let ox = 0, oy = 0;
    if (d.wind > 0) ox -= dir * Math.sin((1 - d.wind / 0.3) * Math.PI) * 4;           // wind-up: lean back
    if (d.dash) { const k = Math.min(1, d.dash.t / d.dash.dur), a = Math.sin(k * Math.PI); ox += d.dash.tx * a * (k < 0.5 ? 1 : 1); oy += d.dash.ty * a - Math.sin(k * Math.PI) * 10; }
    if (d.knock > 0) ox -= dir * Math.sin((1 - d.knock / 0.3) * Math.PI) * 9;        // knocked back
    if (d.dodge > 0) oy -= Math.sin((1 - d.dodge / 0.35) * Math.PI) * 10;            // hops out of the way
    const cx = cx0 + ox, by = bottom + oy;
    const pose = d.ko !== null ? 'hurt' : d.dash || d.wind > 0 ? 'attack' : d.flash > 0 ? 'hurt' : st.b.result === side ? 'taunt' : 'idle';
    // chosen as a target?
    const aimed = st.phase === 'command' && st.picking && st.picking.targets[st.picking.k] === u;
    if (aimed) { const c = Math.floor(st.clock * 6) % 2 ? SLOT.GOLD : SLOT.WHITE; ellipse(screen, cx0, bottom - 1, 20, 5, c); poly(screen, [[cx0 - 4, bottom - 56], [cx0 + 4, bottom - 56], [cx0, bottom - 51]], c); }
    const acting = st.phase === 'command' && current() === u && !st.picking;
    if (acting) { ellipse(screen, cx0, bottom - 1, 19, 4, SLOT.GOLD); }
    if (d.ko !== null) {
      // knocked out: it topples over, bounces, and a puff of dust takes it away
      const k = Math.min(1, d.ko);
      const tip = Math.min(1, k * 2.2), bounce = k > 0.45 && k < 0.7 ? Math.sin((k - 0.45) / 0.25 * Math.PI) * 5 : 0;
      drawMonster(screen, u.mon, ramp(side, slot), cx, bottom - bounce + tip * 6, { pose, clock: 0, flip: side === 1, shadow: k < 0.6, angle: -dir * tip * 1.45 });
      if (k > 0.6) { stipple(screen, cx - 30, bottom - 34, 60, 40, RC.SAND_D, (k - 0.6) * 2.5); for (let i = 0; i < 5; i++) circle(screen, cx - 16 + i * 8, bottom - 8 - ((i * 7) % 10) - (k - 0.6) * 30, 4 + (i % 2), RC.CLOUD); }
      if (k > 0.9) stipple(screen, cx - 32, bottom - 50, 64, 56, RC.SAND, (k - 0.9) * 10);
      return;
    }
    if (st.act && st.phase === 'playback' && st.act.side === side && st.act.slot === slot) ellipse(screen, cx0, bottom - 1, 18, 4, side === 0 ? SLOT.GOLD : SLOT.WHITE);
    drawMonster(screen, u.mon, ramp(side, slot), cx, by, { pose, clock: st.clock, flip: side === 1, flash: d.flash > 0 && Math.floor(st.clock * 30) % 2 === 0 });
    if (u.st.shield > 0) { ring(screen, cx, by - 22, 24, RC.SHIELD); pset(screen, cx - 14, by - 36, SLOT.WHITE); }
    if (u.st.guard) ring(screen, cx, by - 22, 22, SLOT.WHITE);
    if (u.st.freeze > 0) stipple(screen, cx - 20, by - 44, 40, 44, RC.ICE, 0.35);
    if (u.st.burn > 0 && Math.floor(st.clock * 8 + slot) % 3 === 0) rect(screen, cx - 10 + ((st.clock * 37) % 20), by - 10 - ((st.clock * 60) % 30), 2, 3, RC.FIRE);
    if (u.st.poison > 0 && Math.floor(st.clock * 6 + slot) % 3 === 0) circle(screen, cx - 8 + ((st.clock * 29) % 16), by - 12 - ((st.clock * 40) % 26), 1.5, RC.POISON);
    if (u.st.taunt > 0 && Math.floor(st.clock * 3) % 2) text(screen, '!', cx + 16, by - 48, SLOT.BAD, { scale: 2 });
    // the nameplate
    const pw = 58, px = Math.round(cx0 - pw / 2), py = bottom - MON_SIZE - 13;
    rect(screen, px - 1, py - 1, pw + 2, 13, SLOT.INK);
    rect(screen, px, py, pw, 11, RC.PANEL);
    rect(screen, px, py, 2, 11, TYPE_COLOR[u.type]);
    let name = u.mon.name.split(' ')[0].toUpperCase();
    while (textWidth(name) > 36 && name.length > 3) name = name.slice(0, -1);
    text(screen, name, px + 4, py + 1, SLOT.WHITE);
    text(screen, `L${u.level}`, px + pw - 2, py + 1, SLOT.GRAY, { align: 'right' });
    const share = Math.max(0, d.shownHp / u.maxHp);
    rect(screen, px + 4, py + 8, pw - 8, 2, RC.HP_BG);
    rect(screen, px + 4, py + 8, Math.round((pw - 8) * share), 2, share > 0.3 ? RC.HP : RC.HP_LOW);
    // statuses
    const icons = [];
    if (u.st.burn) icons.push('burn'); if (u.st.poison) icons.push('poison'); if (u.st.freeze) icons.push('freeze'); if (u.st.stun) icons.push('stun');
    if (u.st.shield > 0) icons.push('shield'); if (u.st.taunt > 0) icons.push('taunt');
    const ups = Object.values(u.st.mods).filter(m => m.t > 0);
    if (ups.some(m => m.k > 1)) icons.push('up'); if (ups.some(m => m.k < 1)) icons.push('down');
    icons.forEach((ic, i) => statusIcon(screen, px + i * 7, py - 7, ic));
  }

  function drawShot(f, x, y, k) {
    const c = f.c;
    switch (f.shot) {
      case 'fireball': case 'flame': circle(screen, x, y, 5, RC.FIRE); circle(screen, x, y, 3, SLOT.GOLD); pset(screen, x, y, SLOT.WHITE); for (let i = 1; i < 6; i++) rect(screen, x - (f.x1 > f.x0 ? i * 3 : -i * 3), y + Math.sin(i + st.clock * 20) * 2, 2, 2, i % 2 ? RC.FIRE : SLOT.GOLD); break;
      case 'tide': circle(screen, x, y, 3, RC.WATER); pset(screen, x - 1, y - 1, SLOT.WHITE); for (let i = 1; i < 4; i++) pset(screen, x - Math.sign(f.x1 - f.x0) * i * 4, y + i, RC.WATER); break;
      case 'leaf': { const a = st.clock * 20; poly(screen, [[x + Math.cos(a) * 5, y + Math.sin(a) * 5], [x + Math.cos(a + 1.6) * 2, y + Math.sin(a + 1.6) * 2], [x - Math.cos(a) * 5, y - Math.sin(a) * 5], [x - Math.cos(a + 1.6) * 2, y - Math.sin(a + 1.6) * 2]], c); break; }
      case 'stone': case 'cannonball': { const r = f.shot === 'cannonball' ? 6 : 4; circle(screen, x, y, r, SLOT.INK); circle(screen, x, y, r - 1, f.shot === 'cannonball' ? SLOT.DARK : RC.FENCE_D); pset(screen, x - 1, y - 2, SLOT.GRAY); if (f.shot === 'cannonball') for (let i = 1; i < 4; i++) circle(screen, x - Math.sign(f.x1 - f.x0) * i * 5, y + i * 2, 2, RC.CLOUD); break; }
      case 'spore': for (let i = 0; i < 4; i++) circle(screen, x + Math.cos(i * 1.6 + st.clock * 6) * 4, y + Math.sin(i * 1.6 + st.clock * 6) * 3, 2, RC.POISON); break;
      case 'frost': case 'shard': poly(screen, [[x - 6, y], [x, y - 3], [x + 6, y], [x, y + 3]], f.shot === 'shard' ? c : RC.ICE); pset(screen, x, y, SLOT.WHITE); break;
      case 'gem': poly(screen, [[x, y - 5], [x + 4, y], [x, y + 5], [x - 4, y]], c); pset(screen, x - 1, y - 2, SLOT.WHITE); if (Math.floor(st.clock * 20) % 2) pset(screen, x + 6, y - 4, SLOT.WHITE); break;
      case 'star': case 'note': { if (f.shot === 'note') { circle(screen, x, y + 2, 2.5, c); rect(screen, x + 2, y - 5, 1, 7, c); rect(screen, x + 2, y - 5, 3, 1, c); } else { poly(screen, [[x, y - 5], [x + 1.5, y - 1.5], [x + 5, y - 1], [x + 2, y + 1.5], [x + 3, y + 5], [x, y + 3], [x - 3, y + 5], [x - 2, y + 1.5], [x - 5, y - 1], [x - 1.5, y - 1.5]], SLOT.GOLD); } for (let i = 1; i < 4; i++) pset(screen, x - Math.sign(f.x1 - f.x0) * i * 4, y + Math.sin(i * 2 + st.clock * 10) * 3, SLOT.WHITE); break; }
      case 'bullet': rect(screen, x - 3, y - 1, 6, 2, SLOT.GOLD); line(screen, x - Math.sign(f.x1 - f.x0) * 14, y, x, y, SLOT.WHITE); break;
      case 'laser': line(screen, x - Math.sign(f.x1 - f.x0) * 16, y, x, y, RC.HP); line(screen, x - Math.sign(f.x1 - f.x0) * 16, y + 1, x, y + 1, SLOT.WHITE); break;
      case 'spike': poly(screen, [[x - 4, y + 3], [x + 4, y + 3], [x, y - 5]], SLOT.GRAY); pset(screen, x, y - 4, SLOT.WHITE); break;
      case 'ball': circle(screen, x, y, 3, RC.HP); pset(screen, x - 1, y - 1, SLOT.WHITE); ellipse(screen, x, (f.y0 + f.y1) / 2 + 18, 3, 1, SLOT.SHADOW); break;
      case 'hook': line(screen, f.x0, f.y0, x, y, SLOT.GRAY); ring(screen, x, y, 2, SLOT.WHITE); break;
      default: circle(screen, x, y, 3, c); pset(screen, x - 1, y - 1, SLOT.WHITE);
    }
  }

  function drawEffects(dt) {
    for (const f of st.fx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      switch (f.kind) {
        case 'shot': { const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * f.arc; if (k < 1) drawShot(f, x, y, k); break; }
        case 'ring': ring(screen, f.x, f.y, 4 + k * f.r, k < 0.5 ? SLOT.WHITE : f.c); if (k < 0.6) ring(screen, f.x, f.y, 2 + k * f.r * 0.6, f.c); break;
        case 'slash': for (let i = -1; i <= 1; i++) { const off = i * 7, len = 12 * Math.sin(k * Math.PI); line(screen, f.x + off - len * f.dir, f.y - len + off * 0.3, f.x + off + len * f.dir, f.y + len + off * 0.3, k < 0.5 ? SLOT.WHITE : f.c); } break;
        case 'bubble': ring(screen, f.x, f.y, 8 + k * 18, f.c); if (k > 0.3) ring(screen, f.x, f.y, 6 + k * 14, SLOT.WHITE); pset(screen, f.x - 8, f.y - 10, SLOT.WHITE); break;
        case 'glint': { const r = Math.sin(k * Math.PI) * 8; line(screen, f.x - r, f.y, f.x + r, f.y, SLOT.WHITE); line(screen, f.x, f.y - r, f.x, f.y + r, SLOT.WHITE); pset(screen, f.x, f.y, SLOT.GOLD); break; }
        case 'stars': for (let i = 0; i < 3; i++) { const a = st.clock * 5 + i * 2.1; text(screen, '*', f.x + Math.cos(a) * 12, f.y + Math.sin(a) * 4, SLOT.GOLD); } break;
        case 'rise': for (let i = 0; i < 5; i++) { const yy = f.fall ? f.y - 20 + k * 26 + i * 3 : f.y + 10 - k * 30 - (i % 3) * 6; text(screen, f.glyph, f.x - 16 + i * 8, yy, f.c, { shadow: SLOT.INK }); } break;
        case 'wave': {
          // a front sweeping across the other side's column
          const xs = [0, 1, 2].map(sl => posOf(f.side, sl)[0]);
          const lo = Math.min(...xs) - 30, hi = Math.max(...xs) + 30, toRight = xs[0] > f.from;
          const front = toRight ? lo + (hi - lo) * k : hi - (hi - lo) * k;
          const ys = [0, 1, 2].map(sl => posOf(f.side, sl)[1]);
          for (let i = 0; i < 14; i++) {
            const yy = Math.min(...ys) - 50 + i * ((Math.max(...ys) - Math.min(...ys) + 50) / 13), xx = front + Math.sin(i * 1.7 + st.clock * 12) * 6;
            if (f.wave === 'snow') { circle(screen, xx, yy, 2, SLOT.WHITE); pset(screen, xx - (toRight ? 6 : -6), yy + 2, RC.ICE); }
            else if (f.wave === 'spore') circle(screen, xx, yy, 3 + (i % 2), RC.POISON);
            else if (f.wave === 'wind') line(screen, xx - (toRight ? 12 : -12), yy, xx, yy, SLOT.WHITE);
            else if (i % 3 === 0) ring(screen, f.from, yy * 0 + (ys[1] - 22), Math.abs(front - f.from), f.c);
          }
          break;
        }
        default: break;
      }
    }
    st.fx = st.fx.filter(f => f.t < f.dur);
    if (st.whiteout > 0) { stipple(screen, 0, 16, W, PANEL_Y - 16, SLOT.WHITE, st.whiteout * 2); }
    for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.t -= dt; rect(screen, p.x, p.y, p.t > 0.3 ? 2 : 1, p.t > 0.3 ? 2 : 1, p.c); }
    st.parts = st.parts.filter(p => p.t > 0);
    for (const q of st.pops) { q.t -= dt; q.y -= 14 * dt; text(screen, q.str, q.x, q.y, q.c, { align: 'center', shadow: SLOT.INK, scale: q.big ? 2 : 1 }); }
    st.pops = st.pops.filter(q => q.t > 0);
    if (st.banner) {
      st.banner.t -= dt;
      const w = textWidth(st.banner.str) + 10;
      rect(screen, W / 2 - w / 2, 82, w, 11, SLOT.INK);
      text(screen, st.banner.str, W / 2, 85, st.banner.c, { align: 'center' });
      if (st.banner.t <= 0) st.banner = null;
    }
  }

  function drawPanel() {
    rect(screen, 0, PANEL_Y, W, H - PANEL_Y, RC.PANEL);
    hline(screen, 0, W - 1, PANEL_Y, SLOT.INK);
    const u = st.phase === 'command' ? current() : null;
    if (!u) {
      const msg = st.phase === 'playback' ? 'THE ROUND PLAYS OUT...' : st.phase === 'over' ? '' : '';
      text(screen, msg, W / 2, PANEL_Y + 22, SLOT.GRAY, { align: 'center' });
      return;
    }
    // who's choosing
    const nm = wrap(u.mon.name.toUpperCase(), 84).slice(0, 2);
    nm.forEach((ln, i) => text(screen, ln, 4, PANEL_Y + 4 + i * 7, SLOT.GOLD));
    typeBadge(screen, 4, PANEL_Y + 6 + nm.length * 7, u.type);
    text(screen, `HP ${u.hp}/${u.maxHp}`, 4, PANEL_Y + 16 + nm.length * 7, SLOT.WHITE);
    text(screen, `MONSTER ${st.cmdIdx + 1} OF ${actors().length}`, 4, PANEL_Y + 43, SLOT.GRAY);
    // its moves
    const moves = movesNow(u);
    moves.forEach(({ move, ok }, k) => {
      const b = MOVE_BTN(k), sel = k === st.sel && !st.picking;
      rect(screen, b.x - 1, b.y - 1, b.w + 2, b.h + 2, sel ? SLOT.GOLD : SLOT.INK);
      rect(screen, b.x, b.y, b.w, b.h, ok ? (sel ? RC.PANEL_L : SLOT.DARK) : SLOT.BLACK);
      if (move.power > 0 && move.id !== 'guard') rect(screen, b.x, b.y, 3, b.h, TYPE_COLOR[u.type]);
      text(screen, `${k + 1} ${move.name.toUpperCase()}`, b.x + 6, b.y + 3, ok ? SLOT.WHITE : SLOT.GRAY);
      const tag = !ok ? `READY IN ${u.cd[move.id]}` : move.target === 'allFoes' ? 'ALL FOES' : move.target === 'randomFoes' ? `${move.hits} HITS` : move.target === 'ally' ? 'AN ALLY' : move.target === 'allAllies' ? 'ALL ALLIES' : move.target === 'self' ? 'SELF' : 'ONE FOE';
      text(screen, tag, b.x + 6, b.y + 11, ok ? SLOT.GRAY : SLOT.BAD);
    });
    // what the chosen move does (and how well it would do against the target)
    const m = st.picking ? st.picking.move : u.moves[st.sel];
    const x0 = 298;
    const words = m.about.toUpperCase().replace(/[—–]/g, '-').replace(/[’‘]/g, "'");
    wrap(words, 98).slice(0, 4).forEach((ln, i) => text(screen, ln, x0, PANEL_Y + 4 + i * 7, SLOT.WHITE));
    if (st.picking) {
      const t = st.picking.targets[st.picking.k];
      if (t && m.target === 'foe') {
        const eff = effectiveness(u.type, t.type);
        const est = Math.round(damageOf(u, t, m.power || 1));
        text(screen, `~${est} DMG${eff > 1 ? ' SUPER!' : eff < 1 ? ' WEAK' : ''}`, x0, PANEL_Y + 34, eff > 1 ? RC.HP : eff < 1 ? SLOT.BAD : SLOT.GOLD);
      }
      text(screen, 'PICK A TARGET  ESC BACK', x0, PANEL_Y + 44, SLOT.GRAY);
    } else text(screen, 'ENTER CHOOSE  ESC BACK', x0, PANEL_Y + 44, SLOT.GRAY);
  }

  function drawHeader() {
    // the tamers at the top corners
    const foeSpr = st.foeSheet.get('front', st.b.result === 1 ? 'cheer' : st.b.result === 0 ? 'down' : 'idle', 0, Math.floor(st.clock * 6) % 4);
    blit(screen, foeSpr, 4, 2, { map: NPC_MAP });
    const mySpr = st.heroSheet.get('front', st.b.result === 0 ? 'cheer' : st.b.result === 1 ? 'down' : 'idle', 0, Math.floor(st.clock * 6) % 4);
    blit(screen, mySpr, W - 32, 2);
    rect(screen, 34, 4, textWidth(st.foe.name.toUpperCase()) + 6, 9, SLOT.INK); text(screen, st.foe.name.toUpperCase(), 37, 6, SLOT.WHITE);
    const me = st.me.name.toUpperCase();
    rect(screen, W - 38 - textWidth(me), 4, textWidth(me) + 6, 9, SLOT.INK); text(screen, me, W - 35, 6, SLOT.GOLD, { align: 'right' });
    const r = `ROUND ${Math.min(st.b.round, 99)}`;
    rect(screen, W / 2 - 22, 2, 44, 10, SLOT.INK); text(screen, r, W / 2, 4, SLOT.GOLD, { align: 'center' });
  }

  function draw(dt) {
    drawArena();
    // back row first (slot 0 and 2 are further apart; draw by feet y)
    const order = [0, 1].flatMap(side => [0, 1, 2].map(slot => [side, slot])).sort((a, c) => posOf(...a)[1] - posOf(...c)[1]);
    for (const [side, slot] of order) drawUnit(side, slot);
    drawEffects(dt);
    drawHeader();
    drawPanel();
  }

  function update(dt) {
    st.clock += dt;
    st.quake = Math.max(0, (st.quake || 0) - dt); st.whiteout = Math.max(0, (st.whiteout || 0) - dt);
    for (const side of [0, 1]) for (const d of st.disp[side]) {
      d.wind = Math.max(0, (d.wind || 0) - dt); d.flash = Math.max(0, d.flash - dt); d.knock = Math.max(0, (d.knock || 0) - dt); d.dodge = Math.max(0, (d.dodge || 0) - dt);
      if (d.dash) { d.dash.t += dt; if (d.dash.t >= d.dash.dur) d.dash = null; }
      if (d.ko !== null) d.ko += dt * 1.1;
      d.shownHp += (d.hp - d.shownHp) * Math.min(1, dt * 8);
    }
    if (st.phase !== 'playback') return;
    st.wait -= dt;
    while (st.wait <= 0 && st.queue.length) st.wait += play(st.queue.shift());
    if (st.wait <= 0 && !st.queue.length) {
      if (st.b.result !== null) finish();
      else beginCommands();
    }
  }
  function frameLoop(now) {
    if (!st) return;
    st.raf = requestAnimationFrame(frameLoop);
    if (st.lastDraw && now - st.lastDraw < MIN_FRAME_MS - 1) return;
    const dt = st.lastDraw ? Math.min(0.05, (now - st.lastDraw) / 1000) : 0;
    st.lastDraw = now;
    update(dt);
    draw(dt);
    present(screen, st.palette, target);
  }

  function finish() {
    st.phase = 'over';
    const res = st.b.result, won = res === 0;
    sound.jingle(won ? 'victory' : 'defeat');
    setTimeout(() => {
      if (!st) return;
      showCard(`<p class="boss-kicker">The Ring · ${st.title}</p><h2>${won ? 'You win!' : res === 'draw' ? 'A draw!' : `${st.foe.name} wins`}</h2>
        <p>${won ? `${st.foe.name}’s monsters limp off to the side, grinning. "Good fight!"` : 'Tip: check the types — a Tide monster against Flame hits half again as hard. Monsters grow with every fight, and later stages of a run bring stronger ones home.'}</p>`,
      [[won ? 'Collect ▸' : 'Back', () => close({ won, draw: res === 'draw', battle: st.b }), true], ...(won ? [] : [['Rematch', () => restart()]])]);
    }, 500);
  }

  function fresh(seed) {
    const o = st.options;
    st.b = createBattle({ squads: [o.mine, o.foes], seed });
    st.rng = mulberry32(hashSeed('ring-ai', seed));
    st.disp = st.b.units.map(side => side.map(u => ({ hp: u.hp, shownHp: u.hp, wind: 0, flash: 0, knock: 0, dodge: 0, dash: null, ko: null })));
    Object.assign(st, { queue: [], wait: 0, pops: [], parts: [], fx: [], banner: null, commands: [], cmdIdx: 0, sel: 0, picking: null, act: null, quake: 0, whiteout: 0 });
  }
  function begin() { hideCard(); sound.fx('go'); beginCommands(); canvas.focus?.(); }
  function restart() { st.tries++; fresh(st.options.seed + st.tries * 77); begin(); }

  function close(outcome) {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('keydown', onKey, true);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('pointermove', onMove);
    sound.restore(st.music);
    const resolve = st.resolve;
    st = null;
    root.hidden = true;
    hideCard();
    document.body.classList.remove('in-cards');
    resolve(outcome);
  }

  return {
    get active() { return !!st; },
    get battle() { return st?.b ?? null; },
    /** Tests and demos: the computer picks your commands too. */
    autoPlay(on = true) { if (st) { st.auto = on; if (st.phase === 'intro') begin(); else if (st.phase === 'command') autoCommands(); } },
    start({ mine, foes, me, foe, seed = 1, title = 'The Ring', intro = '' }) {
      return new Promise(resolve => {
        st = { options: { mine, foes, seed }, me, foe, title, resolve, tries: 0, phase: 'intro', clock: 0, lastDraw: 0, raf: 0, auto: false,
          heroSheet: createHeroSheet(me.design), foeSheet: createHeroSheet(foe.design || me.design), music: sound.chip.playing };
        fresh(seed);
        st.palette = packPalette(ringPalette({ hero: heroBaseColors(me.design), npc: foe.design ? heroBaseColors(foe.design) : null, monsters: [...mine, ...foes] }));
        root.hidden = false;
        document.body.classList.add('in-cards');
        window.addEventListener('keydown', onKey, true);
        canvas.addEventListener('pointerdown', onPointer);
        canvas.addEventListener('pointermove', onMove);
        sound.place('ring', seed);
        const list = ms => ms.map(m => `${m.name} <small>(${TYPES[m.type].name} · Lv ${m.level})</small>`).join(', ');
        showCard(`<p class="boss-kicker">The Ring · ${title}</p><h2>${foe.name}</h2><p class="boss-title">${foe.title || 'wants a monster fight'}</p>
          ${intro ? `<p>${intro}</p>` : ''}
          <p class="card-factions"><strong>Theirs:</strong> ${list(foes)}<br><strong>Yours:</strong> ${list(mine)}</p>
          <ul class="boss-rules">${RING_RULES_HTML}</ul>`,
        [['Fight! (Enter)', () => begin(), true], ['Not now', () => close({ won: false, skipped: true })]]);
        st.raf = requestAnimationFrame(frameLoop);
      });
    },
  };
}

function wrap(str, width) {
  const words = String(str).split(' '), lines = [];
  let ln = '';
  for (const w of words) { if (textWidth(ln ? `${ln} ${w}` : w) > width && ln) { lines.push(ln); ln = w; } else ln = ln ? `${ln} ${w}` : w; }
  if (ln) lines.push(ln);
  return lines;
}
export { BODIES };
