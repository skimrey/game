/**
 * Dungeon Delve (games/delve/rules.js) in pixel art: a torch-lit stone room seen side-on, the
 * hero with its class's weapon (sword and shield, bow, staff), slimes, bats, skeleton
 * archers and the Rift Warden (the boss monster, with its guard up while it stalks you).
 * Palette indices into the 320×180 screen, like draw.js.
 */
import { rect, pset, blit, ellipse, line, text, ring, solidMap, hline, frame, poly, dither } from '../../engine/pixel.js';
import { SLOT, ST, BR, FX, HR, MN } from '../../engine/palette.js';
import { HERO_W, HERO_H } from '../../characters/heroSprite.js';
import { SCREEN } from '../kit/common.js';
import { DELVE } from './rules.js';

const W = SCREEN.w, H = SCREEN.h;
const WHITE = solidMap(SLOT.WHITE);

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------
function drawRoom(s, g, clock) {
  const D = DELVE, F = D.floor, boss = g.room === g.rooms.length - 1;
  // back wall: bricks, a little moss
  rect(s, 0, 0, W, H, ST.FAR0);
  for (let y = D.ceiling, row = 0; y < F; y += 10, row++) {
    hline(s, 0, W, y, ST.FAR1);
    for (let x = (row % 2) * 11 + ((g.room * 7) % 11); x < W; x += 22) line(s, x, y, x, y + 9, ST.FAR1);
  }
  for (let i = 0; i < 26; i++) { const x = (i * 53 + g.room * 31) % W, y = D.ceiling + 6 + (i * 37) % (F - D.ceiling - 10); pset(s, x, y, ST.DET0); pset(s, x + 1, y, ST.DET1); }
  // pillars
  for (const x of [60, 160, 260]) {
    rect(s, x - 9, D.ceiling, 18, F - D.ceiling, ST.MID0);
    line(s, x - 9, D.ceiling, x - 9, F, ST.MID1); line(s, x + 8, D.ceiling, x + 8, F, SLOT.SHADOW);
    rect(s, x - 12, F - 8, 24, 8, ST.MID1); rect(s, x - 12, D.ceiling, 24, 6, ST.MID1);
  }
  // the boss room: a rift swirling on the back wall
  if (boss) {
    const cx = 160, cy = 80;
    for (let r = 26; r > 4; r -= 4) ring(s, cx, cy, r + Math.sin(clock * 3 + r) * 1.5, r % 8 ? FX.D : FX.C);
    for (let k = 0; k < 10; k++) { const a = clock * 1.7 + k * 0.63, r = 8 + ((k * 7) % 18); pset(s, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, SLOT.WHITE); }
  }
  // torches (flickering light pools)
  for (const x of boss ? [40, 280] : [110, 210]) {
    const fl = Math.sin(clock * 17 + x) * 1.5;
    for (let y = -20; y <= 20; y++) for (let k = -20; k <= 20; k++) {      // a soft pool of light
      const r = Math.hypot(k, y * 1.2);
      if (r < 20 && (k + y) % 2 === 0 && (r < 12 || (k * 3 + y * 5) % 4 === 0)) pset(s, x + k, 62 + y, ST.FAR1);
    }
    rect(s, x - 1, 66, 3, 10, SLOT.GOLD_DARK); rect(s, x - 3, 64, 7, 3, SLOT.GOLD_DARK);
    ellipse(s, x, 59 - fl * 0.5, 3, 5 + fl, SLOT.RED);
    ellipse(s, x, 60, 2, 3, SLOT.GOLD);
    pset(s, x, 57 - fl, SLOT.WHITE);
  }
  // ceiling and floor
  rect(s, 0, 0, W, D.ceiling, ST.MID0);
  for (let x = 4; x < W; x += 16) poly(s, [[x, D.ceiling], [x + 3, D.ceiling + 4 + (x % 5)], [x + 6, D.ceiling]], ST.MID0);
  hline(s, 0, W, D.ceiling - 1, SLOT.INK);
  rect(s, 0, F, W, H - F, ST.GROUND0);
  hline(s, 0, W, F, ST.GROUND1); hline(s, 0, W, F + 1, ST.GROUND1);
  for (let x = (g.room * 9) % 24; x < W; x += 24) { line(s, x, F + 2, x, H, ST.GROUND2); line(s, x + 12, F + 10, x + 12, H, ST.GROUND2); }
  hline(s, 0, W, F + 9, ST.GROUND2);
  // side walls; the door you came in by, and the way on
  rect(s, 0, D.ceiling, D.left, F - D.ceiling, ST.MID0); rect(s, D.right, D.ceiling, W - D.right, F - D.ceiling, ST.MID0);
  rect(s, 0, F - 40, D.left, 40, SLOT.INK);
  if (!boss) {
    const top = F - 44, open = g.doorOpen;
    rect(s, D.right, top, W - D.right, 44, SLOT.INK);
    for (let x = D.right + 1; x < W; x += 3) line(s, x, top, x, F - 1 - open * 42, SLOT.GRAY);
    hline(s, D.right, W, Math.round(F - 1 - open * 42), SLOT.WHITE);
    frame(s, D.right - 2, top - 2, W - D.right + 2, 46, SLOT.GOLD_DARK);
    if (g.cleared && Math.floor(clock * 3) % 2) {
      text(s, 'ON!', D.right - 16, top - 14, SLOT.GOLD, { shadow: SLOT.INK });
      poly(s, [[D.right - 12, F - 24], [D.right - 4, F - 20], [D.right - 12, F - 16]], SLOT.GOLD);
    }
  }
  // ledges (stone slabs on chains)
  for (const l of g.ledges) {
    for (const x of [l.x0 + 6, l.x1 - 6]) for (let y = D.ceiling; y < l.y; y += 4) { pset(s, x, y, SLOT.GRAY); pset(s, x, y + 1, SLOT.DARK); }
    rect(s, l.x0 - 1, l.y - 1, l.x1 - l.x0 + 2, 8, SLOT.INK);
    rect(s, l.x0, l.y, l.x1 - l.x0, 6, ST.MID1);
    hline(s, l.x0, l.x1 - 1, l.y, ST.GROUND1);
    for (let x = l.x0 + 8; x < l.x1; x += 14) pset(s, x, l.y + 3, ST.MID0);
  }
}

