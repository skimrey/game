/**
 * Boss battle screen — runs one of the retro 2D mini-games (battle/index.js) after
 * each gem, and reports whether the boss was beaten.
 *
 *   const battle = createBossBattle();
 *   const { won, stats } = await battle.start({ boss, design, seed, levelName });
 *
 * Rendering is pure 2D pixel art into a 320×180 indexed frame (pixel.js), shown on one
 * small canvas scaled up with crisp pixels — no 3D and no vector drawing, so it runs
 * at full speed on machines without a GPU. Each correct key moves the whole palette to
 * a new hue (stage, hero and boss together), the retro-roguelite way.
 *
 * Rules cards (intro, pause, victory, defeat) are plain HTML over the canvas.
 */
import { present } from './pixel.js';
import { buildScheme, packPalette, heroBaseColors, bossBaseColors, minionBaseColors, SLOT, hslToRgb } from './palette.js';
import { MODES, createBattleGame } from './battle/index.js';
import { SCREEN } from './battle/common.js';
import { createView, drawBattle, burst, updateParticles } from './battle/draw.js';
import { RUNNER } from './battle/runner.js';
import { SLED } from './battle/sled.js';
import { STARBEAT } from './battle/starbeat.js';
import { FX, MN, ST, pixelColors } from './palette.js';
import { TRAIL_STYLES } from './trails.js';

