/**
 * The Riftcards table (2D pixel art, 400×225): a match against a card battler or the Rift King.
 *
 *   const table = createCardScreen();
 *   const { won, draw, skipped } = await table.start({
 *     me:  { deck, faction, design, name },
 *     foe: { deck, faction, design, name, title, skill, hand },     // hand: 10 (the King: 12)
 *     seed, title });
 *
 * The screen:
 *   left    the two players: portrait, faction, gems (lives), cards in hand, total strength,
 *           PASSED; below, the PASS button and your deck
 *   middle  the board: their sky · back · front rows, then yours (front · back · sky), each
 *           with its score, weather (snow / fog / rain) and war horn
 *   bottom  your hand (sorted by row and strength)
 *   right   the card you're looking at, big, with its words
 *
 * Keys: ← → choose a card · Enter (or ↑) play it (agile cards: ↑ ↓ pick the row, Enter) ·
 * Space / P pass (twice to be sure) · Esc pause. Mouse: click a card, click again (or click
 * its row) to play; the PASS button.
 *
 * The rules (match.js) change the state at once and list what happened (events); the screen
 * turns events into motion: cards fly from the hand (theirs from the portrait, musters from
 * the deck, revivals from the discard pile), creatures hop as they land, strengths that
 * change pop +N / −N, burned creatures go up in flames, the weather falls on its rows, and at
 * the end of a round the table holds still under a banner before it's swept away.
 */
import { createSurface, rect, pset, blit, line, text, ring, frame, poly, textWidth, present, dither, stipple, hline } from '../engine/pixel.js';
import { SLOT, packPalette, heroBaseColors, NPC_MAP } from '../engine/palette.js';
import { createHeroSheet } from '../characters/heroSprite.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';
import { mulberry32, hashSeed } from '../levels/generator.js';
import { CARDS, ROWS, ROW_INFO, ABILITIES, FACTIONS, CLIMATE, cardText } from './catalog.js';
import { createMatch, playCard, pass, strengthOf, total, rowTotal, rowsFor, bestRow, MATCH_RULES } from './match.js';
import { chooseMove } from './ai.js';
import {
  drawHandCard, drawUnit, drawBigCard, drawCardBack, drawCritter, specialArt, rowIcon, abilityIcon, gemIcon, wrap, cardPalette, rampOf,
  HAND_W, HAND_H, UNIT_W, UNIT_H, BIG_W, BIG_H, CC, RAMP,
} from './drawCards.js';
import { sound } from '../audio/music.js';

export const W = 400, H = 225;
const BX0 = 84, BX1 = 330, HEAD_W = 24, UX0 = BX0 + HEAD_W + 3, UX1 = BX1 - 2;
const ROW_H = 24;
const ROW_Y = [{ front: 80, back: 104, sky: 128 }, { sky: 1, back: 25, front: 49 }];   // [me, them]
const DIVIDER_Y = 73;
const HAND_Y = 158, HAND_LIFT = 7;
const PASS_BTN = { x: 4, y: 158, w: 76, h: 15 };
const DECK_AT = [{ x: 8, y: 186 }, { x: 40, y: 30 }];      // where my cards come from (deck); theirs (the portrait)
const DISCARD_AT = { x: 56, y: 190 };
const PANEL_X = 334;
const MIN_FRAME_MS = 1000 / 60;

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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** A player's faction for showing (the Rift King plays the Starborn's rules, with 12 cards). */
const KING_INFO = { name: 'The Rift', zone: 'Beyond the rifts', perkText: `${FACTIONS.starlit.perkText} He starts with 12 cards.`, about: 'The Lord of the Rifts and his legendary heroes.' };
const factionInfo = f => (f === 'king' ? KING_INFO : FACTIONS[f] || FACTIONS.meadow);

/** The rules in a few lines (the intro card and the pause menu). */
export const RULES_HTML = `
  <li>Best of <strong>three rounds</strong>. Each turn: play <strong>one card</strong> — or <strong>pass</strong> and sit the round out.</li>
  <li>When both have passed, the bigger <strong>total strength</strong> wins the round; the loser loses a gem. Lose both gems and you lose.</li>
  <li>There are no new cards between rounds: what you spend is gone — win a round cheaply, or let one go to win the next two.</li>
  <li>Creatures go to their row (front · back · sky). Each round is played in one of the worlds: its faction gets +1 there, and some worlds bring weather (a row counts 1 each).</li>
  <li>Keys: <strong>← →</strong> choose · <strong>Enter</strong> play · <strong>Space</strong> pass · <strong>Esc</strong> pause. Or click.</li>`;

