/**
 * Drawing the battles: one scene per mini-game, the HUD and pixel particles — all
 * into the indexed 320×180 screen (pixel.js). Colours are palette indices, so the
 * palette swap after every correct key recolours everything drawn here.
 *
 *   const view = createView({ boss, design, seed });
 *   drawBattle(view, game, { phase, countdown, clock });
 */
import { createSurface, clear, rect, pset, blit, ellipse, line, text, textWidth, ring, solidMap, arrow, hline, frame, dither, poly } from '../pixel.js';
import { SLOT, ST, BR, FX, HR } from '../palette.js';
import { createHeroSheet, HERO_W, HERO_H } from '../heroSprite.js';
import { generateMonster } from '../monsters.js';
import { hashSeed } from '../levelGenerator.js';
import { SCREEN } from './common.js';
import { RUNNER } from './runner.js';
import { QUICKDRAW } from './quickdraw.js';
import { SLED } from './sled.js';
import { STARBEAT, noteY } from './starbeat.js';
import { gaugeMarker } from './echo.js';
import { TENNIS } from './tennis.js';
import { INVADERS } from './invaders.js';
import { FIREBALL } from './fireball.js';
import { DOODLE } from './doodle.js';
import { FLAPPY } from './flappy.js';
import { TETRIS, cellsOf } from './tetris.js';
import { BREAKOUT } from './breakout.js';
import { CANNON, hillY } from './cannon.js';
import { WHACK } from './whack.js';
import { FISHING } from './fishing.js';
import { MAZE } from './maze.js';
import { FROGGER } from './frogger.js';
import { LANDER, groundAt } from './lander.js';
import { RAFT, riverAt } from './raft.js';
import { MINECART } from './minecart.js';
import { SNOWMOBILE, hillAt } from './snowmobile.js';
import { PLANE } from './plane.js';
import { createLandscape, drawLandscape, drawSky, drawStrip, createSnowField, drawStripV, spikeSprite, drawKeyCap, heartSprite, starSprite, snowballSprite, slopeSprite, sledSprite } from './art.js';

const W = SCREEN.w, H = SCREEN.h;
const WHITE = solidMap(SLOT.WHITE);
const INK = solidMap(SLOT.INK);
const BOSS_SIZE = 48;

export function createView({ boss, design, seed = 1 }) {
  return {
    screen: createSurface(W, H),
    hero: createHeroSheet(design),
    monster: generateMonster(boss.monsterSeed ?? seed, { role: boss.role || 'walker', size: BOSS_SIZE }),
    minion: generateMonster(hashSeed(boss.monsterSeed ?? seed, 'minion'), { role: 'flyer', size: 20, ramp: 'minion' }),
    land: createLandscape(boss.mode === 'lander' ? 'starlit' : boss.theme || 'meadow', hashSeed(seed, 'land')),
    snow: boss.mode === 'sled' ? createSnowField(hashSeed(seed, 'snow')) : null,
    particles: [],
    shake: 0,
    flash: 0,
  };
}

// ---------------------------------------------------------------------------
// Particles (fireworks, puffs, snow)
// ---------------------------------------------------------------------------
export function burst(view, x, y, { n = 18, speed = 90, life = 0.7, colors = [FX.A, FX.B, FX.C, FX.D], gravity = 160 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = speed * (0.45 + Math.random() * 0.7);
    view.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (0.6 + Math.random() * 0.5), c: colors[i % colors.length], g: gravity });
  }
}

export function updateParticles(view, dt) {
  for (const p of view.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.t -= dt; }
  view.particles = view.particles.filter(p => p.t > 0 && p.y < H + 4);
  if (view.particles.length > 400) view.particles.splice(0, view.particles.length - 400);
}