const STEP = 1 / 120;
const MIN_FRAME_MS = 1000 / 62;      // draw at most ~60 frames a second (the rules still step at 120 Hz)

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
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createBossBattle({ parent = document.querySelector('main') || document.body, showFps = false } = {}) {
  const root = el('section', { class: 'boss-screen', 'aria-label': 'Boss battle' });
  root.hidden = true;
  const canvas = el('canvas', { width: SCREEN.w, height: SCREEN.h, class: 'boss-canvas', 'aria-hidden': 'true' });
  const card = el('div', { class: 'boss-card', role: 'dialog', 'aria-live': 'polite' });
  root.append(canvas, card);
  parent.append(root);
  // a CPU-side canvas: putImageData every frame never round-trips through a (software) GPU
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const target = { ctx, image: null };

  let state = null;

  function showCard(html, buttons = []) {
    card.replaceChildren();
    card.insertAdjacentHTML('beforeend', html);
    const row = el('div', { class: 'boss-buttons' });
    for (const [label, action, primary] of buttons) row.append(el('button', { type: 'button', class: primary ? 'primary' : '', text: label, onclick: action }));
    if (buttons.length) card.append(row);
    card.hidden = false;
    row.querySelector('button.primary, button')?.focus();
  }
  const hideCard = () => { card.hidden = true; };

  // --- palette -----------------------------------------------------------------
  function palette() {
    const { boss, design } = state.options;
    const key = `${state.game.steps}|${state.hurtFlash > 0 ? 1 : 0}`;
    if (state.paletteKey === key) return state.palette;
    const pal = buildScheme({
      theme: boss.theme,
      hero: state.heroColors,
      boss: state.bossColors,
      minion: state.minionColors,
      step: state.game.steps,
      offset: state.options.seed % 360,
    });
    if (state.hurtFlash > 0) {                        // a hit: the stage flushes red for a moment
      for (let i = SLOT.STAGE; i < SLOT.HERO; i++) { const [r, g, b] = pal[i]; pal[i] = [Math.min(255, r * 0.5 + 140), g * 0.45, b * 0.45]; }
    }
    state.palette = packPalette(pal, state.palette || undefined);
    state.paletteKey = key;
    return state.palette;
  }

  // --- flow --------------------------------------------------------------------
  function begin() {
    hideCard();
    state.phase = 'countdown';
    state.countdown = 3;
    canvas.focus?.();
  }

  function finish(result) {
    state.phase = 'over';
    const g = state.game;
    if (g.boss.kind === 'travel') {
      if (result === 'won') showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>You made it!</h2><p>${escapeHtml(state.options.levelName || 'On to the next region')}.</p>`, [['Carry on ▸', () => close({ won: true }), true]]);
      else showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>${g.reason === 'time' ? 'Too slow!' : 'Crashed!'}</h2><p>Try the trip again — or walk the long way round (no star for this one).</p>`, [['Try again', () => restart(), true], ['Walk the long way', () => close({ won: false })]]);
      return;
    }
    if (g.boss.kind === 'checkpoint') {
      if (result === 'won') showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>Checkpoint!</h2><p>Goal reached. If you run out of hearts, you'll restart at this arcade — and your hearts are refilled.</p>`, [['Save checkpoint ▸', () => close({ won: true }), true]]);
      else showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>${g.reason === 'time' ? 'Time’s up!' : 'Out of hearts!'}</h2><p>No checkpoint this time (${g.bossHp} to go).</p>`, [['Try again', () => restart(), true], ['Carry on without it', () => close({ won: false })]]);
      return;
    }
    if (result === 'won') {
      const lost = g.maxHearts - g.hearts;
      showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>Victory!</h2><p><strong>${escapeHtml(g.boss.name)}</strong> is defeated — ${g.stats.good} good moves, ${g.stats.wrong} fumbles, ${lost} heart${lost === 1 ? '' : 's'} lost.</p>`,
        [['Claim your reward ▸', () => close({ won: true }), true]]);
    } else {
      const why = g.reason === 'time' ? 'Time’s up!' : 'Out of hearts!';
      showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>${why}</h2><p>${escapeHtml(g.boss.name)} still stands (${g.bossHp} hit${g.bossHp === 1 ? '' : 's'} to go).</p>`,
        [['Try again', () => restart(), true], ['Skip — no reward', () => close({ won: false })]]);
    }
  }

  function restart() {
    const { boss, seed } = state.options;
    state.game = createBattleGame(boss, { seed: seed + (++state.tries) * 7919 });
    state.view.particles = [];
    state.paletteKey = null;
    begin();
  }

  function close(outcome) {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('pointermove', onPointerMove);
    cancelAnimationFrame(state.raf);
    root.hidden = true;
    const resolve = state.resolve;
    const stats = state.game.stats;
    state = null;
    resolve({ ...outcome, stats });
  }

  function pause() {
    state.phase = 'paused';
    showCard('<h2>Paused</h2>', [['Resume', () => { hideCard(); state.phase = 'playing'; state.last = null; canvas.focus?.(); }, true], ['Give up — no reward', () => close({ won: false })]]);
  }

  function onKey(e) {
    if (!state) return;
    if (e.code === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = e.target instanceof HTMLButtonElement;
    if (state.phase === 'playing' || state.phase === 'countdown') {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { if (state.phase === 'playing') pause(); return; }
      state.game.held.add(e.code);                    // games you steer read held keys
      if (e.repeat || state.phase !== 'playing') return;
      state.game.press(e.code);
      return;
    }
    // cards: Enter / Space activate the focused button (default); other keys are swallowed
    if (!onButton || !['Enter', 'Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); }
    if (state.phase === 'intro' && e.code === 'Enter' && !onButton) begin();
  }

  function onKeyUp(e) {
    if (!state) return;
    state.game.release(e.code);
  }
  function onBlur() { state?.game.held.clear(); }

  /** Pointer → screen pixels (the canvas is letterboxed with object-fit: contain). */
  function toScreen(e) {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / SCREEN.w, r.height / SCREEN.h);
    return [(e.clientX - r.left - (r.width - SCREEN.w * scale) / 2) / scale, (e.clientY - r.top - (r.height - SCREEN.h * scale) / 2) / scale];
  }
  function onPointer(e) {
    if (!state || state.phase !== 'playing' || !state.game.click) return;
    state.game.click(...toScreen(e));
  }
  function onPointerMove(e) {
    if (!state || state.phase !== 'playing' || !state.game.aimAt) return;
    state.game.aimAt(...toScreen(e));
  }

  // --- per frame -------------------------------------------------------------------
  function frame(now) {
    if (!state) return;
    state.raf = requestAnimationFrame(frame);
    if (state.lastDraw && now - state.lastDraw < MIN_FRAME_MS) return;
    const dt = state.last === null ? 0 : Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    state.lastDraw = now;
    state.clock += dt;
    state.drawn++;                                   // frames drawn per second (the test preset shows it)
    if (now - state.fpsSince >= 1000) { state.fps = Math.round(state.drawn * 1000 / (now - state.fpsSince)); state.drawn = 0; state.fpsSince = now; }
    const g = state.game;
    if (state.phase === 'countdown') {
      state.countdown -= dt;
      if (state.countdown <= 0) state.phase = 'playing';
    } else if (state.phase === 'playing') {
      state.acc += dt;
      while (state.acc >= STEP) { g.step(STEP); state.acc -= STEP; }
      for (const e of g.drain()) effect(e);
      if (g.result !== 'playing') finish(g.result);
    }
    if (state.phase !== 'paused') {
      updateParticles(state.view, dt);
      // a glittery trail behind the hero, if it wears one
      if (state.trail && state.phase === 'playing' && Math.random() < 0.6) {
        const [x, y] = heroAt(g);
        state.view.particles.push({ x: x - 4 + Math.random() * 8, y: y + 4 + Math.random() * 10, vx: -20 - Math.random() * 20, vy: (Math.random() - 0.5) * 16, t: 0.5 + Math.random() * 0.4, c: state.trail[Math.floor(Math.random() * state.trail.length)], g: -10 });
      }
    }
    state.hurtFlash = Math.max(0, state.hurtFlash - dt);
    if (state.shake > 0) {
      state.shake -= dt;
      canvas.style.transform = state.shake > 0 ? `translate(${(Math.random() - 0.5) * 1.2}%, ${(Math.random() - 0.5) * 1.2}%)` : '';
    }
    drawBattle(state.view, g, { phase: state.phase, countdown: state.countdown, clock: state.clock, fps: showFps ? state.fps : null });
    present(state.view.screen, palette(), target);
  }

  /** Where the hero / the boss are on screen, per mini-game (for effects). */
  function heroAt(g) {
    switch (g.mode) {
      case 'runner': return [RUNNER.playerX, RUNNER.ground - 40 - g.player.y];
      case 'sled': return [g.x, SLED.heroY];
      case 'tennis': return [g.hero.x + 12, 150];
      case 'invaders': return [g.hero.x, 150];
      case 'fireball': return [g.hero.x, 136 - g.hero.y];
      case 'doodle': return [g.hero.x, 90];
      case 'flappy': return [84, g.hero.y];
      case 'tetris': return [160, 100];
      default: return [92, 100];
    }
  }
  function bossAt(g) {
    return { runner: [RUNNER.bossX, RUNNER.ground - 30], sled: [g.bossX ?? 160, 40], starbeat: [266, 130], echo: [228, 120], quickdraw: [258, 50], tennis: [g.foe?.x ?? 160, 40], invaders: [g.foe?.x ?? 160, 40], fireball: [272, 110] }[g.mode] || null;
  }

  function effect(e) {
    const g = state.game, v = state.view;
    if (e.type === 'good') {
      if (g.mode === 'quickdraw') burst(v, e.x, e.y, { n: 14, speed: 60, colors: [MN.LIGHT, MN.BODY, SLOT.WHITE] });
      else if (g.mode === 'sled') burst(v, g.x, SLED.heroY, { n: 16, speed: 70, colors: [FX.SNOW, FX.SNOW_D, SLOT.WHITE] });
      else if (g.mode === 'starbeat') burst(v, STARBEAT.lanes[e.lane], STARBEAT.hitY, { n: e.perfect ? 14 : 8, speed: 60, gravity: 40 });
      else { const [x, y] = heroAt(g); burst(v, x, y, { n: g.mode === 'runner' ? 16 : 10, speed: 60, gravity: 60 }); }
    } else if (e.type === 'pop') {
      burst(v, e.x, e.y, { n: 10, speed: 55, colors: [MN.LIGHT, MN.BODY, SLOT.WHITE] });
    } else if (e.type === 'bossHit') {
      const at = bossAt(g);
      if (at && g.mode !== 'quickdraw' && g.mode !== 'starbeat') burst(v, at[0], at[1], { n: 20, speed: 110 });
    } else if (e.type === 'bossDefeated') {
      for (let i = 0; i < 6; i++) burst(v, 120 + i * 30, 50 + (i % 3) * 25, { n: 22, speed: 120, life: 1.1 });
    } else if (e.type === 'hurt') {
      state.shake = 0.25;
      state.hurtFlash = 0.12;
    } else if (e.type === 'splat') {
      burst(v, e.x, e.y, { n: 10, speed: 50, colors: [FX.SNOW, FX.SNOW_D] });
    } else if (e.type === 'scrape') {
      state.shake = Math.max(state.shake, 0.1);
      burst(v, e.x, e.y + 4, { n: 8, speed: 45, colors: [SLOT.WHITE, FX.SNOW] });
    } else if (e.type === 'wrong') {
      state.shake = Math.max(state.shake, 0.08);
    }
  }

  return {
    get active() { return !!state; },
    /** The running game (diagnostics / automation). */
    get game() { return state?.game ?? null; },
    /**
     * Run a battle. Resolves with { won, stats } when the player claims the reward,
     * skips or gives up.
     */
    start({ boss, design, seed = 1, levelName = '' }) {
      return new Promise(resolve => {
        const mode = MODES[boss.mode] || MODES.runner;
        state = {
          options: { boss, design, seed }, tries: 0, resolve,
          game: createBattleGame(boss, { seed }),
          view: createView({ boss, design, seed }),
          heroColors: heroBaseColors(design),
          bossColors: bossBaseColors({ hue: boss.hue, accentHue: boss.accentHue }),
          minionColors: minionBaseColors({ hue: boss.minionHue ?? boss.hue + 180 }),
          phase: 'intro', countdown: 0, acc: 0, clock: 0, last: null, lastDraw: 0,
          shake: 0, hurtFlash: 0, raf: 0, palette: null, paletteKey: null, drawn: 0, fps: 0, fpsSince: performance.now(),
          trail: TRAIL_STYLES[design.trail] ? pixelColors(TRAIL_STYLES[design.trail].pixels) : null,
        };
        root.hidden = false;
        root.dataset.mode = boss.mode;
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', onBlur);
        canvas.addEventListener('pointerdown', onPointer);
        canvas.addEventListener('pointermove', onPointerMove);
        const capstone = boss.capstone ? '<span class="boss-badge">Region capstone</span>' : '';
        const level = boss.difficulty >= 0.7 ? 'Hard' : boss.difficulty >= 0.4 ? 'Medium' : 'Easy';
        const round = ` <span class="boss-badge round">${level}</span>`;
        const checkpoint = boss.kind === 'checkpoint', travel = boss.kind === 'travel';
        const what = travel ? 'Travel' : checkpoint ? 'Arcade checkpoint' : `Boss battle · ${escapeHtml(mode.name)}`;
        showCard(`<p class="boss-kicker">${levelName ? `${escapeHtml(levelName)} · ` : ''}${what} ${capstone}${round}</p>
          <h2>${escapeHtml(boss.name)}</h2><p class="boss-title">${escapeHtml(boss.title)}</p>
          <ul class="boss-rules">${mode.rules(boss).map(r => `<li>${r}</li>`).join('')}</ul>`,
          travel ? [['Set off! (Enter)', () => begin(), true], ['Walk the long way (no star)', () => close({ won: false })]]
            : checkpoint ? [['Play! (Enter)', () => begin(), true], ['Skip the checkpoint', () => close({ won: false })]] : [['Fight! (Enter)', () => begin(), true], ['Skip — no reward', () => close({ won: false })]]);
        state.raf = requestAnimationFrame(frame);
      });
    },
  };
}