export function createCardScreen({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'card-screen', 'aria-label': 'Riftcards' });
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
  // Layout: where everything is (from the rules' state, or a frozen table)
  // ---------------------------------------------------------------------------
  const side = p => (p === 0 ? 0 : 1);          // 0: me (bottom), 1: them (top)
  function rowLayout(n) {
    const span = UX1 - UX0, step = n > 1 ? Math.min(UNIT_W + 2, (span - UNIT_W) / (n - 1)) : 0;
    const width = step * (n - 1) + UNIT_W;
    const x0 = UX0 + (span - width) / 2;
    return k => x0 + k * step;
  }
  /** The board to draw: live, or as it stood when the round ended. */
  function boardNow() {
    if (st.frozen) return st.frozen.board;
    return st.m.players.map((pl, p) => ({
      chilled: pl.chilled, warhorn: pl.warhorn,
      rows: Object.fromEntries(ROWS.map(r => [r, pl.rows[r].map(u => ({ ...u, str: strengthOf(st.m, p, r, u) }))])),
    }));
  }
  const rowScore = (board, p, r) => board[p].rows[r].reduce((a, u) => a + u.str, 0);
  const boardTotal = (board, p) => ROWS.reduce((a, r) => a + rowScore(board, p, r), 0);

  /** Your hand, sorted for showing (creatures by row and strength, then specials). */
  function handView() {
    const hand = st.m.players[0].hand;
    const order = { front: 0, back: 1, sky: 2 };
    const list = hand.map((id, i) => ({ id, i })).sort((a, b) => {
      const A = CARDS[a.id], B = CARDS[b.id];
      return (A.kind === 'special') - (B.kind === 'special') || (order[A.row] ?? 3) - (order[B.row] ?? 3) || (A.str ?? 0) - (B.str ?? 0) || a.id.localeCompare(b.id) || a.i - b.i;
    });
    const seen = {};
    for (const c of list) { seen[c.id] = (seen[c.id] || 0) + 1; c.key = `${c.id}#${seen[c.id]}`; }
    const span = BX1 - BX0 - HAND_W, step = list.length > 1 ? Math.min(HAND_W + 3, span / (list.length - 1)) : 0;
    const x0 = BX0 + (span - step * (list.length - 1)) / 2;
    list.forEach((c, k) => { c.x = x0 + k * step; });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Events → motion and sound
  // ---------------------------------------------------------------------------
  const say = (str, c = SLOT.GOLD, t = 1.4) => { st.flash = { str, c, t, max: t }; };
  const popAt = (x, y, str, c, t = 1) => st.pops.push({ x, y, str, c, t, max: t });
  function absorbEvents() {
    const events = st.m.events;
    st.m.events = [];
    let drew = 0;
    for (const e of events) {
      if (e.type === 'play') {
        sound.fx('play');
        if (e.p === 1) { st.foeCard = { id: e.id, t: 2.2 }; say(`${st.foe.name.toUpperCase()}: ${CARDS[e.id].name.toUpperCase()}`, SLOT.WHITE, 1.6); }
      } else if (e.type === 'place') {
        const from = e.src === 'discard' && e.by === 0 ? { x: DISCARD_AT.x, y: DISCARD_AT.y } : e.src === 'deck' && e.by === 0 ? DECK_AT[0] : e.by === 0 ? (st.playedFrom || DECK_AT[0]) : DECK_AT[1];
        st.spawns.set(e.uid, from);
      } else if (e.type === 'muster') {
        say(`SWARM! +${e.n}`, SLOT.GOLD); sound.fx('muster');
      } else if (e.type === 'revive') {
        say(`${CARDS[e.id].name.toUpperCase()} IS BACK!`, CC.GREEN); sound.fx('revive');
      } else if (e.type === 'spy') {
        say(e.p === 0 ? 'SNEAK! YOU DRAW 2' : 'THEIR SNEAK! THEY DRAW 2', CC.FROST); sound.fx('spy');
      } else if (e.type === 'weather') {
        const name = { frost: 'BLIZZARD', fog: 'SEA MIST', storm: 'DUST STORM' }[e.weather];
        say(name, CC.FROST); sound.fx(e.weather);
        st.weatherBurst.push({ row: e.row, t: 1 });
      } else if (e.type === 'clear') {
        say('SUNNY DAY', CC.SUN); sound.fx('heal'); st.sun = 1.2;
        st.weatherParts = [];
      } else if (e.type === 'horn') {
        say('BRASS BAND!', SLOT.GOLD); sound.fx('horn'); st.hornWave.push({ p: e.side, row: e.row, t: 1 });
      } else if (e.type === 'scorch') {
        if (e.n === 0) say('LAVA BURST... NOTHING TO BURN', CC.FIRE);
        else say(e.row ? 'BURN!' : 'LAVA BURST!', CC.FIRE);
        st.scorchFlash = 0.5;
      } else if (e.type === 'burn') {
        const d = st.disp.get(e.uid);
        if (d) st.ghosts.push({ id: e.id, x: d.x, y: d.y, t: 0.9, max: 0.9, kind: 'burn', uid: e.uid });
        st.disp.delete(e.uid);
        sound.fx('burn');
      } else if (e.type === 'pass') {
        say(e.p === 0 ? 'YOU PASS' : `${st.foe.name.toUpperCase()} PASSES`, SLOT.GRAY);
        sound.fx('pass');
      } else if (e.type === 'draw') {
        if (e.p === 0) drew++;
      } else if (e.type === 'roundEnd') {
        const mine = e.winner === 0, draw = e.winner === null;
        st.frozen = { board: e.board, t: 2.6, totals: e.totals };
        st.banner = { big: draw ? 'A DRAW!' : mine ? 'ROUND TO YOU!' : `ROUND TO ${st.foe.name.toUpperCase()}`, small: `${e.totals[0]} - ${e.totals[1]}`, c: draw ? SLOT.WHITE : mine ? SLOT.GOLD : SLOT.BAD, t: 2.6, max: 2.6 };
        for (const p of [0, 1]) if (e.winner !== p) st.gemCrack.push({ p, t: 1.2, gem: e.gems[p] });
        sound.fx(draw ? 'pass' : mine ? 'checkpoint' : 'crack');
        st.wait = Math.max(st.wait, 2.8);
      } else if (e.type === 'stays') {
        st.stays.push({ uid: e.uid, t: 3.6 });
      } else if (e.type === 'round') {
        const F = FACTIONS[e.world], where = F ? `${F.zone.toUpperCase()}: ${F.name.toUpperCase()} +1` : '';
        const small = `${e.first === 0 ? 'YOU GO FIRST' : `${st.foe.name.toUpperCase()} GOES FIRST`}${where ? ` - ${where}` : ''}`;
        if (e.round > 1) st.pendingBanner = { big: `ROUND ${e.round}`, small, c: SLOT.WHITE, t: 2, max: 2 };
        else st.banner = { big: 'ROUND 1', small, c: SLOT.WHITE, t: 2.2, max: 2.2 };
      } else if (e.type === 'climate') {
        st.weatherBurst.push({ row: e.row, t: 1 });
      } else if (e.type === 'matchEnd') {
        st.ending = 2.9;
      }
    }
    if (drew) sound.fx('draw');
  }

  // ---------------------------------------------------------------------------
  // Turns
  // ---------------------------------------------------------------------------
  const busy = () => st.wait > 0 || !!st.frozen || st.ending !== null;
  const myTurn = () => st && st.phase === 'playing' && st.m.result === null && st.m.active === 0 && !st.m.players[0].passed && !busy();

  function act(fn) {
    fn();
    absorbEvents();
    st.confirmPass = 0;
    const hv = handView();
    st.sel = clamp(st.sel, 0, Math.max(0, hv.length - 1));
    if (st.m.result === null && st.m.active === 1) st.foeAt = 0.9 + st.rng() * 0.6;     // they think a little
  }
  function foeMove() {
    if (st.m.result !== null || st.m.active !== 1) return;
    const move = chooseMove(st.m, { skill: st.foe.skill ?? 0.8, rng: st.rng });
    act(() => { if (move.pass) pass(st.m); else playCard(st.m, move.hand, move.row); });
  }
  function myAutoMove() {
    const move = chooseMove(st.m, { skill: 1, rng: st.rng });
    const hv = handView();
    const k = hv.findIndex(c => c.i === move.hand);
    if (!move.pass && k >= 0) st.playedFrom = { x: hv[k].x, y: HAND_Y };
    act(() => { if (move.pass) pass(st.m); else playCard(st.m, move.hand, move.row); });
  }

  /** Play the k-th card of the hand as shown (row: for agile cards). */
  function playShown(k, row = null) {
    if (!myTurn()) return;
    const hv = handView(), c = hv[k];
    if (!c) return;
    const rows = rowsFor(c.id);
    if (rows.length > 1 && row === null) { st.choose = { k, rows, r: rows.indexOf(bestRow(st.m, 0, c.id)) }; sound.fx('select'); return; }
    st.choose = null;
    st.playedFrom = { x: c.x, y: HAND_Y - HAND_LIFT };
    act(() => playCard(st.m, c.i, row));
  }
  function tryPass() {
    if (!myTurn()) return;
    const hand = st.m.players[0].hand.length;
    if (hand && st.confirmPass <= 0) { st.confirmPass = 2.5; say('PASS? PRESS AGAIN TO BE SURE', SLOT.WHITE, 2.5); sound.fx('select'); return; }
    st.choose = null;
    act(() => pass(st.m));
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function onKey(e) {
    if (!st) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!card.hidden) return;                                       // a card is up: its buttons take the keys
    e.preventDefault(); e.stopPropagation();
    if (e.repeat && !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) return;
    if (e.code === 'Escape') { if (st.choose) { st.choose = null; sound.fx('close'); return; } pause(); return; }
    if (e.code === 'KeyH' || e.code === 'Slash') { pause(true); return; }
    const hv = handView();
    st.mouse = false;
    if (st.choose) {
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { st.choose.r = (st.choose.r + 1) % st.choose.rows.length; sound.fx('move'); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') playShown(st.choose.k, st.choose.rows[st.choose.r]);
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { st.sel = clamp(st.sel - 1, 0, hv.length - 1); sound.fx('move'); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { st.sel = clamp(st.sel + 1, 0, hv.length - 1); sound.fx('move'); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyE') playShown(st.sel);
    else if (e.code === 'Space' || e.code === 'KeyP') tryPass();
  }
  function toScreen(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  }
  /** What's under the pointer. */
  function hit(x, y) {
    if (x >= PASS_BTN.x && x < PASS_BTN.x + PASS_BTN.w && y >= PASS_BTN.y && y < PASS_BTN.y + PASS_BTN.h) return { pass: true };
    const hv = handView();
    for (let k = hv.length - 1; k >= 0; k--) {
      const c = hv[k], d = st.handDisp.get(c.key) || { x: c.x, y: HAND_Y };
      if (x >= d.x && x < d.x + HAND_W && y >= d.y && y < d.y + HAND_H + HAND_LIFT) return { hand: k };
    }
    for (const [uid, d] of st.disp) if (x >= d.x && x < d.x + UNIT_W && y >= d.y && y < d.y + UNIT_H) return { unit: uid };
    for (const p of [0, 1]) for (const r of ROWS) { const ry = ROW_Y[p][r]; if (x >= BX0 && x < BX1 && y >= ry && y < ry + ROW_H) return { row: r, p }; }
    if (x < 82 && y < 72) return { player: 1 };
    if (x < 82 && y >= 78 && y < 152) return { player: 0 };
    return null;
  }
  function onPointer(e) {
    if (!st || !card.hidden) return;
    st.mouse = true;
    const [x, y] = toScreen(e), h = hit(x, y);
    if (!h) return;
    if (h.pass) { tryPass(); return; }
    if (h.hand !== undefined) {
      if (st.sel === h.hand && !st.choose) playShown(h.hand);
      else { st.sel = h.hand; st.choose = null; sound.fx('select'); }
      return;
    }
    if (h.row && h.p === 0) {
      const hv = handView(), c = hv[st.sel];
      if (st.choose && st.choose.rows.includes(h.row)) { playShown(st.choose.k, h.row); return; }
      if (c && myTurn()) { const rows = rowsFor(c.id); if (!rows.length || rows.includes(h.row)) playShown(st.sel, rows.length > 1 ? h.row : null); }
    }
  }
  function onMove(e) {
    if (!st) return;
    const [x, y] = toScreen(e);
    st.hover = hit(x, y);
    st.mouse = true;
  }

  function pause(rules = false) {
    if (st.phase !== 'playing') return;
    st.phase = 'paused';
    const resume = () => { hideCard(); st.phase = 'playing'; canvas.focus?.(); };
    showCard(`<p class="boss-kicker">Riftcards · ${st.title}</p><h2>${rules ? 'How to play' : 'Paused'}</h2><ul class="boss-rules">${RULES_HTML}</ul>`,
      [['Resume', resume, true], ['Concede', () => close({ won: false, conceded: true })]]);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function drawTable() {
    rect(screen, 0, 0, W, H, CC.FELT);
    for (let y = 0; y < H; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < W; x += 4) pset(screen, x, y, CC.FELT_D);
    // the rows
    const tint = RAMP[st.m.world];
    for (const p of [0, 1]) for (const r of ROWS) {
      const y = ROW_Y[p][r];
      rect(screen, BX0, y, BX1 - BX0, ROW_H - 1, p === 0 ? CC.ROW : CC.ROW_D);
      if (tint !== undefined) stipple(screen, BX0, y, BX1 - BX0, ROW_H - 1, tint + 2, 0.12);
      hline(screen, BX0, BX1 - 1, y + ROW_H - 1, CC.FELT_D);
    }
    // the divider: the round and whose turn it is
    rect(screen, BX0, DIVIDER_Y, BX1 - BX0, 6, SLOT.INK);
    const m = st.m;
    const who = m.result !== null ? '' : busy() ? '' : m.active === 0 && !m.players[0].passed ? 'YOUR TURN' : m.players[1].passed ? '' : `${st.foe.name.toUpperCase()} IS THINKING${'.'.repeat(1 + Math.floor(st.clock * 3) % 3)}`;
    const F = FACTIONS[m.world];
    text(screen, `ROUND ${Math.min(3, m.round)}${F ? ` ${F.zone.toUpperCase()}` : ''}`, BX0 + 3, DIVIDER_Y + 1, F ? RAMP[m.world] : SLOT.GRAY);
    // the three worlds, this one lit
    m.worlds.forEach((w, i) => { rect(screen, BX1 - 24 + i * 8, DIVIDER_Y + 1, 6, 4, i === Math.min(2, m.round - 1) ? (RAMP[w] ?? SLOT.GRAY) : SLOT.DARK); });
    if (who) text(screen, who, (BX0 + BX1) / 2 + 30, DIVIDER_Y + 1, m.active === 0 ? SLOT.GOLD : SLOT.WHITE, { align: 'center' });
  }

  function drawRowHeads(board) {
    for (const p of [0, 1]) for (const r of ROWS) {
      const y = ROW_Y[p][r], score = rowScore(board, p, r);
      const chilled = board[p].chilled[r], horn = board[p].warhorn[r];
      rect(screen, BX0 + 1, y + 1, HEAD_W - 2, ROW_H - 3, chilled ? CC.STORM_D : SLOT.INK);
      rowIcon(screen, BX0 + 3, y + 3, r, chilled ? CC.FROST : SLOT.GRAY);
      text(screen, String(score), BX0 + HEAD_W - 3, y + 12, score ? SLOT.WHITE : SLOT.DARK, { align: 'right' });
      if (horn) { const x = BX0 + 12, yy = y + 3; poly(screen, [[x, yy + 2], [x + 6, yy], [x + 7, yy], [x + 7, yy + 5], [x + 6, yy + 5], [x, yy + 3]], SLOT.GOLD); }
      if (chilled) {
        const kind = ROW_INFO[r].weather;
        if (kind === 'frost') { pset(screen, BX0 + 14, y + 4, CC.ICE); pset(screen, BX0 + 16, y + 6, CC.ICE); pset(screen, BX0 + 18, y + 3, CC.ICE); }
      }
    }
  }

  /** A stippled cloud: an ellipse, thicker in the middle, clipped to a row. */
  function fogCloud(cx, cy, rx, ry, c, xa, xb, ya, yb) {
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = Math.max(ya, Math.floor(cy - ry)); y <= Math.min(yb - 1, cy + ry); y++) for (let x = Math.max(xa, Math.floor(cx - rx)); x <= Math.min(xb - 1, cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      if (BAYER[(y & 3) * 4 + (x & 3)] < (1 - d) * 11) screen.buf[y * W + x] = c;
    }
  }

  /** Weather over a row: snow, fog, rain (and the odd lightning flash). */
  function drawWeather(board, dt) {
    for (const p of [0, 1]) for (const r of ROWS) {
      if (!board[p].chilled[r]) continue;
      const y = ROW_Y[p][r], kind = ROW_INFO[r].weather;
      const x0 = UX0 - 2, w = UX1 - x0;
      if (kind === 'frost') {
        stipple(screen, x0, y, w, ROW_H - 1, CC.FROST, 0.12);
        if (st.rng() < dt * 30) st.weatherParts.push({ kind, p, r, x: x0 + st.rng() * w, y: y, vy: 6 + st.rng() * 8, vx: -3 + st.rng() * 6, t: 3 });
      } else if (kind === 'fog') {
        // soft clouds drifting along the row (each a stippled ellipse, denser in the middle)
        for (let k = 0; k < 6; k++) {
          const cw = 22 + (k % 3) * 8, fx = x0 + ((k * 47 + st.clock * (5 + (k % 3) * 3)) % (w + cw)) - cw / 2;
          const fy = y + 5 + ((k * 7) % 12);
          fogCloud(fx, fy, cw / 2, 5 + (k % 2) * 2, k % 2 ? CC.FOG : CC.FOG_D, x0, x0 + w, y, y + ROW_H - 1);
        }
      } else {
        stipple(screen, x0, y, w, ROW_H - 1, CC.STORM, 0.4);
        if (st.rng() < dt * 45) st.weatherParts.push({ kind, p, r, x: x0 + st.rng() * w, y: y, vy: 70, vx: -14, t: 1 });
        const flash = Math.sin(st.clock * 1.7 + p * 2 + ROWS.indexOf(r)) > 0.985;
        if (flash) stipple(screen, x0, y, w, ROW_H - 1, SLOT.WHITE, 0.4);
      }
    }
    for (const q of st.weatherParts) {
      q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      const ry = ROW_Y[q.p][q.r];
      if (q.y > ry + ROW_H - 2) { q.y = ry; }
      if (q.kind === 'frost') pset(screen, q.x, q.y, (q.x | 0) % 3 ? SLOT.WHITE : CC.ICE);
      else line(screen, q.x, q.y, q.x + 1, q.y - 3, CC.FROST);
    }
    st.weatherParts = st.weatherParts.filter(q => q.t > 0 && board[q.p].chilled[q.r]);
    for (const b of st.weatherBurst) {
      b.t -= dt;
      for (const p of [0, 1]) { const y = ROW_Y[p][b.row]; if (b.t > 0) stipple(screen, UX0 - 2, y, UX1 - UX0 + 2, ROW_H - 1, SLOT.WHITE, 0.5 * b.t); }
    }
    st.weatherBurst = st.weatherBurst.filter(b => b.t > 0);
  }

  function drawUnits(board, dt) {
    const live = new Set();
    for (const p of [0, 1]) for (const r of ROWS) {
      const list = board[p].rows[r], at = rowLayout(list.length), y = ROW_Y[p][r] + 1;
      list.forEach((u, k) => {
        live.add(u.uid);
        let d = st.disp.get(u.uid);
        if (!d) {
          const from = st.spawns.get(u.uid) || { x: at(k), y };
          d = { x: from.x, y: from.y, hop: 0, str: u.str, flying: true };
          st.disp.set(u.uid, d);
          st.spawns.delete(u.uid);
        }
        const tx = at(k), ty = y;
        const k2 = Math.min(1, dt * (d.flying ? 9 : 14));
        d.x += (tx - d.x) * k2; d.y += (ty - d.y) * k2;
        if (d.flying && Math.abs(tx - d.x) < 1 && Math.abs(ty - d.y) < 1) { d.flying = false; d.hop = 1; sound.fx('land', { strength: 0.4 }); }
        d.hop = Math.max(0, d.hop - dt * 2.5);
        if (u.str !== d.str && !d.flying) { popAt(d.x + UNIT_W / 2, d.y - 2, `${u.str > d.str ? '+' : ''}${u.str - d.str}`, u.str > d.str ? CC.GREEN : SLOT.BAD); d.str = u.str; }
        const hov = st.hover?.unit === u.uid;
        drawUnit(screen, d.x, d.y, { ...u, str: d.flying ? CARDS[u.id].str : u.str }, { clock: st.clock, hop: d.hop, selected: hov, flip: p === 1 });
        const stay = st.stays.find(s => s.uid === u.uid);
        if (stay && !st.frozen) text(screen, 'STAYS!', d.x + UNIT_W / 2, d.y - 6, CC.GREEN, { align: 'center', shadow: SLOT.INK });
      });
    }
    // the table was swept (a round ended): the rest fly to the discard pile
    if (!st.frozen) for (const [uid, d] of st.disp) if (!live.has(uid)) { st.ghosts.push({ id: d.id, x: d.x, y: d.y, t: 0.6, max: 0.6, kind: 'sweep', uid }); st.disp.delete(uid); }
    st.stays.forEach(s => { s.t -= dt; });
    st.stays = st.stays.filter(s => s.t > 0);
  }
  function rememberIds(board) { for (const p of [0, 1]) for (const r of ROWS) for (const u of board[p].rows[r]) { const d = st.disp.get(u.uid); if (d) d.id = u.id; } }

  function drawGhosts(dt) {
    for (const g of st.ghosts) {
      g.t -= dt;
      const k = 1 - g.t / g.max;
      if (!g.id) continue;
      if (g.kind === 'burn') {
        drawUnit(screen, g.x, g.y, { id: g.id, str: 0, uid: g.uid }, { clock: st.clock });
        stipple(screen, g.x, g.y, UNIT_W, UNIT_H, CC.FIRE_D, 0.2 + k * 0.7);
        for (let f = 0; f < 6; f++) {
          const fx = g.x + 2 + ((f * 7 + st.clock * 40) % (UNIT_W - 4)), fy = g.y + UNIT_H - ((f * 5 + st.clock * 60) % UNIT_H) * (0.5 + k);
          rect(screen, fx, fy, 2, 3, f % 2 ? CC.FIRE : CC.SUN);
        }
      } else {
        const x = g.x + (DISCARD_AT.x - g.x) * k, y = g.y + (DISCARD_AT.y - g.y) * k;
        drawCardBack(screen, x, y, UNIT_W * (1 - k * 0.5), UNIT_H * (1 - k * 0.5));
      }
    }
    st.ghosts = st.ghosts.filter(g => g.t > 0);
  }

  function drawHand(dt) {
    const hv = handView(), my = myTurn();
    const live = new Set();
    hv.forEach((c, k) => {
      live.add(c.key);
      const selected = k === st.sel && (my || st.choose);
      const hov = st.hover?.hand === k;
      const ty = HAND_Y - (selected ? HAND_LIFT : hov ? 3 : 0);
      let d = st.handDisp.get(c.key);
      if (!d) { d = { x: DECK_AT[0].x, y: DECK_AT[0].y }; st.handDisp.set(c.key, d); }
      const kk = Math.min(1, dt * 12);
      d.x += (c.x - d.x) * kk; d.y += (ty - d.y) * kk;
    });
    for (const key of st.handDisp.keys()) if (!live.has(key)) st.handDisp.delete(key);
    // draw the non-selected first, the selected one on top
    const order = hv.map((c, k) => k).sort((a, b) => (a === st.sel) - (b === st.sel));
    for (const k of order) {
      const c = hv[k], d = st.handDisp.get(c.key);
      drawHandCard(screen, d.x, d.y + (my ? 0 : 3), c.id, { selected: (k === st.sel && my) || st.hover?.hand === k, clock: st.clock });
    }
    // the rows the chosen card would go to
    if (my && hv[st.sel]) {
      const id = hv[st.sel].id, c = CARDS[id], blink = Math.floor(st.clock * 4) % 2;
      if (c.kind === 'creature') {
        const side = c.ability === 'spy' ? 1 : 0;
        const rows = st.choose ? [st.choose.rows[st.choose.r]] : rowsFor(id);
        for (const r of rows) frame(screen, BX0, ROW_Y[side][r], BX1 - BX0, ROW_H - 1, blink ? SLOT.GOLD : SLOT.GOLD_DARK);
        if (st.choose) for (const r of st.choose.rows) if (r !== st.choose.rows[st.choose.r]) frame(screen, BX0, ROW_Y[0][r], BX1 - BX0, ROW_H - 1, SLOT.GRAY);
      } else if (c.effect.weather) {
        const r = { frost: 'front', fog: 'back', storm: 'sky' }[c.effect.weather];
        for (const p of [0, 1]) frame(screen, BX0, ROW_Y[p][r], BX1 - BX0, ROW_H - 1, blink ? CC.FROST : CC.STORM);
      } else if (c.effect.horn) {
        for (const r of ROWS) frame(screen, BX0, ROW_Y[0][r], BX1 - BX0, ROW_H - 1, blink ? SLOT.GOLD_DARK : SLOT.DARK);
      }
    }
    // hints
    const tip = !st.m || st.m.result !== null ? '' : st.choose ? 'UP/DOWN: ROW   ENTER: PLAY HERE   ESC: BACK'
      : my ? (st.confirmPass > 0 ? 'SPACE AGAIN TO PASS   ANY OTHER KEY: KEEP PLAYING' : '< > CHOOSE   ENTER PLAY   SPACE PASS   ESC MENU')
      : st.m.players[0].passed && st.m.result === null ? 'YOU PASSED - WAIT FOR THE ROUND TO END' : '';
    if (tip) text(screen, tip, (BX0 + BX1) / 2, H - 8, SLOT.GRAY, { align: 'center' });
  }

  function drawPlayer(p, board) {
    const y0 = p === 1 ? 1 : 78, h = p === 1 ? 71 : 73;
    const who = p === 0 ? st.me : st.foe, pl = st.m.players[p];
    const f = factionInfo(who.faction), ramp = who.faction === 'king' ? RAMP.rift : RAMP[who.faction] ?? RAMP.neutral;
    rect(screen, 1, y0, 81, h, SLOT.INK);
    rect(screen, 2, y0 + 1, 79, h - 2, SLOT.PANEL);
    rect(screen, 2, y0 + 1, 79, 3, ramp + 1);
    const active = st.m.result === null && st.m.active === p && !busy() && !pl.passed;
    if (active && Math.floor(st.clock * 3) % 2) frame(screen, 0, y0 - 1, 83, h + 2, SLOT.GOLD);
    // portrait
    const res = st.m.result, pose = res === null ? (st.banner && st.frozen ? (st.frozen.totals[p] > st.frozen.totals[1 - p] ? 'cheer' : 'idle') : 'idle') : res === p ? 'cheer' : res === 'draw' ? 'idle' : 'down';
    const sheet = p === 0 ? st.heroSheet : st.foeSheet;
    const spr = sheet.get('front', pose, 0, Math.floor(st.clock * 6) % 4);
    rect(screen, 4, y0 + 6, 30, 38, ramp + 2);
    dither(screen, 4, y0 + 6, 30, 14, ramp + 1, ramp + 2, 0.4);
    blit(screen, spr, 5, y0 + 7, p === 1 ? { map: NPC_MAP } : {});
    frame(screen, 4, y0 + 6, 30, 38, SLOT.INK);
    // name, faction
    const name = wrap(who.name.toUpperCase(), 44).slice(0, 2);
    name.forEach((ln, i) => text(screen, ln, 37, y0 + 7 + i * 6, SLOT.WHITE));
    text(screen, f.name.toUpperCase(), 37, y0 + 8 + name.length * 6, ramp);
    // gems
    const crack = st.gemCrack.find(g => g.p === p);
    for (let g = 0; g < MATCH_RULES.gems; g++) {
      const lit = g < pl.gems || !!(crack && g === crack.gem && crack.t > 0.6);
      gemIcon(screen, 37 + g * 11, y0 + 28, lit);
      if (crack && g === crack.gem && crack.t > 0) {
        const k = 1 - crack.t / 1.2;
        for (let q = 0; q < 5; q++) { const a = q * 1.26 + 0.3; pset(screen, 40 + g * 11 + Math.cos(a) * k * 12, y0 + 32 + Math.sin(a) * k * 12 + k * k * 6, q % 2 ? CC.GEM : SLOT.WHITE); }
      }
    }
    // cards in hand
    drawCardBack(screen, 61, y0 + 27, 7, 10);
    text(screen, String(pl.hand.length), 70, y0 + 30, SLOT.WHITE);
    // total strength
    const tot = boardTotal(board, p), other = boardTotal(board, 1 - p);
    rect(screen, 4, y0 + h - 24, 30, 17, SLOT.INK);
    text(screen, String(tot), 19, y0 + h - 21, tot > other ? SLOT.GOLD : SLOT.WHITE, { align: 'center', scale: 2 });
    if (tot > other) { pset(screen, 5, y0 + h - 23, SLOT.GOLD); pset(screen, 32, y0 + h - 23, SLOT.GOLD); }
    text(screen, 'TOTAL', 19, y0 + h - 6, SLOT.GRAY, { align: 'center' });
    if (pl.passed && !st.frozen) {
      rect(screen, 37, y0 + h - 20, 40, 9, SLOT.INK);
      text(screen, 'PASSED', 57, y0 + h - 18, SLOT.BAD, { align: 'center' });
    } else {
      text(screen, `DECK ${pl.deck.length}`, 37, y0 + h - 18, SLOT.GRAY);
    }
    if (st.hover?.player === p) frame(screen, 1, y0, 81, h, SLOT.WHITE);
  }

  function drawPassButton() {
    const b = PASS_BTN, ready = myTurn(), hov = st.hover?.pass;
    rect(screen, b.x - 1, b.y - 1, b.w + 2, b.h + 2, SLOT.INK);
    rect(screen, b.x, b.y, b.w, b.h, !ready ? SLOT.DARK : st.confirmPass > 0 ? SLOT.RED : hov ? SLOT.WHITE : SLOT.GOLD);
    text(screen, !ready ? (st.m.players[0].passed ? 'PASSED' : 'WAIT') : st.confirmPass > 0 ? 'SURE? PASS!' : 'PASS', b.x + b.w / 2, b.y + 5, ready && st.confirmPass > 0 ? SLOT.WHITE : SLOT.INK, { align: 'center' });
    // my deck and discard pile
    const pl = st.m.players[0];
    for (let k = 0; k < Math.min(4, Math.ceil(pl.deck.length / 4)); k++) drawCardBack(screen, DECK_AT[0].x - k, DECK_AT[0].y - k, 14, 20);
    text(screen, `DECK ${pl.deck.length}`, 6, 210, SLOT.GRAY);
    if (pl.discard.length) { rect(screen, DISCARD_AT.x, DISCARD_AT.y - 4, 14, 20, SLOT.INK); rect(screen, DISCARD_AT.x + 1, DISCARD_AT.y - 3, 12, 18, SLOT.DARK); }
    text(screen, `OUT ${pl.discard.length}`, 48, 210, SLOT.GRAY);
  }

  /** The right panel: the card you're looking at (or theirs, just played). */
  function drawPanel(board) {
    const x = PANEL_X;
    rect(screen, x - 2, 0, W - x + 2, H, SLOT.INK);
    let id = null, str = null, perkOf = null;
    const hv = handView();
    if (st.foeCard && st.foeCard.t > 0) id = st.foeCard.id;
    else if (st.hover?.hand !== undefined) id = hv[st.hover.hand]?.id;
    else if (st.hover?.unit) { for (const p of [0, 1]) for (const r of ROWS) { const u = board[p].rows[r].find(v => v.uid === st.hover.unit); if (u) { id = u.id; str = u.str; } } }
    else if (st.hover?.player !== undefined) perkOf = st.hover.player;
    else if (hv[st.sel] && st.m.result === null) id = hv[st.sel].id;
    if (perkOf !== null) {
      const who = perkOf === 0 ? st.me : st.foe, f = factionInfo(who.faction);
      let y = 6;
      text(screen, f.name.toUpperCase(), x + 32, y, (who.faction === 'king' ? RAMP.rift : RAMP[who.faction]) ?? SLOT.GOLD, { align: 'center' }); y += 9;
      for (const ln of wrap(f.zone.toUpperCase(), 64)) { text(screen, ln, x + 32, y, SLOT.GRAY, { align: 'center' }); y += 7; }
      y += 4; text(screen, 'PERK', x + 1, y, SLOT.GOLD); y += 8;
      for (const ln of wrap(f.perkText.toUpperCase(), 64)) { text(screen, ln, x + 1, y, SLOT.WHITE); y += 7; }
      y += 4;
      for (const ln of wrap(f.about.toUpperCase(), 64)) { text(screen, ln, x + 1, y, SLOT.GRAY); y += 7; }
      return;
    }
    if (!id) {
      text(screen, 'RIFTCARDS', x + 32, 8, SLOT.GOLD, { align: 'center' });
      const lines = wrap('POINT AT A CARD TO READ IT. MOST STRENGTH WINS THE ROUND. WIN TWO ROUNDS.', 64);
      lines.forEach((ln, i) => text(screen, ln, x + 1, 22 + i * 7, SLOT.GRAY));
      return;
    }
    const c = CARDS[id];
    drawBigCard(screen, x, 2, id, { clock: st.clock, str });
    let y = BIG_H + 6;
    if (st.foeCard && st.foeCard.t > 0) { text(screen, 'THEY PLAYED', x + 32, y, SLOT.BAD, { align: 'center' }); y += 8; }
    if (c.kind === 'creature') {
      const rowName = c.ability === 'agile' ? 'FRONT OR BACK' : `${ROW_INFO[c.row].name.toUpperCase()} ROW`;
      text(screen, rowName, x + 1, y, SLOT.GOLD); y += 7;
      text(screen, str !== null && str !== c.str ? `STRENGTH ${str} (${c.str})` : `STRENGTH ${c.str}`, x + 1, y, SLOT.WHITE); y += 9;
      const words = c.ability ? ABILITIES[c.ability] : 'NO ABILITY - JUST STRONG.';
      for (const ln of wrap(words.toUpperCase().replace(/[—–]/g, '-').replace(/[’‘]/g, "'"), 64).slice(0, 12)) { text(screen, ln, x + 1, y, SLOT.GRAY); y += 7; }
    } else {
      for (const ln of wrap(cardText(c).toUpperCase().replace(/[—–]/g, '-').replace(/[’‘]/g, "'"), 64).slice(0, 12)) { text(screen, ln, x + 1, y, SLOT.GRAY); y += 7; }
    }
    const fac = c.faction === 'neutral' ? 'NEUTRAL' : FACTIONS[c.faction].name.toUpperCase();
    text(screen, fac, x + 32, H - 9, c.faction === 'neutral' ? SLOT.GRAY : RAMP[c.faction], { align: 'center' });
  }

  function drawOverlays(dt) {
    // horn waves, the sun of clear skies, scorch's flash
    for (const w of st.hornWave) {
      w.t -= dt;
      const y = ROW_Y[w.p][w.row] + ROW_H / 2, r = (1 - w.t) * 60;
      ring(screen, BX0 + 12, y, r, w.t > 0.5 ? SLOT.GOLD : SLOT.GOLD_DARK);
    }
    st.hornWave = st.hornWave.filter(w => w.t > 0);
    if (st.sun > 0) { st.sun -= dt; const k = st.sun / 1.2; stipple(screen, BX0, 0, BX1 - BX0, 152, CC.SUN, k * 0.35); }
    if (st.scorchFlash > 0) { st.scorchFlash -= dt; stipple(screen, BX0, 0, BX1 - BX0, 152, CC.FIRE, st.scorchFlash * 0.8); }
    // the +N / −N pops
    for (const q of st.pops) { q.t -= dt; text(screen, q.str, q.x, q.y - (1 - q.t / q.max) * 10, q.c, { align: 'center', shadow: SLOT.INK }); }
    st.pops = st.pops.filter(q => q.t > 0);
    // a message over the board
    if (st.flash) {
      st.flash.t -= dt;
      const y = DIVIDER_Y - 9, w = textWidth(st.flash.str) + 8;
      rect(screen, (BX0 + BX1) / 2 - w / 2, y - 2, w, 9, SLOT.INK);
      text(screen, st.flash.str, (BX0 + BX1) / 2, y, st.flash.c, { align: 'center' });
      if (st.flash.t <= 0) st.flash = null;
    }
    // a round banner
    if (st.banner) {
      st.banner.t -= dt;
      const k = st.banner.t / st.banner.max, slide = k > 0.9 ? (k - 0.9) * 10 : k < 0.1 ? (0.1 - k) * -10 : 0;
      const cx = (BX0 + BX1) / 2 + slide * 200, y = 60;
      rect(screen, BX0, y, BX1 - BX0, 30, SLOT.INK);
      hline(screen, BX0, BX1 - 1, y + 1, st.banner.c); hline(screen, BX0, BX1 - 1, y + 28, st.banner.c);
      text(screen, st.banner.big, cx, y + 6, st.banner.c, { align: 'center', scale: 2 });
      text(screen, st.banner.small, cx, y + 20, SLOT.WHITE, { align: 'center' });
      if (st.banner.t <= 0) st.banner = null;
    }
  }

  function draw(dt) {
    const board = boardNow();
    rememberIds(board);
    drawTable();
    drawWeather(board, dt);
    drawRowHeads(board);
    drawUnits(board, dt);
    drawGhosts(dt);
    drawPlayer(1, board);
    drawPlayer(0, board);
    drawPassButton();
    drawHand(dt);
    drawPanel(board);
    drawOverlays(dt);
  }

  // ---------------------------------------------------------------------------
  // The loop
  // ---------------------------------------------------------------------------
  function update(dt) {
    st.clock += dt;
    if (st.phase !== 'playing') return;
    st.wait = Math.max(0, st.wait - dt);
    st.confirmPass = Math.max(0, st.confirmPass - dt);
    if (st.foeCard) { st.foeCard.t -= dt; if (st.foeCard.t <= 0) st.foeCard = null; }
    st.gemCrack.forEach(g => { g.t -= dt; });
    st.gemCrack = st.gemCrack.filter(g => g.t > 0);
    if (st.frozen) { st.frozen.t -= dt; if (st.frozen.t <= 0) { st.frozen = null; if (st.pendingBanner) { st.banner = st.pendingBanner; st.pendingBanner = null; st.wait = Math.max(st.wait, 1.2); } } }
    if (st.ending !== null) {
      if (!st.frozen) st.ending -= dt;
      if (st.ending <= 0) { st.ending = null; finish(); }
      return;
    }
    if (busy()) return;
    if (st.m.result === null && st.m.active === 1) {
      st.foeAt -= dt;
      if (st.foeAt <= 0) foeMove();
    } else if (st.auto && st.m.result === null && st.m.active === 0) {
      st.autoAt -= dt;
      if (st.autoAt <= 0) { st.autoAt = 0.25; myAutoMove(); }
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
    if (!st.palette) st.palette = packPalette(cardPalette({ hero: heroBaseColors(st.me.design), npc: st.foe.design ? heroBaseColors(st.foe.design) : null }));
    present(screen, st.palette, target);
  }

  function finish() {
    if (!st || st.phase === 'over') return;
    st.phase = 'over';
    const res = st.m.result, won = res === 0, drew = res === 'draw';
    const score = st.m.roundLog.map(r => `${r.totals[0]}–${r.totals[1]}`).join(' · ');
    sound.jingle(won ? 'victory' : 'defeat');
    showCard(`<p class="boss-kicker">Riftcards · ${st.title}</p><h2>${won ? 'You win!' : drew ? 'A draw!' : `${st.foe.name} wins`}</h2>
      <p>${won ? `${st.foe.name} gathers up the cards, grinning. "Good game!"` : drew ? 'Both out of gems at once — nobody wins this one.' : 'Tip: a round you can’t win cheaply is a round to let go — save cards for the other two.'}</p>
      <p class="boss-title">Rounds: ${score}</p>`,
    [[won ? 'Collect ▸' : 'Back', () => close({ won, draw: drew, rounds: st.m.roundLog }), true], ...(won ? [] : [['Rematch', () => restart()]])]);
  }

  function freshState(seed) {
    const o = st.options;
    const m = createMatch({ decks: [o.me.deck, o.foe.deck], factions: [o.me.faction, o.foe.faction === 'king' ? 'starlit' : o.foe.faction], seed, first: seed % 2, hands: [MATCH_RULES.hand, o.foe.hand || MATCH_RULES.hand] });
    Object.assign(st, {
      m, rng: mulberry32(hashSeed('foe-ai', seed)), sel: 0, choose: null, confirmPass: 0, hover: null, mouse: false,
      disp: new Map(), handDisp: new Map(), spawns: new Map(), ghosts: [], pops: [], flash: null, banner: null, pendingBanner: null,
      frozen: null, wait: 0, foeAt: 1.2, autoAt: 0.5, ending: null, foeCard: null, gemCrack: [], stays: [],
      weatherParts: [], weatherBurst: [], hornWave: [], sun: 0, scorchFlash: 0, playedFrom: null,
    });
    absorbEvents();
    st.wait = 1.6;                                                   // the opening banner
  }
  function begin() {
    hideCard();
    st.phase = 'playing';
    if (st.banner) st.banner.t = st.banner.max;
    sound.fx('shuffle');
    canvas.focus?.();
  }
  function restart() {
    st.tries++;
    freshState(st.options.seed + st.tries * 101);
    begin();
  }

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
    get match() { return st?.m ?? null; },
    /** Tests and demos: the computer plays your side too (fast). */
    autoPlay(on = true) { if (st) { st.auto = on; if (st.phase === 'intro') begin(); } },
    /**
     * Play a match. me: { deck, faction, design, name }; foe: { deck, faction ('king' for the
     * Rift King), design (an NPC's look with .silly), name, title, skill 0..1, hand, intro }.
     */
    start({ me, foe, seed = 1, title = 'Riftcards', intro = '' }) {
      return new Promise(resolve => {
        st = {
          options: { me, foe, seed }, me, foe, title, resolve, tries: 0, phase: 'intro', clock: 0, lastDraw: 0, raf: 0, palette: null, auto: false,
          heroSheet: createHeroSheet(me.design), foeSheet: createHeroSheet(foe.design || me.design), music: sound.chip.playing,
        };
        freshState(seed);
        root.hidden = false;
        document.body.classList.add('in-cards');
        window.addEventListener('keydown', onKey, true);
        canvas.addEventListener('pointerdown', onPointer);
        canvas.addEventListener('pointermove', onMove);
        sound.place('cards', seed);
        const f = factionInfo(foe.faction), mine = factionInfo(me.faction);
        showCard(`<p class="boss-kicker">Riftcards · ${title}</p><h2>${foe.name}</h2><p class="boss-title">${foe.title || 'wants a game of cards'}</p>
          ${intro ? `<p>${intro}</p>` : ''}
          <p class="card-factions"><strong>${f.name}</strong> (${f.perkText}) <em>vs</em> your <strong>${mine.name}</strong> (${mine.perkText})</p>
          <p class="card-factions">The rounds are played in <strong>${st.m.worlds.map(w => FACTIONS[w]?.zone || w).join(' → ')}</strong>: a faction's creatures get <strong>+1 at home</strong>${st.m.worlds.some(w => CLIMATE[w]) ? `, and ${st.m.worlds.filter(w => CLIMATE[w]).map(w => `${FACTIONS[w].zone} brings its ${CLIMATE[w].name.toLowerCase()}`).join(', ')} (for everyone but the locals)` : ''}.</p>
          <ul class="boss-rules">${RULES_HTML}</ul>`,
        [['Deal! (Enter)', () => begin(), true], ['Not now', () => close({ won: false, skipped: true })]]);
        st.raf = requestAnimationFrame(frameLoop);
      });
    },
  };
}