function drawParticles(s, view) {
  for (const p of view.particles) rect(s, p.x, p.y, p.t > 0.25 ? 2 : 1, p.t > 0.25 ? 2 : 1, p.c);
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
/** The boss sprite with its bob, hurt flash and attack pose; (cx, bottom) anchor. */
function drawBoss(s, view, g, cx, bottom, { clock, flip = false, lift = 0, angle = 0, squash = 0, shadow = true } = {}) {
  const m = view.monster;
  const pose = g.bossHp <= 0 ? 'hurt' : g.bossHurt > 0 ? 'hurt' : g.taunt > 0 ? 'taunt' : g.bossAttack > 0 ? 'attack' : 'idle';
  const spr = m.frame({ pose, frame: Math.floor(clock * 3) });
  const bob = Math.round(Math.sin(clock * 3) * 1.5);
  const map = g.bossHurt > 0 && Math.floor(clock * 20) % 2 ? WHITE : null;
  // a shadow on the ground
  if (shadow && lift < 30) ellipse(s, cx, bottom - 1, 16 - lift * 0.2, 3, ST.GROUND2);
  if (squash) {
    // squash: drop rows (nearest neighbour)
    const h = Math.round(spr.h * (1 - squash));
    for (let j = 0; j < h; j++) {
      const sj = Math.floor(j / h * spr.h);
      for (let i = 0; i < spr.w; i++) {
        let c = spr.buf[sj * spr.w + (flip ? spr.w - 1 - i : i)];
        if (!c) continue;
        if (map) c = map[c];
        pset(s, cx - spr.w / 2 + i, bottom - h + j + bob, c);
      }
    }
    return;
  }
  blit(s, spr, cx - spr.w / 2, bottom - spr.h - lift + bob, { flip, map, angle });
}

function drawHud(s, g, boss, clock) {
  // hearts
  rect(s, 3, 3, g.maxHearts * 9 + 5, 11, SLOT.PANEL);
  for (let i = 0; i < g.maxHearts; i++) blit(s, heartSprite(i < g.hearts), 5 + i * 9, 5);
  // the clock
  const secs = Math.ceil(g.timeLeft);
  rect(s, W / 2 - 14, 2, 28, 14, SLOT.PANEL);
  text(s, String(secs), W / 2, 4, secs <= 10 && Math.floor(clock * 4) % 2 ? SLOT.BAD : SLOT.WHITE, { scale: 2, align: 'center' });
  // boss health — or, for a checkpoint challenge, progress toward the goal
  const bw = 86, bx = W - bw - 5;
  rect(s, bx - 2, 2, bw + 4, 17, SLOT.PANEL);
  let name = boss.kind === 'checkpoint' ? `GOAL ${boss.hp - g.bossHp}/${boss.hp}` : boss.kind === 'travel' ? `TRIP ${Math.round((1 - g.bossHp / boss.hp) * 100)}%` : boss.name;
  while (textWidth(name) > bw && name.length > 4) name = name.slice(0, -1);
  text(s, name, bx, 4, SLOT.WHITE);
  if (boss.kind === 'checkpoint' || boss.kind === 'travel') {
    rect(s, bx, 11, bw, 5, SLOT.DARK);
    rect(s, bx, 11, Math.round(bw * (1 - g.bossHp / boss.hp)), 5, SLOT.CYAN);
  } else {
    rect(s, bx, 11, bw, 5, SLOT.RED_DARK);
    rect(s, bx, 11, Math.round(bw * (g.bossHp / boss.hp)), 5, SLOT.RED);
    hline(s, bx, bx + Math.round(bw * (g.bossHp / boss.hp)) - 1, 11, SLOT.BAD);
  }
}

/** Big centred text with an ink shadow. */
function banner(s, str, y, c = SLOT.WHITE, scale = 3) {
  text(s, str, W / 2, y, c, { scale, align: 'center', shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function drawRunner(s, view, g, o) {
  const R = RUNNER, G = R.ground;
  drawLandscape(s, view.land, g.distance, o.clock, G);
  drawBoss(s, view, g, R.bossX, G, { clock: o.clock });
  for (const sp of g.spikes) {
    const spr = spikeSprite(sp.kind, BR);
    blit(s, spr, sp.x - spr.w / 2, G - spr.h + 1, sp.kind === 'ball' ? { angle: -sp.x / 8 } : {});
  }
  for (const f of g.fireworks) {                                         // fireworks flying into the boss
    const [x0, y0] = f.from, x1 = R.bossX - 8, y1 = G - 34;
    const x = x0 + (x1 - x0) * f.t, y = y0 + (y1 - y0) * f.t - Math.sin(f.t * Math.PI) * 46;
    for (let k = 1; k < 5; k++) rect(s, x - k * 3, y + k * 1.2, 2, 2, [FX.A, FX.B, FX.C, FX.D][k % 4]);
    rect(s, x - 1, y - 1, 3, 3, SLOT.WHITE);
  }
  // the hero: side view, running / backflipping
  const p = g.player;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    let pose = 'run', frameIndex = Math.floor(g.distance / 9) % 4;
    if (o.phase === 'intro' || g.result === 'lost') { pose = g.result === 'lost' ? 'hurt' : 'idle'; frameIndex = 0; }
    else if (!p.grounded) pose = p.vy > 0 ? 'jump' : 'fall';
    else if (p.stumble > 0) pose = 'stumble';
    const spr = view.hero.get('side', pose, frameIndex, Math.floor(o.clock * 8) % 4);
    const x = R.playerX - HERO_W / 2, y = G - HERO_H + 1 - p.y;
    ellipse(s, R.playerX, G, 7 - Math.min(5, p.y / 12), 2, ST.GROUND2);
    blit(s, spr, x, y, p.flipping ? { angle: -p.flip * Math.PI * 2 } : {});
  }
  if (o.phase === 'playing' || o.phase === 'countdown') {
    const bob = Math.round(Math.sin(o.clock * 8) * 1);
    const stumbling = p.stumble > 0;
    const y = G - HERO_H - 14 - p.y + bob;
    drawKeyCap(s, R.playerX, y, g.key.label, stumbling ? { face: SLOT.BAD, side: SLOT.RED_DARK } : {});
    pset(s, R.playerX, y + 10, SLOT.INK); pset(s, R.playerX - 1, y + 9, SLOT.INK); pset(s, R.playerX + 1, y + 9, SLOT.INK);
  }
}

// ---------------------------------------------------------------------------
// Copycat (echo)
// ---------------------------------------------------------------------------
const HERO_POSE = { up: 'up', down: 'down', left: 'left', right: 'right', oops: 'down' };

function drawEcho(s, view, g, o) {
  const G = 150;
  drawLandscape(s, view.land, 0, o.clock, G);
  // a little stage: planks
  rect(s, 40, G - 2, 240, 4, ST.GROUND2);
  for (let x = 44; x < 280; x += 12) pset(s, x, G - 1, ST.GROUND0);
  // the boss dances
  const m = g.bossMove;
  const lift = m === 'up' ? 12 : 0, squash = m === 'down' ? 0.22 : 0, angle = m === 'left' ? -0.3 : m === 'right' ? 0.3 : 0;
  const shift = m === 'left' ? -8 : m === 'right' ? 8 : 0;
  drawBoss(s, view, g, 228 + shift, G, { clock: o.clock, lift, squash, angle });
  if (m) {                                                                   // the move, big, above the boss
    ellipse(s, 228, 58, 13, 13, SLOT.PANEL);
    arrow(s, 228, 58, m, 17, SLOT.GOLD);
  }
  // the hero copies
  const hm = g.heroMove?.move;
  const pose = g.result === 'lost' ? 'down' : hm ? HERO_POSE[hm] : g.bossHp <= 0 ? 'cheer' : 'idle';
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', pose, 0, Math.floor(o.clock * 8) % 4), 92 - HERO_W / 2, G - HERO_H + 1 - (pose === 'up' || pose === 'cheer' ? 4 : 0));
  if (hm && hm !== 'oops') { ellipse(s, 92, 88, 10, 10, SLOT.PANEL); arrow(s, 92, 88, hm, 13, SLOT.CYAN); }
  // the sequence so far, as slots
  if (o.phase === 'playing' || o.phase === 'countdown') {
    const n = g.sequence.length, size = 15, x0 = W / 2 - (n * size) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * size + size / 2, y = 34;
      const done = g.phase === 'input' && i < g.inputIndex;
      const shown = g.phase === 'show' && i <= g.showIndex;
      rect(s, x - 6, y - 6, 13, 13, done ? SLOT.CYAN : shown ? SLOT.GOLD : SLOT.PANEL);
      frame(s, x - 6, y - 6, 13, 13, SLOT.INK);
      if (done || (shown && i === g.showIndex)) arrow(s, x, y, g.sequence[i], 9, SLOT.INK);
      else if (g.phase === 'input' && i === g.inputIndex && Math.floor(o.clock * 4) % 2) frame(s, x - 7, y - 7, 15, 15, SLOT.WHITE);
    }
    if (g.phase === 'gauge') drawGauge(s, g, o);
    const label = g.phase === 'gauge' ? '' : g.phase === 'input' ? 'YOUR TURN!' : g.phase === 'show' ? 'WATCH!' : g.taunt > 0 ? 'MISSED! NEW ORDER...' : g.gauge?.result === 'hit' && g.phase === 'pause' ? 'NICE TIMING!' : g.bossHp > 0 ? 'GET READY' : '';
    if (label) text(s, label, W / 2, 46, g.phase === 'input' ? SLOT.CYAN : SLOT.WHITE, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
}

function drawGauge(s, g, o) {
  const x0 = 80, w = 160, y = 62;
  rect(s, x0 - 3, y - 3, w + 6, 14, SLOT.INK);
  rect(s, x0, y, w, 8, SLOT.DARK);
  const [a, b] = g.gauge.zone;
  rect(s, x0 + a * w, y, (b - a) * w, 8, SLOT.CYAN);
  const m = gaugeMarker(g.gauge.t, g.boss.gaugePeriod);
  rect(s, x0 + m * w - 1, y - 4, 3, 16, SLOT.WHITE);
  rect(s, x0 + m * w, y - 3, 1, 14, SLOT.INK);
  text(s, 'PRESS SPACE ON THE GREEN!', W / 2, y + 16, Math.floor(o.clock * 4) % 2 ? SLOT.WHITE : SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Quick Draw (duck hunt)
// ---------------------------------------------------------------------------
function drawQuickdraw(s, view, g, o) {
  const Q = QUICKDRAW, G = 150;
  drawLandscape(s, view.land, o.clock * 6, o.clock, G);
  // the boss circles high above
  const bx = 258 + Math.sin(o.clock * 0.9) * 26, by = 60 + Math.sin(o.clock * 1.7) * 6;
  drawBoss(s, view, g, bx, by, { clock: o.clock * 2.5, shadow: false });
  // critters
  for (const c of g.critters) {
    const spr = view.minion.frame({ frame: Math.floor(o.clock * 8 + c.id) });
    if (c.falling) { blit(s, spr, c.x - 10, c.y - 10, { angle: (c.t + c.vy * 0.02) * c.spin * 3, map: null }); continue; }
    blit(s, spr, c.x - 10, c.y - 10, { flip: c.vx < 0 });
    if (c.x < 60 && Math.floor(o.clock * 8) % 2) text(s, '!', c.x, c.y - 18, SLOT.BAD, { align: 'center', shadow: SLOT.INK });   // about to escape
  }
  // shots
  for (const sh of g.shots) {
    if (sh.hit) { ring(s, sh.x, sh.y, 8 - sh.t * 16, SLOT.WHITE); ring(s, sh.x, sh.y, 10 - sh.t * 16, FX.SPARK); }
    else { ring(s, sh.x, sh.y, 4, SLOT.GRAY); pset(s, sh.x, sh.y, SLOT.GRAY); }
  }
  // foreground: a fence, the hero aiming
  rect(s, 0, G + 4, W, 2, ST.GROUND2);
  for (let x = 6; x < W; x += 22) { rect(s, x, G - 10, 3, 16, ST.DET1); }
  rect(s, 0, G - 6, W, 2, ST.DET1); rect(s, 0, G, W, 2, ST.DET1);
  const aiming = g.shots.some(sh => sh.hit && sh.t > 0.2);
  const spr = view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, spr, Q.heroX - HERO_W / 2, G + 20 - HERO_H);
  if (aiming) { const sh = g.shots.find(q => q.hit); line(s, Q.heroX + 3, G - 14, sh.x, sh.y, FX.FLASH); }
  // the crosshair (red while reloading)
  const a = g.aim, c = g.reload > 0 ? SLOT.BAD : SLOT.WHITE;
  ring(s, a.x + 0.5, a.y + 0.5, 6, SLOT.INK);
  ring(s, a.x + 0.5, a.y + 0.5, 5, c);
  for (const [dx, dy] of [[-9, 0], [6, 0], [0, -9], [0, 6]]) rect(s, a.x + dx, a.y + dy, dx ? 4 : 1, dy ? 4 : 1, c);
  pset(s, a.x, a.y, c);
}

// ---------------------------------------------------------------------------
// Avalanche Run (sled)
// ---------------------------------------------------------------------------
function drawSled(s, view, g, o) {
  const S = SLED;
  const travel = g.travelled;
  blit(s, view.snow.field, 0, 0);
  drawStripV(s, view.snow.field, 0, travel);
  drawStripV(s, view.snow.edge, -8, travel);
  drawStripV(s, view.snow.edge, W - 52, travel + 97);
  // lane guides
  for (const lx of [136, 184]) for (let y = (-travel % 16 + 16) % 16; y < H; y += 16) rect(s, lx, y, 1, 6, ST.GROUND1);
  // obstacles and ramps
  for (const ob of [...g.objects].sort((a, b) => a.y - b.y)) {
    const spr = slopeSprite(ob.kind);
    blit(s, spr, ob.x - spr.w / 2, ob.y - spr.h / 2);
    if (ob.kind === 'ramp' && !ob.used && Math.floor(o.clock * 6) % 2) arrow(s, ob.x, ob.y - 13, 'up', 7, SLOT.GOLD);   // ride over me!
  }
  // incoming snowballs: a shadow where they'll land, the ball arcing down from the boss
  for (const b of g.snowballs) {
    const k = b.t / b.flight;
    ring(s, b.x, S.heroY, 3 + k * 7, k > 0.7 && Math.floor(o.clock * 12) % 2 ? SLOT.BAD : ST.GROUND2);
    const x = g.bossX + (b.x - g.bossX) * k, y = S.bossY + 20 + (S.heroY - S.bossY - 20) * k - Math.sin(k * Math.PI) * 28;
    blit(s, snowballSprite(), x - 4, y - 4);
  }
  // the boss chases from the top
  drawBoss(s, view, g, g.bossX, S.bossY + BOSS_SIZE - 12 + Math.sin(o.clock * 6) * 2, { clock: o.clock, shadow: false });
  for (const t of g.throws) {
    const [x0, y0] = t.from, x = x0 + (g.bossX - x0) * t.t, y = y0 + (S.bossY + 20 - y0) * t.t - Math.sin(t.t * Math.PI) * 16;
    blit(s, snowballSprite(), x - 4, y - 4);
  }
  // the hero on the sled, seen from behind; airborne: higher, spinning, with a shadow
  const lift = g.airborne > 0 ? Math.sin((1 - g.airborne / S.air) * Math.PI) * 14 : 0;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  ellipse(s, g.x, S.heroY + 9, 9, 3, ST.GROUND2);
  if (!blink) {
    const angle = g.airborne > 0 ? g.spin * Math.PI * 2 : (g.wobble > 0 ? Math.sin(o.clock * 40) * 0.2 : 0);
    blit(s, sledSprite(), g.x - 8, S.heroY - 2 - lift, { angle });
    blit(s, view.hero.get('back', 'sit', 0, Math.floor(o.clock * 8) % 4), g.x - HERO_W / 2, S.heroY - HERO_H + 8 - lift, { angle });
  }
  if (g.wobble > 0 && g.airborne <= 0) text(s, 'OOF!', g.x + 14, S.heroY - 16, SLOT.BAD, { shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Star Beat (rhythm)
// ---------------------------------------------------------------------------
const LANE_COLORS = [FX.A, FX.B, FX.C, FX.D];

function drawStarbeat(s, view, g, o) {
  const B = STARBEAT, G = 160;
  drawLandscape(s, view.land, o.clock * 4, o.clock, G);
  // the note highway
  const x0 = B.lanes[0] - 12, x1 = B.lanes[3] + 12;
  rect(s, x0, 0, x1 - x0, G, SLOT.PANEL);
  for (let y = (Math.floor(g.time * 60) % 12); y < G; y += 12) hline(s, x0, x1 - 1, y, SLOT.SHADOW);   // scrolling guide lines
  for (let i = 0; i <= 4; i++) rect(s, x0 + i * 24, 0, 1, G, SLOT.DARK);
  hline(s, x0, x1 - 1, B.hitY, SLOT.WHITE);
  for (let i = 0; i < 4; i++) {
    const lx = B.lanes[i];
    if (g.pressed[i] > 0) rect(s, lx - 11, B.hitY - 8, 23, 16, LANE_COLORS[i]);
    for (const f of g.flashes) if (f.lane === i) { ring(s, lx, B.hitY, 10 - f.t * 20, f.perfect ? SLOT.WHITE : LANE_COLORS[i]); }
    drawKeyCap(s, lx, B.hitY + 15, B.labels[i], { scale: 1 });
  }
  for (const n of g.notes) {
    if (n.hit) continue;
    const y = noteY(n, g.time);
    if (y < -8 || y > G + 8) continue;
    blit(s, starSprite(LANE_COLORS[n.lane]), B.lanes[n.lane] - 6, y - 6, n.missed ? { map: INK } : {});
  }
  // the hero dances on the left, the boss sings on the right
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'dance', g.dancer % 2, Math.floor(o.clock * 8) % 4), 60 - HERO_W / 2, G - HERO_H + 1);
  drawBoss(s, view, g, 266, G, { clock: o.clock, lift: 6 + Math.sin(o.clock * 2) * 4 });
  if (g.streak >= 3) text(s, `${g.streak} STREAK`, 60, 110, SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}


// ---------------------------------------------------------------------------
// Tennis Match
// ---------------------------------------------------------------------------
function drawTennis(s, view, g, o) {
  const T = TENNIS;
  rect(s, 0, 0, W, H, ST.MID0);
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) pset(s, x, y, ST.MID1);
  // the court
  rect(s, T.left - 8, 14, T.right - T.left + 16, H - 18, ST.GROUND1);
  for (let y = 16; y < H - 6; y += 8) hline(s, T.left - 6, T.right + 5, y, (y / 8) % 2 ? ST.GROUND1 : ST.GROUND0);
  for (const x of [T.left, T.right]) rect(s, x - 1, 14, 2, H - 18, SLOT.WHITE);
  hline(s, T.left, T.right, T.bossY - 8, SLOT.WHITE);
  hline(s, T.left, T.right, T.heroY + 10, SLOT.WHITE);
  rect(s, 159, T.bossY - 8, 1, T.heroY - T.bossY + 18, SLOT.WHITE);
  // the net
  const netY = (T.heroY + T.bossY) / 2;
  rect(s, T.left - 6, netY - 1, T.right - T.left + 12, 4, SLOT.DARK);
  for (let x = T.left - 6; x < T.right + 6; x += 3) pset(s, x, netY, SLOT.GRAY);
  hline(s, T.left - 6, T.right + 5, netY - 2, SLOT.WHITE);
  // the boss (front) and the hero (from behind), each with a racket
  drawBoss(s, view, g, g.foe.x, T.bossY + 14, { clock: o.clock, shadow: false });
  racket(s, g.foe.x + 18, T.bossY + 4, g.foe.swing);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('back', 'idle', 0, Math.floor(o.clock * 8) % 4), g.hero.x - HERO_W / 2, T.heroY - HERO_H + 18);
  racket(s, g.hero.x + 13, T.heroY - 4, g.hero.swing);
  // the ball, with its shadow and a little bounce arc
  const b = g.ball;
  if (b) {
    const hgt = Math.abs(Math.sin(Math.min(1, b.t / 0.9) * Math.PI)) * 10;
    ellipse(s, b.x, b.y + 2, 3, 1.5, ST.GROUND2);
    ellipse(s, b.x, b.y - hgt, 2.6, 2.6, b.smash ? SLOT.GOLD : FX.SNOW);
    if (b.smash) for (let k = 1; k < 4; k++) pset(s, b.x - b.vx * 0.01 * k, b.y - hgt - b.vy * 0.01 * k, SLOT.GOLD);
  } else if (g.lastPoint && g.result === 'playing') {
    text(s, g.lastPoint === 'hero' ? 'POINT!' : 'OUT!', W / 2, 76, g.lastPoint === 'hero' ? SLOT.GOLD : SLOT.BAD, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
  if (g.rally >= 3) text(s, `RALLY ${g.rally}`, 10, H - 20, SLOT.GOLD, { shadow: SLOT.INK });
}

function racket(s, x, y, swing) {
  const a = swing > 0 ? -0.9 + (0.25 - swing) * 6 : -0.4;
  const hx = x + Math.cos(a) * 8, hy = y + Math.sin(a) * 8;
  line(s, x, y, hx, hy, SLOT.DARK);
  ellipse(s, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, 3.5, 3.5, SLOT.GOLD_DARK);
  ellipse(s, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, 2.2, 2.2, SLOT.KEY);
}

// ---------------------------------------------------------------------------
// Star Invaders
// ---------------------------------------------------------------------------
function drawInvaders(s, view, g, o) {
  const I = INVADERS, G = 168;
  drawLandscape(s, view.land, o.clock * 3, o.clock, G);
  drawBoss(s, view, g, g.foe.x, I.bossY + 22, { clock: o.clock, shadow: false });
  for (const m of g.minions) {
    if (!m.alive) continue;
    const p = g.minionAt(m);
    blit(s, view.minion.frame({ frame: Math.floor(o.clock * 4) + m.col }), p.x - 10, p.y - 10);
  }
  for (const b of g.bombs) {
    ellipse(s, b.x, b.y, b.big ? 4 : 2.5, b.big ? 4 : 2.5, SLOT.INK);
    ellipse(s, b.x, b.y, b.big ? 3 : 1.6, b.big ? 3 : 1.6, b.big ? BR.HORN : SLOT.BAD);
  }
  for (const sh of g.shots) { blit(s, starSprite(FX.A + (Math.floor(o.clock * 10) % 4)), sh.x - 6, sh.y - 6); }
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  // the hero on a little hover-cloud
  ellipse(s, g.hero.x, I.heroY + 6, 13, 4, ST.CLOUD1);
  ellipse(s, g.hero.x, I.heroY + 4, 11, 3.5, ST.CLOUD0);
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4), g.hero.x - HERO_W / 2 - 2, I.heroY - HERO_H + 6);
  hline(s, 0, W - 1, I.groundY + 10, ST.GROUND2);
}

// ---------------------------------------------------------------------------
// Spellslinger (run & gun)
// ---------------------------------------------------------------------------
function drawFireball(s, view, g, o) {
  const F = FIREBALL, G = F.ground;
  drawLandscape(s, view.land, o.clock * 20, o.clock, G);
  // the boss floats at the right, shielded unless it's just attacked
  const by = G - g.bossLift;
  drawBoss(s, view, g, F.bossX, by, { clock: o.clock, shadow: false });
  ellipse(s, F.bossX, G - 1, 14, 3, ST.GROUND2);
  if (g.open <= 0 && g.result === 'playing') { ring(s, F.bossX, by - 24, 29, FX.C); if (Math.floor(o.clock * 6) % 2) ring(s, F.bossX, by - 24, 30, FX.SPARK); }
  for (const f of g.foes) {
    if (f.kind === 'goo') {
      const x = f.x, y = G - 4;
      ellipse(s, x, y, 7, 4.5, SLOT.INK); ellipse(s, x, y, 6, 3.5, BR.BELLY); pset(s, x - 2, y - 2, SLOT.WHITE);
      continue;
    }
    const fy = f.kind === 'flyer' ? G - f.y : G - f.y - 7;
    blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), f.x - 10, fy - 10, { flip: true });
  }
  for (const b of g.bolts) {
    for (let k = 1; k < 4; k++) rect(s, b.x - k * 4, b.y - 1 + (k % 2), 2, 2, [SLOT.GOLD, SLOT.RED, FX.D][k - 1]);
    ellipse(s, b.x, b.y, 3.5, 3, SLOT.RED); ellipse(s, b.x + 0.5, b.y, 2, 1.8, SLOT.GOLD);
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const moving = g.held.has('ArrowLeft') || g.held.has('ArrowRight') || g.held.has('KeyA') || g.held.has('KeyD');
    const pose = !h.grounded ? (h.vy > 0 ? 'jump' : 'fall') : moving ? 'run' : 'idle';
    ellipse(s, h.x, G, 7 - Math.min(5, h.y / 12), 2, ST.GROUND2);
    blit(s, view.hero.get('side', pose, Math.floor(o.clock * 10) % 4, Math.floor(o.clock * 8) % 4), h.x - HERO_W / 2, G - HERO_H + 1 - h.y, { flip: h.facing < 0 });
    if (h.cast > 0) ellipse(s, h.x + 10, G - h.y - 14, 4 * h.cast / 0.18 + 1, 4 * h.cast / 0.18 + 1, SLOT.GOLD);
  }
}

// ---------------------------------------------------------------------------
// Cloud Hop (doodle jump)
// ---------------------------------------------------------------------------
function drawDoodle(s, view, g, o) {
  const D = DOODLE;
  const toScreen = y => H - 16 - (y - g.camera);
  drawSky(s, H);
  drawStrip(s, view.land.clouds, 20 + ((g.camera * 0.2) % 60), o.clock * 3);
  // far layer sinks away as you climb
  const farY = H - 40 + g.camera * 0.15;
  if (farY < H) drawStrip(s, view.land.far, farY, 0);
  for (const c of g.clouds) {
    if (c.popped) continue;
    const y = toScreen(c.y);
    if (y < -10 || y > H + 10) continue;
    for (const dx of [0, -D.width, D.width]) {
      const x = c.x + dx;
      if (x < -30 || x > W + 30) continue;
      const body = c.kind === 'thin' ? ST.CLOUD1 : ST.CLOUD0;
      ellipse(s, x, y + 3, D.cloudW / 2 + 1, 5, SLOT.INK);
      ellipse(s, x, y + 3, D.cloudW / 2, 4, body);
      ellipse(s, x - 7, y + 1, 7, 4, body); ellipse(s, x + 6, y + 1, 8, 4.5, body);
      if (c.kind === 'thin') for (let k = -14; k < 15; k += 4) pset(s, x + k, y + 4, SLOT.GRAY);
      if (c.kind === 'drift') { pset(s, x - 15, y + 3, SLOT.CYAN); pset(s, x + 15, y + 3, SLOT.CYAN); }
      if (c.kind === 'spring') { rect(s, x - 3, y - 4, 7, 4, SLOT.GRAY); hline(s, x - 3, x + 3, y - 5, SLOT.GOLD); hline(s, x - 3, x + 3, y - 2, SLOT.GOLD); }
    }
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const spr = view.hero.get('front', h.vy > 120 ? 'up' : h.vy > 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4);
    for (const dx of [0, -D.width, D.width]) blit(s, spr, h.x + dx - HERO_W / 2, toScreen(h.y) - HERO_H + 1);
  }
  text(s, `${Math.floor(g.best / D.meter) * 10} M`, 10, H - 12, SLOT.WHITE, { scale: 1, shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Flap Dash (flappy)
// ---------------------------------------------------------------------------
function drawFlappy(s, view, g, o) {
  const F = FLAPPY, G = 158;
  drawLandscape(s, view.land, g.scroll, o.clock, G);
  for (const p of g.pillars) {
    const x = Math.round(p.x - F.pillarW / 2), top = p.gapY - p.gap / 2, bottom = p.gapY + p.gap / 2;
    for (const [y0, y1] of [[0, top], [bottom, G]]) {
      rect(s, x - 1, y0, F.pillarW + 2, y1 - y0, SLOT.INK);
      rect(s, x, y0, F.pillarW, y1 - y0, ST.MID1);
      rect(s, x + 3, y0, 4, y1 - y0, ST.MID0);
      rect(s, x + F.pillarW - 5, y0, 2, y1 - y0, ST.FAR1);
    }
    rect(s, x - 4, top - 7, F.pillarW + 8, 7, SLOT.INK); rect(s, x - 3, top - 6, F.pillarW + 6, 5, ST.DET0);
    rect(s, x - 4, bottom, F.pillarW + 8, 7, SLOT.INK); rect(s, x - 3, bottom + 1, F.pillarW + 6, 5, ST.DET0);
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    // the balloon kite that keeps our hero aloft
    const bx = F.heroX + 2, by = h.y - 24 - (h.flap > 0 ? 2 : 0);
    line(s, F.heroX, h.y - 12, bx, by + 7, SLOT.GRAY);
    ellipse(s, bx, by, 7.5, 8.5, SLOT.INK); ellipse(s, bx, by, 6.5, 7.5, HR.ACCENT); pset(s, bx - 3, by - 3, SLOT.WHITE);
    blit(s, view.hero.get('side', h.flap > 0 ? 'jump' : 'fall', 0, Math.floor(o.clock * 8) % 4), F.heroX - HERO_W / 2, h.y - HERO_H + 14, { angle: Math.max(-0.4, Math.min(0.6, h.vy / 500)) });
  }
  if (g.waiting && g.result === 'playing') text(s, 'PRESS SPACE TO FLAP!', W / 2, 120, Math.floor(o.clock * 3) % 2 ? SLOT.WHITE : SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Block Drop (falling blocks)
// ---------------------------------------------------------------------------
const BLOCK_COLOR = { I: SLOT.CYAN, O: SLOT.GOLD, T: FX.A, S: FX.B, Z: SLOT.RED, J: FX.C, L: FX.D };

function block(s, x, y, c, size) {
  rect(s, x, y, size, size, SLOT.INK);
  rect(s, x + 1, y + 1, size - 2, size - 2, c);
  hline(s, x + 1, x + size - 3, y + 1, SLOT.WHITE);
}

function drawTetris(s, view, g, o) {
  const T = TETRIS, G = 168, c = T.cell;
  drawLandscape(s, view.land, o.clock * 4, o.clock, G);
  const x0 = T.left, y0 = T.top, w = T.cols * c, h = T.rows * c;
  rect(s, x0 - 3, y0 - 3, w + 6, h + 6, SLOT.INK);
  rect(s, x0 - 2, y0 - 2, w + 4, h + 4, SLOT.GRAY);
  rect(s, x0, y0, w, h, SLOT.PANEL);
  for (let cx = 1; cx < T.cols; cx++) for (let cy = 0; cy < T.rows; cy += 2) pset(s, x0 + cx * c, y0 + cy * c, SLOT.DARK);
  g.well.forEach((row, r) => row.forEach((kind, col) => { if (kind) block(s, x0 + col * c, y0 + r * c, BLOCK_COLOR[kind], c); }));
  for (const fl of g.cleared) rect(s, x0, y0 + fl.row * c, w, c, Math.floor(fl.t * 20) % 2 ? SLOT.WHITE : SLOT.GOLD);
  if (g.piece) {
    const p = g.piece;
    // ghost: where it would land
    let gy = p.y;
    while (g.fits({ ...p, y: gy + 1 })) gy++;
    for (const [cx, cy] of cellsOf(p.kind, p.rot)) if (gy + cy >= 0) { const X = x0 + (p.x + cx) * c, Y = y0 + (gy + cy) * c; rect(s, X + 1, Y + 1, c - 2, 1, SLOT.GRAY); rect(s, X + 1, Y + c - 2, c - 2, 1, SLOT.GRAY); }
    for (const [cx, cy] of cellsOf(p.kind, p.rot)) if (p.y + cy >= 0) block(s, x0 + (p.x + cx) * c, y0 + (p.y + cy) * c, BLOCK_COLOR[p.kind], c);
  }
  // next piece
  rect(s, x0 + w + 10, y0, 40, 34, SLOT.PANEL);
  text(s, 'NEXT', x0 + w + 30, y0 + 3, SLOT.WHITE, { align: 'center' });
  if (g.next) for (const [cx, cy] of cellsOf(g.next, 0)) block(s, x0 + w + 14 + cx * 7, y0 + 12 + cy * 7, BLOCK_COLOR[g.next], 7);
  // the hero cheers on every line
  const cheering = g.cleared.length > 0 || g.bossHp <= 0;
  blit(s, view.hero.get('front', cheering ? 'cheer' : g.invulnerable > 0 ? 'down' : 'idle', 0, Math.floor(o.clock * 8) % 4), 62 - HERO_W / 2, G - HERO_H + 1);
  text(s, `${g.lines} LINES`, 62, G - HERO_H - 8, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
}


// ---------------------------------------------------------------------------
// Brick Breaker
// ---------------------------------------------------------------------------
function drawBreakout(s, view, g, o) {
  const B = BREAKOUT;
  drawSky(s, H);
  drawStrip(s, view.land.far, H - 70, o.clock * 3);
  rect(s, B.left - 3, B.top - 3, B.right - B.left + 6, H - B.top, SLOT.INK);
  dither(s, B.left, B.top, B.right - B.left, H - B.top - 3, ST.SKY0, ST.SKY1, 0.35);
  drawBoss(s, view, g, g.foe.x, B.bossY + 22, { clock: o.clock, shadow: false });
  const colors = [ST.DET0, ST.DET2, ST.MID0];
  for (const br of g.bricks) {
    const c = g.brickAt(br.col, br.row);
    rect(s, c.x - B.brickW / 2, c.y - B.brickH / 2, B.brickW - 1, B.brickH - 1, SLOT.INK);
    rect(s, c.x - B.brickW / 2 + 1, c.y - B.brickH / 2 + 1, B.brickW - 3, B.brickH - 3, colors[br.row % 3]);
    hline(s, c.x - B.brickW / 2 + 1, c.x + B.brickW / 2 - 3, c.y - B.brickH / 2 + 1, SLOT.WHITE);
  }
  for (const goo of g.goo) { ellipse(s, goo.x, goo.y, 4, 5, SLOT.INK); ellipse(s, goo.x, goo.y, 3, 4, BR.BELLY); }
  const p = g.paddle;
  const pc = p.stun > 0 && Math.floor(o.clock * 16) % 2 ? SLOT.GRAY : HR.ACCENT;
  rect(s, p.x - B.paddleW / 2 - 1, B.paddleY - 1, B.paddleW + 2, 6, SLOT.INK);
  rect(s, p.x - B.paddleW / 2, B.paddleY, B.paddleW, 4, pc);
  hline(s, p.x - B.paddleW / 2, p.x + B.paddleW / 2 - 1, B.paddleY, SLOT.WHITE);
  const ball = g.ball || (g.ready ? { x: g.paddle.x, y: B.paddleY - 8 } : null);
  if (ball) { ellipse(s, ball.x, ball.y, B.ball + 1, B.ball + 1, SLOT.INK); ellipse(s, ball.x, ball.y, B.ball, B.ball, SLOT.WHITE); }
  if (g.ready && Math.floor(o.clock * 2) % 2 === 0) banner(s, 'SPACE: LAUNCH', 124, SLOT.WHITE, 1);
  // the hero cheers from the side
  blit(s, view.hero.get('front', g.bossHp <= 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4), 4, H - HERO_H - 2);
}

// ---------------------------------------------------------------------------
// Cannon Duel
// ---------------------------------------------------------------------------
function drawCannon(s, view, g, o) {
  const C = CANNON;
  drawSky(s, H);
  drawStrip(s, view.land.clouds, 6, o.clock * 4);
  drawStrip(s, view.land.far, 70, 0);
  for (let x = 0; x < W; x++) { const y = Math.round(hillY(x)); rect(s, x, y, 1, H - y, ST.GROUND1); pset(s, x, y, ST.GROUND0); pset(s, x, y + 1, ST.GROUND0); }
  // wind flag
  if (g.boss.wind) {
    rect(s, 150, 20, 1, 18, SLOT.DARK);
    const len = Math.round(g.wind / 3);
    rect(s, len < 0 ? 150 + len : 151, 20, Math.abs(len) + 1, 5, SLOT.RED);
    text(s, 'WIND', 150, 40, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  }
  drawBoss(s, view, g, C.bossX, C.bossY + 4, { clock: o.clock });
  // the hero and the cannon
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('side', 'idle', 0, Math.floor(o.clock * 8) % 4), h.x - HERO_W / 2 - 8, C.ground - HERO_H + 1);
  const bx = h.x + 6, by = C.ground - 8;
  for (let k = 0; k < 14; k++) rect(s, bx + Math.cos(h.angle) * k - 2, by - Math.sin(h.angle) * k - 2, 5, 5, k > 10 ? SLOT.DARK : SLOT.GRAY);
  ellipse(s, bx, by + 3, 5, 5, SLOT.INK); ellipse(s, bx, by + 3, 4, 4, SLOT.GOLD_DARK);
  // aim dots and the power bar
  for (let k = 1; k <= 4; k++) pset(s, bx + Math.cos(h.angle) * (16 + k * 6), by - Math.sin(h.angle) * (16 + k * 6), SLOT.WHITE);
  rect(s, 8, 150, 6, 24, SLOT.INK); rect(s, 9, 151 + 22 * (1 - g.power()), 4, 22 * g.power(), g.power() > 0.85 ? SLOT.BAD : SLOT.GOLD);
  if (g.lastShot) { pset(s, g.lastShot.x, g.lastShot.y - 2, SLOT.WHITE); pset(s, g.lastShot.x - 1, g.lastShot.y - 3, SLOT.WHITE); pset(s, g.lastShot.x + 1, g.lastShot.y - 3, SLOT.WHITE); }
  for (const sh of g.shells) { ellipse(s, sh.x, sh.y, 3, 3, SLOT.INK); ellipse(s, sh.x, sh.y, 2, 2, sh.mine ? SLOT.GOLD : BR.HORN); }
  for (const sh of g.shells) if (!sh.mine) ring(s, sh.target, C.ground - 1, 3 + (1 - Math.min(1, (C.ground - sh.y) / 100)) * 8, SLOT.BAD);
  for (const b of g.blasts) { ring(s, b.x, b.y, 12 - b.t * 20, FX.SPARK); ring(s, b.x, b.y, 8 - b.t * 12, SLOT.GOLD); }
}

// ---------------------------------------------------------------------------
// Whack-a-Critter
// ---------------------------------------------------------------------------
function drawWhack(s, view, g, o) {
  const Wk = WHACK;
  drawLandscape(s, view.land, 0, o.clock, 64);
  rect(s, 0, 64, W, H - 64, ST.GROUND1);
  for (let i = 0; i < 9; i++) {
    const p = g.holeAt(i), h = g.holes[i];
    ellipse(s, p.x, p.y + 6, 17, 6, ST.GROUND2);
    ellipse(s, p.x, p.y + 6, 14, 4, SLOT.INK);
    if (h) {
      const rise = Math.min(1, (h.up - h.t) / 0.15, h.t / 0.15);
      const lift = Math.round(rise * 14);
      const y = p.y + 6 - lift;
      if (h.kind === 'boss') blitClip(s, halfSprite(view, h.whacked ? 'hurt' : 'attack', Math.floor(o.clock * 4)), p.x - 12, y - 22, p.y + 6);
      else if (h.kind === 'bomb') { ellipse(s, p.x, y - 6, 7, 7, SLOT.INK); ellipse(s, p.x, y - 6, 6, 6, SLOT.DARK); rect(s, p.x + 2, y - 15, 2, 4, SLOT.GOLD); pset(s, p.x + 4, y - 16, Math.floor(o.clock * 10) % 2 ? SLOT.RED : SLOT.GOLD); }
      else blitClip(s, view.minion.frame({ frame: Math.floor(o.clock * 6) + i }), p.x - 10, y - 18, p.y + 6, { map: h.whacked ? solidMap(SLOT.WHITE) : null });
      ellipse(s, p.x, p.y + 8, 16, 3, ST.GROUND1);
    }
    text(s, Wk.labels[i], p.x, p.y + 12, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  }
  for (const sw of g.swings) {
    const p = g.holeAt(sw.hole);
    const a = (sw.t / 0.18) * 1.2;
    line(s, p.x + 14, p.y - 20, p.x + 14 - Math.cos(a) * 12, p.y - 20 + Math.sin(a) * 10 + 12, SLOT.GOLD_DARK);
    rect(s, p.x + 2 - Math.cos(a) * 6, p.y - 10 + Math.sin(a) * 6, 10, 7, sw.hit ? SLOT.RED : SLOT.GRAY);
  }
  blit(s, view.hero.get('front', 'aim', 0, Math.floor(o.clock * 8) % 4), 24, H - HERO_H - 2);
  if (g.escapes % 3) text(s, `${g.escapes % 3}/3 GOT AWAY`, 268, H - 10, SLOT.BAD, { align: 'center', shadow: SLOT.INK });
}

/** The boss at half size (cached per pose / frame). */
function halfSprite(view, pose, frameIndex) {
  view.halves ||= new Map();
  const key = `${pose}|${frameIndex % 2}`;
  if (!view.halves.has(key)) {
    const spr = view.monster.frame({ pose, frame: frameIndex });
    const out = createSurface(spr.w / 2, spr.h / 2);
    for (let j = 0; j < out.h; j++) for (let i = 0; i < out.w; i++) out.buf[j * out.w + i] = spr.buf[(j * 2) * spr.w + i * 2] || spr.buf[(j * 2 + 1) * spr.w + i * 2 + 1];
    view.halves.set(key, out);
  }
  return view.halves.get(key);
}

/** Blit a sprite but cut it off below a line (a critter poking out of a hole). */
function blitClip(s, spr, x, y, clipY, { map = null } = {}) {
  for (let j = 0; j < spr.h; j++) {
    const yy = Math.round(y) + j;
    if (yy >= clipY || yy < 0 || yy >= H) continue;
    for (let i = 0; i < spr.w; i++) {
      let c = spr.buf[j * spr.w + i];
      if (!c) continue;
      if (map) c = map[c];
      pset(s, x + i, yy, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Gone Fishing
// ---------------------------------------------------------------------------
function drawFishing(s, view, g, o) {
  const F = FISHING;
  drawLandscape(s, view.land, 0, o.clock, F.waterY);
  rect(s, 0, F.waterY, W, H - F.waterY, ST.SKY2);
  for (let y = F.waterY + 4; y < H; y += 6) for (let x = ((y * 7 + Math.floor(o.clock * 20)) % 24); x < W; x += 24) hline(s, x, x + 6, y, ST.SKY1);
  // the pier and the hero
  rect(s, 0, F.waterY - 4, 96, 6, SLOT.GOLD_DARK); for (let x = 10; x < 96; x += 22) rect(s, x, F.waterY + 2, 4, 30, SLOT.GOLD_DARK);
  blit(s, view.hero.get('side', g.phase === 'reeling' ? 'stumble' : 'idle', 0, Math.floor(o.clock * 8) % 4), 56, F.waterY - 4 - HERO_H);
  const tipX = 90, tipY = F.waterY - 40;
  line(s, 70, F.waterY - 20, tipX, tipY, SLOT.GOLD_DARK);
  const bob = g.phase === 'bite' ? 3 + Math.round(Math.sin(o.clock * 30)) : Math.round(Math.sin(o.clock * 3));
  if (g.phase !== 'idle') {
    const bx = F.bobberX, by = F.waterY + bob;
    line(s, tipX, tipY, bx, by - 3, SLOT.WHITE);
    ellipse(s, bx, by, 3, 3, SLOT.RED); rect(s, bx - 2, by - 4, 4, 2, SLOT.WHITE);
    if (g.phase === 'bite') text(s, '!', bx, by - 16, SLOT.GOLD, { scale: 3, align: 'center', shadow: SLOT.INK });
    if (g.phase === 'reeling') {
      // the boss (or a fish) tugging under the water
      if (g.boss.kind !== 'checkpoint') blitClip(s, view.monster.frame({ pose: 'attack', frame: Math.floor(o.clock * 4) }), bx - 24, F.waterY + 18 + Math.sin(o.clock * 5) * 3, H);
      else blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), bx - 10 + Math.sin(o.clock * 7) * 4, F.waterY + 16, { flip: true });
    }
  }
  if (g.phase === 'reeling') {
    const x0 = 110, w = 150, y = 24;
    rect(s, x0 - 2, y - 2, w + 4, 12, SLOT.INK); rect(s, x0, y, w, 8, SLOT.DARK);
    rect(s, x0 + (g.fish - g.boss.zone) * w, y, g.boss.zone * 2 * w, 8, SLOT.CYAN);
    rect(s, x0 + g.fish * w - 1, y - 3, 3, 14, SLOT.GOLD);
    rect(s, x0 + g.tension * w - 1, y - 4, 2, 16, g.red > 0 ? SLOT.BAD : SLOT.WHITE);
    text(s, 'TENSION', x0, y + 12, SLOT.WHITE, { shadow: SLOT.INK });
    rect(s, x0, y + 20, w, 4, SLOT.DARK); rect(s, x0, y + 20, w * g.catch, 4, SLOT.GOLD);
    text(s, 'HOLD SPACE TO REEL', x0 + w, y + 12, SLOT.GOLD, { align: 'right', shadow: SLOT.INK });
  } else if (g.phase === 'idle') text(s, g.lastResult === 'caught' ? 'GOT IT! SPACE TO CAST' : g.lastResult ? `${g.lastResult === 'snap' ? 'SNAP!' : g.lastResult === 'early' ? 'TOO EARLY!' : g.lastResult === 'late' ? 'TOO LATE!' : 'IT GOT AWAY!'} SPACE TO CAST` : 'SPACE TO CAST', W / 2, 30, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  else if (g.phase === 'waiting') text(s, 'WAIT FOR THE BITE...', W / 2, 30, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Maze Muncher
// ---------------------------------------------------------------------------
function drawMaze(s, view, g, o) {
  const M = MAZE, c = M.cell;
  clear(s, SLOT.PANEL);
  for (let y = 0; y < M.rows; y++) for (let x = 0; x < M.cols; x++) {
    const px = M.left + x * c, py = M.top + y * c;
    if (g.walls[y][x]) { rect(s, px, py, c, c, ST.MID1); rect(s, px + 1, py + 1, c - 2, c - 2, ST.MID0); continue; }
    const gem = g.gems.get(`${x},${y}`);
    if (gem === 'gem') { rect(s, px + c / 2 - 1, py + c / 2 - 1, 3, 3, SLOT.GOLD); }
    else if (gem === 'power') { const r = 3 + (Math.floor(o.clock * 4) % 2); ellipse(s, px + c / 2, py + c / 2, r, r, SLOT.CYAN); }
  }
  const at = m => { const p = g.pos(m); return [M.left + p.x * c + c / 2, M.top + p.y * c + c / 2]; };
  for (const m of g.ghosts) {
    const [x, y] = at(m);
    const spr = view.minion.frame({ frame: Math.floor(o.clock * 6) });
    blit(s, spr, x - 10, y - 11, { map: g.scared > 0 ? (g.scared < 1.5 && Math.floor(o.clock * 8) % 2 ? WHITE : solidMap(SLOT.CYAN)) : null });
  }
  if (g.foe) { const [x, y] = at(g.foe); const spr = view.monster.frame({ pose: g.scared > 0 ? 'hurt' : 'idle', frame: Math.floor(o.clock * 3) }); blitHalf(s, spr, x - 12, y - 14); }
  const [hx, hy] = at(g.hero);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blitHalf(s, view.hero.get('front', 'idle', 0, Math.floor(o.clock * 8) % 4), hx - 7, hy - 12);
}

/** A sprite at half size (nearest neighbour), for the maze. */
function blitHalf(s, spr, x, y) {
  for (let j = 0; j < spr.h; j += 2) for (let i = 0; i < spr.w; i += 2) {
    const c = spr.buf[j * spr.w + i] || spr.buf[j * spr.w + i + 1] || spr.buf[(j + 1) * spr.w + i];
    if (c) pset(s, x + i / 2, y + j / 2, c);
  }
}

// ---------------------------------------------------------------------------
// Road Hop
// ---------------------------------------------------------------------------
function drawFrogger(s, view, g, o) {
  const F = FROGGER, c = F.cell;
  drawSky(s, 40);
  const x0 = F.left, rowY = r => F.bottom - r * c;
  for (let r = 0; r < F.rows; r++) {
    const lane = g.lanes[r], y = rowY(r) - c;
    const color = !lane ? ST.GROUND0 : lane.kind === 'road' ? SLOT.DARK : ST.SKY2;
    rect(s, x0, y, g.width, c, color);
    if (lane?.kind === 'road') for (let x = 0; x < g.width; x += 12) rect(s, x0 + x, y + c / 2, 6, 1, SLOT.GRAY);
    if (lane?.kind === 'river') for (let x = (Math.floor(o.clock * 10 + r * 5) % 16); x < g.width; x += 16) rect(s, x0 + x, y + 4 + (x % 3) * 3, 4, 1, ST.SKY1);
    if (!lane) for (let x = 3; x < g.width; x += 9) pset(s, x0 + x, y + 4 + (x % 5), ST.GROUND2);
    for (const it of g.itemsAt(r)) {
      if (it.x + it.w < 0 || it.x > g.width) continue;
      if (lane.kind === 'road') { rect(s, x0 + it.x, y + 3, it.w, c - 6, SLOT.INK); rect(s, x0 + it.x + 1, y + 4, it.w - 2, c - 8, [FX.A, FX.B, FX.C][r % 3]); rect(s, x0 + it.x + 2, y + c - 4, 3, 2, SLOT.INK); rect(s, x0 + it.x + it.w - 5, y + c - 4, 3, 2, SLOT.INK); }
      else { rect(s, x0 + it.x, y + 2, it.w, c - 4, SLOT.INK); rect(s, x0 + it.x + 1, y + 3, it.w - 2, c - 6, SLOT.GOLD_DARK); hline(s, x0 + it.x + 2, x0 + it.x + it.w - 3, y + 5, SLOT.GOLD); }
    }
  }
  rect(s, 0, 40, x0, H - 40, ST.MID1); rect(s, x0 + g.width, 40, W - x0 - g.width, H - 40, ST.MID1);
  const h = g.hero;
  const hop = h.hop > 0 ? Math.sin((1 - h.hop / F.hop) * Math.PI) * 4 : 0;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blitHalf(s, view.hero.get('back', 'idle', 0, Math.floor(o.clock * 8) % 4), x0 + h.x - 7, rowY(h.row) - c - 4 - hop);
  text(s, `${g.crossings}/${g.boss.hp}`, 6, 6 + 20, SLOT.WHITE, { shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
// Moon Lander
// ---------------------------------------------------------------------------
function drawLander(s, view, g, o) {
  const L = LANDER;
  clear(s, ST.SKY0);
  for (const [x, y, p] of view.land.stars) if (Math.sin(o.clock * (1 + p * 3) + p * 10) > -0.5) pset(s, x, y, p > 0.7 ? ST.SUN : ST.CLOUD0);
  ellipse(s, 270, 34, 16, 16, ST.SUN);
  for (let x = 0; x < W; x++) { const y = Math.round(groundAt(g, x)); rect(s, x, y, 1, H - y, ST.GROUND1); pset(s, x, y, ST.GROUND0); if ((x * 7) % 23 === 0) pset(s, x, y + 4, ST.GROUND2); }
  g.pads.forEach((p, i) => {
    const lit = i === g.target;
    rect(s, p.x - p.w / 2, p.y, p.w, 3, lit && Math.floor(o.clock * 4) % 2 ? SLOT.GOLD : SLOT.GRAY);
    if (lit) { arrow(s, p.x, p.y - 10 + Math.round(Math.sin(o.clock * 4) * 2), 'down', 7, SLOT.GOLD); }
  });
  const sh = g.ship;
  if (sh && !g.crash) {
    const a = sh.angle;
    const body = [[0, -8], [6, 2], [-6, 2]].map(([x, y]) => [sh.x + x * Math.cos(a) - y * Math.sin(a), sh.y + x * Math.sin(a) + y * Math.cos(a)]);
    poly(s, body, SLOT.GRAY);
    ellipse(s, sh.x, sh.y - 2, 3, 3, SLOT.CYAN);
    for (const side of [-1, 1]) line(s, sh.x + side * 4, sh.y + 2, sh.x + side * 7, sh.y + 6, SLOT.WHITE);
    if (sh.burning) { const f = 3 + Math.floor(o.clock * 30) % 3; rect(s, sh.x - 1, sh.y + 3, 3, f, SLOT.GOLD); pset(s, sh.x, sh.y + 3 + f, SLOT.RED); }
    if (sh.side) rect(s, sh.x - sh.side * 8, sh.y - 2, 2, 2, SLOT.GOLD);
    // gauges: fuel and speed (green = slow enough)
    const speed = Math.hypot(sh.vx, sh.vy);
    rect(s, 8, 24, 40, 4, SLOT.DARK); rect(s, 8, 24, 40 * sh.fuel / g.boss.fuel, 4, SLOT.GOLD);
    text(s, 'FUEL', 8, 30, SLOT.WHITE, { shadow: SLOT.INK });
    rect(s, 8, 40, 40, 4, SLOT.DARK); rect(s, 8, 40, Math.min(40, speed), 4, speed <= L.safeSpeed ? SLOT.CYAN : SLOT.BAD);
    text(s, 'SPEED', 8, 46, SLOT.WHITE, { shadow: SLOT.INK });
  }
  if (g.crash) { ring(s, g.crash.x, g.crash.y, 12 - g.crash.t * 16, SLOT.GOLD); ring(s, g.crash.x, g.crash.y, 7 - g.crash.t * 8, SLOT.RED); }
  blit(s, view.hero.get('front', g.landed > 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4), W - HERO_W - 4, H - HERO_H - 2);
}

// ---------------------------------------------------------------------------
// Travel: River Raft, Mine Cart, Snowmobile, Biplane
// ---------------------------------------------------------------------------
function drawRaft(s, view, g, o) {
  const R = RAFT;
  clear(s, ST.GROUND0);
  for (let y = 0; y < H; y++) {
    const d = g.travelled + (y - R.raftY);
    const { c, half } = riverAt(g, d);
    rect(s, 0, y, c - half - 3, 1, ST.MID0);
    rect(s, c - half - 3, y, 3, 1, ST.GROUND2);
    rect(s, c - half, y, half * 2, 1, ST.SKY2);
    rect(s, c + half, y, 3, 1, ST.GROUND2);
    rect(s, c + half + 3, y, W, 1, ST.MID0);
    if (((y + Math.floor(g.travelled)) % 14) === 0) { pset(s, c - half * 0.5, y, ST.SKY1); pset(s, c + half * 0.3, y, ST.SKY1); }
    if (((y * 13 + Math.floor(g.travelled)) % 37) === 0) { rect(s, c - half - 20, y, 4, 4, ST.MID1); rect(s, c + half + 14, y, 4, 4, ST.MID1); }
  }
  for (const ob of g.objects) {
    const y = g.yOf(ob.d);
    if (y < -20 || y > H + 20) continue;
    if (ob.kind === 'whirl') { const r = ob.r; ring(s, ob.x, y, r * 0.9, ST.SKY1); ring(s, ob.x, y, r * 0.55, ST.SKY0); ring(s, ob.x, y, r * 0.25, SLOT.WHITE); }
    else if (ob.kind === 'rock') { ellipse(s, ob.x, y, ob.r + 1, ob.r * 0.7 + 1, SLOT.INK); ellipse(s, ob.x, y, ob.r, ob.r * 0.7, SLOT.GRAY); ellipse(s, ob.x - 2, y - 2, ob.r * 0.4, ob.r * 0.3, FX.SNOW); }
    else { rect(s, ob.x - ob.r, y - 3, ob.r * 2, 7, SLOT.INK); rect(s, ob.x - ob.r + 1, y - 2, ob.r * 2 - 2, 5, SLOT.GOLD_DARK); hline(s, ob.x - ob.r + 2, ob.x + ob.r - 3, y - 1, SLOT.GOLD); }
  }
  for (const st of g.strokes) ring(s, st.x, R.raftY + 4, 3 + (0.4 - st.t) * 14, SLOT.WHITE);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  rect(s, g.x - R.halfWidth - 1, R.raftY - 6, R.halfWidth * 2 + 2, 16, SLOT.INK);
  for (let k = 0; k < 4; k++) rect(s, g.x - R.halfWidth + k * 5, R.raftY - 5, 4, 14, SLOT.GOLD_DARK);
  hline(s, g.x - R.halfWidth, g.x + R.halfWidth - 1, R.raftY - 2, SLOT.GOLD);
  if (!blink) blitHalf(s, view.hero.get('back', 'sit', 0, Math.floor(o.clock * 8) % 4), g.x - 7, R.raftY - 14);
}

function drawMinecart(s, view, g, o) {
  const M = MINECART;
  clear(s, ST.FAR1);
  // the mine: rock walls with lanterns, rails
  for (let x = 0; x < W; x += 8) { rect(s, x, 0, 8, 18 + ((x * 7 + Math.floor(g.travelled * 0.5)) % 9), ST.FAR0); }
  for (let k = 0; k < 4; k++) { const lx = ((k * 97 - g.travelled * 0.5) % 400 + 400) % 400 - 40; rect(s, lx, 34, 2, 8, SLOT.DARK); ellipse(s, lx + 1, 46, 3, 3, SLOT.GOLD); }
  rect(s, 0, M.rail + 6, W, H - M.rail - 6, ST.GROUND2);
  const railAt = x => { for (const h of g.hazards) if (h.kind === 'gap' && Math.abs(g.screenX(h.x) - x) < h.w / 2) return false; return true; };
  for (let x = 0; x < W; x++) {
    if (!railAt(x)) continue;
    pset(s, x, M.rail, SLOT.GRAY); pset(s, x, M.rail + 1, SLOT.DARK);
    if (((x + Math.floor(g.travelled)) % 12) < 3) rect(s, x, M.rail + 2, 1, 4, SLOT.GOLD_DARK);
  }
  for (const h of g.hazards) {
    const x = g.screenX(h.x);
    if (x < -30 || x > W + 30) continue;
    if (h.kind === 'beam') { rect(s, x - h.w / 2, 0, h.w, M.rail - 18, SLOT.INK); rect(s, x - h.w / 2 + 1, 0, h.w - 2, M.rail - 19, SLOT.GOLD_DARK); rect(s, x - h.w / 2 - 4, M.rail - 22, h.w + 8, 4, SLOT.GOLD_DARK); }
    else if (h.kind === 'bat') { const y = M.rail - (19 + Math.sin(g.time * 6 + h.phase) * 3) - 5; blit(s, view.minion.frame({ frame: Math.floor(o.clock * 10) }), x - 10, y - 10, { flip: true }); }
    else { rect(s, x - h.w / 2, M.rail, h.w, H - M.rail, SLOT.INK); }
  }
  // the cart
  const y = M.rail - g.y;
  const cartTop = y - 12;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('side', g.ducking ? 'sit' : g.grounded ? 'idle' : 'jump', 0, Math.floor(o.clock * 8) % 4), M.cartX - HERO_W / 2, cartTop - HERO_H + 14 + (g.ducking ? 8 : 0));
  rect(s, M.cartX - 12, cartTop, 24, 11, SLOT.INK); rect(s, M.cartX - 11, cartTop + 1, 22, 9, SLOT.GRAY); hline(s, M.cartX - 11, M.cartX + 10, cartTop + 1, SLOT.WHITE);
  for (const wx of [-7, 7]) { ellipse(s, M.cartX + wx, y - 1, 3, 3, SLOT.INK); pset(s, M.cartX + wx, y - 1, SLOT.GOLD); }
}

function drawSnowmobile(s, view, g, o) {
  const Sm = SNOWMOBILE;
  drawSky(s, H);
  drawStrip(s, view.land.far, 40, g.x * 0.15);
  const toY = h => H - h;
  for (let sx = 0; sx < W; sx++) {
    const x = g.x + (sx - Sm.sledX);
    const gap = g.inCrevasse(x);
    if (gap) { rect(s, sx, toY(hillAt(g, x)) + 10, 1, H, SLOT.INK); continue; }
    const y = Math.round(toY(hillAt(g, x)));
    rect(s, sx, y, 1, H - y, ST.GROUND0);
    pset(s, sx, y, FX.SNOW); if ((Math.floor(x) % 17) === 0) pset(s, sx, y + 5, ST.GROUND1);
  }
  const y = toY(g.y);
  const a = -g.angle;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    blit(s, view.hero.get('side', g.airborne ? 'jump' : 'sit', 0, Math.floor(o.clock * 8) % 4), Sm.sledX - HERO_W / 2, y - HERO_H + 2, { angle: a });
    const pts = [[-12, 0], [12, 0], [14, -5], [-10, -6]].map(([px, py]) => [Sm.sledX + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]);
    poly(s, pts, HR.ACCENT);
    line(s, pts[0][0], pts[0][1] + 1, pts[1][0] + 3, pts[1][1] + 1, SLOT.INK);
  }
  if (!g.airborne && Math.floor(o.clock * 20) % 2) pset(s, Sm.sledX - 14, y - 1, FX.SNOW_D);
  rect(s, 8, H - 14, 50, 4, SLOT.DARK); rect(s, 8, H - 14, 50 * g.speed / Sm.maxSpeed, 4, g.crevasses.some(c => c.x > g.x && c.x - g.x < 260) && g.speed < 170 ? SLOT.BAD : SLOT.CYAN);
  text(s, 'SPEED', 8, H - 8, SLOT.WHITE, { shadow: SLOT.INK });
}

function drawPlane(s, view, g, o) {
  const P = PLANE;
  drawLandscape(s, view.land, g.travelled, o.clock, P.ground + 4);
  for (const t of g.things) {
    if (t.done && t.kind !== 'ring') continue;
    const x = g.screenX(t.d);
    if (x < -30 || x > W + 30) continue;
    if (t.kind === 'ring') { const c = t.done ? SLOT.GRAY : SLOT.GOLD; ring(s, x, t.y, t.r, SLOT.INK); ring(s, x, t.y, t.r - 1, c); ring(s, x, t.y, t.r - 2, c); }
    else if (t.kind === 'bird') blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), x - 10, t.y + Math.sin(g.time * 3 + t.phase) * 10 - 10, { flip: true });
    else { ellipse(s, x, t.y, t.r + 4, t.r, SLOT.DARK); ellipse(s, x - 5, t.y - 4, t.r - 2, t.r - 4, SLOT.GRAY); if (Math.floor(o.clock * 3 + t.d) % 5 === 0) line(s, x, t.y + t.r, x - 3, t.y + t.r + 8, SLOT.GOLD); }
  }
  // the biplane
  const y = g.y, tilt = Math.max(-0.5, Math.min(0.5, g.vy / 200));
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const rot = (x, yy) => [P.planeX + x * Math.cos(tilt) - yy * Math.sin(tilt), y + x * Math.sin(tilt) + yy * Math.cos(tilt)];
    poly(s, [rot(-14, -2), rot(12, -3), rot(14, 2), rot(-12, 3)], HR.ACCENT);
    poly(s, [rot(-4, -9), rot(6, -9), rot(6, -7), rot(-4, -7)], HR.TOP);
    poly(s, [rot(-4, 5), rot(6, 5), rot(6, 7), rot(-4, 7)], HR.TOP);
    poly(s, [rot(-16, -6), rot(-12, -6), rot(-12, 0), rot(-16, 0)], HR.TOP);
    const [px, py] = rot(15, 0);
    rect(s, px, py - (Math.floor(o.clock * 30) % 2 ? 5 : 2), 1, Math.floor(o.clock * 30) % 2 ? 10 : 4, SLOT.GRAY);
    blitHalf(s, view.hero.get('side', 'idle', 0, 0), P.planeX - 6, y - 13);
  }
  rect(s, 8, H - 14, 44, 4, SLOT.DARK); rect(s, 8, H - 14, 44 * Math.min(1, g.fuel / 12), 4, g.fuel < 3 ? SLOT.BAD : SLOT.GOLD);
  text(s, 'FUEL', 8, H - 8, SLOT.WHITE, { shadow: SLOT.INK });
}

// ---------------------------------------------------------------------------
const SCENES = {
  runner: drawRunner, echo: drawEcho, quickdraw: drawQuickdraw, sled: drawSled, starbeat: drawStarbeat, tennis: drawTennis, invaders: drawInvaders, fireball: drawFireball, doodle: drawDoodle, flappy: drawFlappy, tetris: drawTetris,
  breakout: drawBreakout, cannon: drawCannon, whack: drawWhack, fishing: drawFishing, maze: drawMaze, frogger: drawFrogger, lander: drawLander,
  raft: drawRaft, minecart: drawMinecart, snowmobile: drawSnowmobile, plane: drawPlane,
};

/**
 * Draw a frame. o: { phase: 'intro' | 'countdown' | 'playing' | 'paused' | 'over', countdown, clock }
 */
export function drawBattle(view, g, o) {
  const s = view.screen;
  clear(s, ST.SKY0);
  (SCENES[g.mode] || drawRunner)(s, view, g, o);
  drawParticles(s, view);
  if (o.phase !== 'intro') drawHud(s, g, g.boss, o.clock);
  if (o.phase === 'countdown') banner(s, o.countdown > 0.25 ? String(Math.ceil(o.countdown)) : 'GO!', H / 2 - 14, SLOT.WHITE, 5);
  if (g.victory > 0 && g.result === 'playing') banner(s, 'K.O.!', H / 2 - 30, SLOT.GOLD, 5);
  if (o.fps) { rect(s, 2, H - 9, textWidth(`${o.fps} FPS`) + 4, 8, SLOT.PANEL); text(s, `${o.fps} FPS`, 4, H - 8, SLOT.CYAN); }
  return s;
}

