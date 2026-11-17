/**
 * A walk-around 2D place (pixel art, 320×180, side view) — the inn and the ranch are made of
 * this (home.js predates it and does the same by hand). The hero walks left and right, the
 * camera follows, the nearest hotspot shows its label, and ↑ / E / Space / Enter uses it.
 *
 *   const place = createPlace({
 *     id, label, width: st => 960, hint: 'A D WALK …',
 *     palette: st => pal,                       // 256 × [r, g, b] (hero colours included)
 *     hotspots: st => [{ id, x, label, priority? }],
 *     draw: (screen, cam, st, dt) => {},        // the place, under the hero
 *     drawFront: (screen, cam, st, dt) => {},   // over the hero (optional)
 *     use: (hotspot, st) => {},                 // st.paused = true while something else is open
 *     onLeave: () => {},
 *   });
 *   place.open({ design, x });  place.resume({ design });  place.close();
 *   place.showPanel(title, children, buttons)  // an HTML panel over the place
 */
import { createSurface, clear, rect, text, poly, blit, present, textWidth } from '../engine/pixel.js';
import { SLOT, packPalette } from '../engine/palette.js';
import { createHeroSheet, HERO_W, HERO_H } from '../characters/heroSprite.js';
import { SCREEN } from '../games/kit/common.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';

export const W = SCREEN.w, H = SCREEN.h, FLOOR = 150, FEET = 168;
const MIN_FRAME_MS = 1000 / 40;

export const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