// ---------------------------------------------------------------------------
// Foes
// ---------------------------------------------------------------------------
function drawSlime(s, g, f, clock) {
  // it squashes down just before it hops (the tell), stretches in the air
  const air = !f.ground, squash = air ? -2 : f.t < 0.3 ? 2 + (Math.floor(clock * 20) % 2) : Math.round(Math.sin(clock * 6 + f.id) * 1);
  const rx = 8 - squash * 0.5, ry = 6 + squash, cy = f.y - ry;
  const map = f.hurt > 0 && Math.floor(clock * 20) % 2;
  ellipse(s, f.x, f.y - 1, 8, 2, ST.GROUND2);
  ellipse(s, f.x, cy, rx + 1, ry + 1, SLOT.INK);
  ellipse(s, f.x, cy, rx, ry, map ? SLOT.WHITE : MN.BODY);
  ellipse(s, f.x - 2, cy - 2, rx * 0.45, ry * 0.4, map ? SLOT.WHITE : MN.LIGHT);
  const look = Math.sign(g.hero.x - f.x);
  for (const ex of [-3, 2]) { rect(s, f.x + ex, cy - 2, 2, 3, SLOT.WHITE); pset(s, f.x + ex + (look > 0 ? 1 : 0), cy - 1, SLOT.INK); }
  if (f.hp < f.maxHp) hline(s, f.x - 3, f.x + 3, cy + 3, SLOT.INK);
}

function drawBat(s, view, g, f, clock) {
  const spr = view.minion.frame({ frame: Math.floor(clock * (f.state === 'swoop' ? 16 : 8)) });
  const map = f.hurt > 0 && Math.floor(clock * 20) % 2 ? WHITE : null;
  blit(s, spr, f.x - spr.w / 2, f.y - spr.h + 4, { flip: f.face > 0, map });
  if (f.state === 'aim') {                      // it's about to dive: eyes flash, a warning
    const on = Math.floor(clock * 12) % 2;
    text(s, '!', f.x, f.y - spr.h - 4, on ? SLOT.BAD : SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  }
}

function drawArcher(s, g, f, clock) {
  const x = Math.round(f.x), y = Math.round(f.y), fc = f.face, hurt = f.hurt > 0 && Math.floor(clock * 20) % 2;
  const bone = hurt ? SLOT.WHITE : SLOT.WHITE, dim = hurt ? SLOT.WHITE : SLOT.GRAY;
  ellipse(s, x, y - 1, 7, 2, ST.GROUND2);
  // legs, ribs, arms
  line(s, x - 2, y - 10, x - 3, y - 1, bone); line(s, x + 2, y - 10, x + 3, y - 1, bone);
  rect(s, x - 3, y - 11, 7, 2, dim);
  line(s, x, y - 20, x, y - 11, bone);
  for (let k = 0; k < 3; k++) hline(s, x - 3, x + 3, y - 19 + k * 3, k % 2 ? dim : bone);
  // the skull
  ellipse(s, x, y - 24, 4, 4, SLOT.INK); ellipse(s, x, y - 24, 3, 3, bone);
  pset(s, x + fc, y - 25, SLOT.INK); pset(s, x + fc * 2 + (fc > 0 ? 0 : 0), y - 25, f.state === 'draw' ? SLOT.BAD : SLOT.INK);
  hline(s, x - 1, x + 2, y - 22, SLOT.INK);
  // the bow (drawn back while aiming)
  const bx = x + fc * 6, pull = f.state === 'draw' ? 4 : 1;
  for (let k = -7; k <= 7; k++) pset(s, bx + fc * Math.round(Math.cos(k / 7 * 1.3) * 3), y - 17 + k, SLOT.GOLD_DARK);
  line(s, bx, y - 24, bx - fc * pull, y - 17, dim); line(s, bx - fc * pull, y - 17, bx, y - 10, dim);
  line(s, x, y - 17, bx - fc * pull, y - 17, bone);
  if (f.state === 'draw') {
    line(s, bx - fc * pull, y - 17, bx + fc * 5, y - 19, SLOT.GOLD);
    if (Math.floor(clock * 10) % 2) pset(s, bx + fc * 6, y - 20, SLOT.WHITE);
  }
}

function drawWarden(s, view, g, f, clock) {
  const W = DELVE.warden;
  // its landing spot while it leaps
  if (f.state === 'leap') {
    const k = 1 - Math.max(0, f.t) / W.leap;
    ellipse(s, f.to, DELVE.floor - 1, 8 + k * 14, 3, SLOT.INK);
    if (Math.floor(clock * 10) % 2) ellipse(s, f.to, DELVE.floor - 1, 6 + k * 12, 2, SLOT.BAD);
  } else ellipse(s, f.x, DELVE.floor - 1, 20, 3, ST.GROUND2);
  const pose = f.hurt > 0 || f.state === 'stunned' ? 'hurt' : /Wind|charge|leap/.test(f.state) ? 'attack' : 'idle';
  const spr = view.monster.frame({ pose, frame: Math.floor(clock * (f.state === 'charge' ? 8 : 3)) });
  const map = f.hurt > 0 && Math.floor(clock * 20) % 2 ? WHITE : null;
  const shake = /Wind/.test(f.state) ? Math.round(Math.sin(clock * 50)) : 0;
  const lean = f.state === 'charge' ? f.face * 0.25 : 0;
  blit(s, spr, f.x - spr.w / 2 + shake, f.y - spr.h + 3, { flip: f.face > 0, map, angle: lean });
  // its guard: a big plated gauntlet held up in front while it stalks you
  if (f.state === 'walk') {
    const gx = f.x + f.face * 18, gy = f.y - 30;
    rect(s, gx - 3, gy - 1, 7, 20, SLOT.INK); rect(s, gx - 2, gy, 5, 18, SLOT.GRAY);
    hline(s, gx - 2, gx + 2, gy + 6, SLOT.WHITE); hline(s, gx - 2, gx + 2, gy + 12, SLOT.WHITE);
  }
  if (f.state === 'stunned') for (let k = 0; k < 3; k++) { const a = clock * 5 + k * 2.1; pset(s, f.x + Math.cos(a) * 12, f.y - 46 + Math.sin(a) * 3, SLOT.GOLD); pset(s, f.x + Math.cos(a) * 12 + 1, f.y - 46 + Math.sin(a) * 3, SLOT.WHITE); }
  if (/Wind/.test(f.state) && Math.floor(clock * 8) % 2) text(s, f.state === 'slamWind' ? 'SLAM!' : f.state === 'chargeWind' ? 'CHARGE!' : 'LEAP!', f.x, f.y - 58, SLOT.BAD, { align: 'center', shadow: SLOT.INK });
  if (f.state === 'charge') for (let k = 0; k < 4; k++) pset(s, f.x - f.face * (20 + k * 5), DELVE.floor - 2 - (k % 2) * 2, ST.GROUND1);
}

// ---------------------------------------------------------------------------
// The hero and its weapon
// ---------------------------------------------------------------------------
function drawHero(s, view, g, clock) {
  const h = g.hero, D = DELVE, kit = g.kit;
  if (g.blinkFx) {                              // the blink: a trail of sparkles where you were
    const b = g.blinkFx;
    for (let k = 0; k < 12; k++) { const x = b.from + (b.to - b.from) * (k / 11); pset(s, x, b.y - 6 - ((k * 7) % 20), k % 2 ? FX.D : SLOT.WHITE); }
  }
  const blink = g.invulnerable > 0 && Math.floor(clock * 16) % 2 === 0;
  ellipse(s, h.x, Math.min(D.floor, groundUnder(g)) - 1, 8, 2, ST.GROUND2);
  if (blink) return;
  const pose = g.result === 'lost' ? 'hurt' : h.stun > 0 ? 'hurt' : h.roll > 0 ? 'jump' : !h.ground ? (h.vy < 0 ? 'jump' : 'fall') : h.run > 0 ? 'run' : 'idle';
  const spr = view.hero.get('side', pose, Math.floor(h.run * 10) % 4, Math.floor(clock * 8) % 4);
  const angle = h.roll > 0 ? h.rollDir * (1 - h.roll / kit.roll) * Math.PI * 2 : 0;
  const y = h.roll > 0 ? h.y - HERO_H + 8 : h.y - HERO_H + 1;
  blit(s, spr, h.x - HERO_W / 2, y, { flip: h.face < 0, angle });
  if (h.roll > 0 || pose === 'hurt') return;
  const fc = h.face, hx = h.x + fc * 3, hy = h.y - 16;
  if (kit.attack === 'sword') {
    if (h.blocking) {                           // the shield, up in front
      const sx = h.x + fc * 9;
      rect(s, sx - 3, h.y - 27, 7, 20, SLOT.INK); rect(s, sx - 2, h.y - 26, 5, 18, SLOT.GRAY);
      rect(s, sx - 1, h.y - 24, 3, 14, HR.ACCENT); pset(s, sx, h.y - 18, SLOT.GOLD);
    } else if (h.swing > 0 && h.swingUp) {      // an overhead swing (↑ held)
      const k = 1 - h.swing / kit.swing, cx = h.x, cy = h.y - 22;
      const a0 = -Math.PI / 2 - 1.2 * fc + k * 2.2 * fc;
      for (let j = 0; j < 5; j++) {
        const a = a0 - j * 0.22 * fc, r = kit.reach - 4;
        line(s, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, j === 0 ? SLOT.WHITE : j < 3 ? SLOT.GRAY : ST.FAR1);
      }
    } else if (h.swing > 0) {                   // a swing: an arc of steel
      const k = 1 - h.swing / kit.swing;
      const a0 = -1.3 + k * 2.2;
      for (let j = 0; j < 5; j++) {
        const a = a0 - j * 0.22, r = kit.reach - 2;
        const ex = h.x + fc * Math.cos(a) * r, ey = hy + Math.sin(a) * r;
        line(s, hx, hy, ex, ey, j === 0 ? SLOT.WHITE : j < 3 ? SLOT.GRAY : ST.FAR1);
      }
    } else {
      line(s, hx, hy, hx + fc * 10, hy - 10, SLOT.INK); line(s, hx, hy - 1, hx + fc * 9, hy - 10, SLOT.WHITE);
      line(s, hx - 2, hy - 2, hx + 2, hy + 2, SLOT.GOLD);
      rect(s, h.x - fc * 7 - 2, h.y - 24, 5, 12, SLOT.GRAY); rect(s, h.x - fc * 7 - 1, h.y - 22, 3, 8, HR.ACCENT);   // the shield on its back
    }
  }
  if (kit.attack !== 'sword' && g.aimingUp && h.roll <= 0) {       // aiming up: a dotted line at 45°
    for (let k = 2; k < 9; k++) if (k % 2 === 0) pset(s, h.x + fc * (8 + k * 3), h.y - DELVE.hero.shot - k * 3, SLOT.WHITE);
  }
  if (kit.attack === 'sword') {
    // (drawn above)
  } else if (kit.attack === 'bow') {
    const bx = hx + fc * 4, pull = h.attackCd > kit.cooldown * 0.6 ? 0 : 2;
    for (let k = -7; k <= 7; k++) pset(s, bx + fc * Math.round(Math.cos(k / 7 * 1.3) * 3), hy + k, SLOT.GOLD_DARK);
    line(s, bx, hy - 7, bx - fc * pull, hy, SLOT.WHITE); line(s, bx - fc * pull, hy, bx, hy + 7, SLOT.WHITE);
  } else {
    const tx = hx + fc * 4, glow = Math.floor(clock * 8) % 2;
    line(s, tx, hy + 10, tx + fc * 2, hy - 12, SLOT.GOLD_DARK);
    ellipse(s, tx + fc * 2, hy - 14, 3, 3, SLOT.INK); ellipse(s, tx + fc * 2, hy - 14, 2, 2, glow ? FX.D : FX.C);
    if (h.attackCd > kit.cooldown * 0.7) ring(s, tx + fc * 2, hy - 14, 5, SLOT.WHITE);
  }
}

/** The floor (or ledge) below the hero, for its shadow. */
function groundUnder(g) {
  const h = g.hero;
  let y = DELVE.floor;
  for (const l of g.ledges) if (h.x > l.x0 && h.x < l.x1 && l.y >= h.y - 1 && l.y < y) y = l.y;
  return y;
}

// ---------------------------------------------------------------------------
export function drawDelve(s, view, g, o) {
  const clock = o.clock, D = DELVE;
  drawRoom(s, g, clock);
  for (const f of g.foes) {
    if (f.hp <= 0) continue;
    if (f.appear > 0) {                         // stepping out of a little rift
      const k = 1 - f.appear / D.spawn;
      ring(s, f.x, f.y - 10, 4 + k * 8, FX.D); ring(s, f.x, f.y - 10, 2 + k * 5, SLOT.WHITE);
      if (Math.floor(clock * 20) % 3) continue;
    }
    if (f.kind === 'slime') drawSlime(s, g, f, clock);
    else if (f.kind === 'bat') drawBat(s, view, g, f, clock);
    else if (f.kind === 'archer') drawArcher(s, g, f, clock);
    else drawWarden(s, view, g, f, clock);
  }
  // the Warden's health, big, at the bottom
  const warden = g.foes.find(f => f.kind === 'warden' && f.hp > 0);
  if (warden) {
    const w = 120, x = 160 - w / 2, y = H - 9;
    rect(s, x - 2, y - 2, w + 4, 8, SLOT.INK);
    rect(s, x, y, w, 4, SLOT.RED_DARK); rect(s, x, y, Math.round(w * warden.hp / warden.maxHp), 4, SLOT.RED);
    text(s, warden.state === 'walk' ? 'GUARD UP' : 'OPEN!', x + w + 6, y - 2, warden.state === 'walk' ? SLOT.GRAY : SLOT.GOLD, { shadow: SLOT.INK });
  }
  drawHero(s, view, g, clock);
  // shots: your arrows and bolts, their arrows, shockwaves
  for (const sh of g.shots) {
    const len = Math.hypot(sh.vx, sh.vy) || 1, ux = sh.vx / len, uy = sh.vy / len;
    if (sh.kind === 'bolt') {
      for (let k = 1; k < 5; k++) pset(s, sh.x - ux * k * 3, sh.y - uy * k * 3 + Math.sin(clock * 30 + k) , k % 2 ? FX.D : FX.C);
      ellipse(s, sh.x, sh.y, 3, 3, SLOT.INK); ellipse(s, sh.x, sh.y, 2, 2, FX.D); pset(s, sh.x, sh.y, SLOT.WHITE);
    } else {
      line(s, sh.x - ux * 7, sh.y - uy * 7, sh.x, sh.y, SLOT.GOLD_DARK);
      pset(s, sh.x, sh.y, SLOT.WHITE); pset(s, sh.x - ux * 7 - uy, sh.y - uy * 7 + ux, SLOT.WHITE);
    }
  }
  for (const a of g.arrows) {
    const len = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / len, uy = a.vy / len;
    line(s, a.x - ux * 8, a.y - uy * 8, a.x, a.y, SLOT.INK);
    line(s, a.x - ux * 7, a.y - uy * 7 - 1, a.x, a.y - 1, SLOT.GRAY);
    pset(s, a.x, a.y, SLOT.BAD); pset(s, a.x + ux, a.y + uy, SLOT.BAD);
  }
  for (const w of g.waves) {
    const hgt = D.warden.waveH, flick = Math.floor(clock * 20) % 2;
    poly(s, [[w.x - 6, D.floor], [w.x - 2, D.floor - hgt], [w.x + 1, D.floor - hgt + 3], [w.x + 6, D.floor]], flick ? ST.GROUND1 : SLOT.WHITE);
    for (let k = 1; k < 4; k++) pset(s, w.x - Math.sign(w.vx) * k * 4, D.floor - 2 - (k % 2) * 2, ST.GROUND1);
  }
  // hit sparks
  for (const fl of g.flashes) {
    const r = (0.25 - fl.t) * 40 + 2;
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + fl.x; pset(s, fl.x + Math.cos(a) * r, fl.y + Math.sin(a) * r, fl.kind === 'clink' ? SLOT.GRAY : k % 2 ? SLOT.GOLD : SLOT.WHITE); }
    if (fl.kind === 'clink') text(s, 'CLINK', fl.x, fl.y - 10 - (0.2 - fl.t) * 20, SLOT.GRAY, { align: 'center', shadow: SLOT.INK });
  }
  // the room's banner
  const since = g.time - g.enteredAt;
  if (since < 1.6 && g.result === 'playing') {
    const boss = g.room === g.rooms.length - 1;
    text(s, boss ? 'THE RIFT WARDEN' : `ROOM ${g.room + 1}`, W / 2, 40, boss ? SLOT.BAD : SLOT.WHITE, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
  // the class move (and its cooldown), bottom left on the floor
  if (g.kit.move !== 'block') {
    const cd = g.hero.moveCd / (g.kit.move === 'roll' ? g.kit.rollCooldown : g.kit.blinkCooldown);
    rect(s, 4, 164, 34, 5, SLOT.INK); rect(s, 5, 165, Math.round(32 * (1 - cd)), 3, cd > 0 ? SLOT.GRAY : SLOT.CYAN);
    text(s, g.kit.move === 'roll' ? 'ROLL: K' : 'BLINK: K', 42, 163, cd > 0 ? SLOT.GRAY : SLOT.WHITE, { shadow: SLOT.INK });
  } else text(s, 'SHIELD: HOLD K', 4, 163, g.hero.blocking ? SLOT.CYAN : SLOT.GRAY, { shadow: SLOT.INK });
}

export const DELVE_HERO_AT = g => [g.hero.x, g.hero.y - 18];
export const DELVE_BOSS_AT = g => g.lastHitAt || null;