export function createPlace({ parent = document.querySelector('main') || document.body, id, label, width = () => 640, hint = 'A D WALK  /  UP OR E USE  /  ESC LEAVE', palette, hotspots, draw, drawFront = null, use, onLeave = () => {}, onOpen = null, bodyClass = 'in-home' }) {
  const canvas = el('canvas', { width: W, height: H, class: `home-canvas place-${id}`, 'aria-label': label, hidden: true });
  const panel = el('section', { class: 'home-panel', hidden: true, role: 'dialog' });
  parent.append(canvas, panel);
  const ctx = canvas.getContext('2d', { alpha: false });
  fitPixelCanvas(canvas);
  const target = { ctx, image: null };
  const screen = createSurface(W, H);
  let st = null;

  const nearest = () => (hotspots(st) || []).reduce((best, h) => {
    const d = Math.abs(h.x - st.hero.x);
    if (d >= (h.reach ?? (h.priority ? 22 : 28))) return best;
    if (!best || (h.priority && !best.priority) || (!!h.priority === !!best.priority && d < Math.abs(best.x - st.hero.x))) return h;
    return best;
  }, null);

  function showPanel(title, children, buttons = [['Close', () => hidePanel(), true]]) {
    if (!st) return;
    st.paused = true;
    panel.replaceChildren(el('h2', { text: title }), ...children.filter(Boolean), el('div', { class: 'npc-buttons' }, buttons.map(([lbl, action, primary]) => el('button', { type: 'button', class: primary ? 'primary' : '', text: lbl, onclick: action }))));
    panel.hidden = false;
    (panel.querySelector('.pick') || panel.querySelector('button.primary') || panel.querySelector('button'))?.focus();
  }
  function hidePanel() { panel.hidden = true; if (st) { st.paused = false; st.keys.clear(); canvas.focus?.(); } }
  panel.addEventListener('keydown', e => { if (e.code === 'Escape') { e.stopPropagation(); hidePanel(); } });

  const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], USE = ['ArrowUp', 'KeyW', 'KeyE', 'Space', 'Enter'];
  function onKey(e) {
    if (!st || st.paused || e.target instanceof HTMLInputElement) return;
    if (e.code === 'Escape') { e.preventDefault(); leave(); return; }
    if (LEFT.includes(e.code) || RIGHT.includes(e.code)) { e.preventDefault(); st.keys.add(e.code); }
    if (USE.includes(e.code) && !e.repeat) { e.preventDefault(); const h = nearest(); if (h) use(h, st); }
  }
  function onKeyUp(e) { st?.keys.delete(e.code); }
  function onClick(e) {
    if (!st || st.paused) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W + st.cam;
    // click a hotspot to walk there and use it
    const h = (hotspots(st) || []).filter(q => Math.abs(q.x - x) < 20).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    st.walkTo = h ? { x: h.x, use: h } : { x };
  }

  function leave() { close(); onLeave(); }

  function frameLoop(now) {
    if (!st) return;
    st.raf = requestAnimationFrame(frameLoop);
    if (st.lastDraw && now - st.lastDraw < MIN_FRAME_MS) return;
    const dt = st.lastDraw ? Math.min(0.1, (now - st.lastDraw) / 1000) : 0;
    st.lastDraw = now;
    st.clock += dt;
    const world = width(st);
    let dir = (RIGHT.some(k => st.keys.has(k)) ? 1 : 0) - (LEFT.some(k => st.keys.has(k)) ? 1 : 0);
    if (dir) st.walkTo = null;
    else if (st.walkTo && !st.paused) {
      const dx = st.walkTo.x - st.hero.x;
      if (Math.abs(dx) < 3) { const h = st.walkTo.use; st.walkTo = null; if (h) use(h, st); }
      else dir = Math.sign(dx);
    }
    if (!st.paused) { st.hero.x = Math.max(22, Math.min(world - 24, st.hero.x + dir * 90 * dt)); if (dir) st.hero.face = dir; }
    st.hero.moving = !st.paused && dir !== 0;
    st.cam = Math.max(0, Math.min(world - W, st.hero.x - W / 2));
    clear(screen, SLOT.DARK);
    draw(screen, st.cam, st, dt);
    const pose = st.hero.moving ? 'run' : st.hero.pose || 'idle';
    const spr = st.sheet.get(st.hero.moving ? 'side' : 'front', pose, Math.floor(st.clock * 8) % 4, Math.floor(st.clock * 8) % 4);
    blit(screen, spr, st.hero.x - st.cam - HERO_W, FEET - HERO_H * 2, { scale: 2, flip: st.hero.moving && st.hero.face < 0 });
    drawFront?.(screen, st.cam, st, dt);
    const h = !st.paused ? nearest() : null;
    if (h) {
      const lbl = `${h.label}`.toUpperCase();
      const x = Math.max(4 + textWidth(lbl) / 2, Math.min(W - 4 - textWidth(lbl) / 2, h.x - st.cam)), y = h.labelY ?? FEET - HERO_H * 2 - 16;
      rect(screen, x - textWidth(lbl) / 2 - 4, y, textWidth(lbl) + 8, 11, SLOT.PANEL);
      text(screen, lbl, x, y + 3, SLOT.GOLD, { align: 'center' });
      poly(screen, [[x - 3, y + 11], [x + 3, y + 11], [x, y + 14]], SLOT.PANEL);
    }
    rect(screen, 2, H - 10, textWidth(hint) + 6, 9, SLOT.PANEL); text(screen, hint, 5, H - 8, SLOT.WHITE);
    if (!st.palette || st.paletteDirty) { st.palette = packPalette(palette(st)); st.paletteDirty = false; }
    present(screen, st.palette, target);
  }

  function close() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    canvas.removeEventListener('pointerdown', onClick);
    st = null;
    canvas.hidden = true; panel.hidden = true;
    document.body.classList.remove(bodyClass);
  }

  return {
    get isOpen() { return !!st; },
    get state() { return st; },
    open({ design, x = 40 } = {}) {
      close();
      st = { design, sheet: createHeroSheet(design), hero: { x, face: 1, moving: false }, keys: new Set(), clock: 0, lastDraw: 0, raf: 0, paused: false, palette: null, paletteDirty: true, cam: 0, walkTo: null };
      canvas.hidden = false;
      document.body.classList.add(bodyClass);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKeyUp, true);
      canvas.addEventListener('pointerdown', onClick);
      onOpen?.(st);
      st.raf = requestAnimationFrame(frameLoop);
    },
    resume({ design } = {}) {
      if (!st) return;
      if (design) { st.design = design; st.sheet = createHeroSheet(design); }
      st.paletteDirty = true; st.paused = false; st.keys.clear();
      canvas.hidden = false; panel.hidden = true;
    },
    pause() { if (st) st.paused = true; },
    hideCanvas() { canvas.hidden = true; },
    refresh() { if (st) st.paletteDirty = true; },
    showPanel, hidePanel, close,
  };
}
