/**
 * Boss battle screen — runs one of the retro 2D mini-games (games/index.js) after
 * each gem, and reports whether the boss was beaten.
 *
 *   const battle = createBossBattle();
 *   const { won, stats } = await battle.start({ boss, design, seed, levelName });
 *
 * Rendering is pure 2D pixel art into a 320×180 indexed frame (engine/pixel.js), shown on one
 * small canvas scaled up with crisp pixels — no 3D and no vector drawing, so it runs
 * at full speed on machines without a GPU. Each correct key moves the whole palette to
 * a new hue (stage, hero and boss together), the retro-roguelite way.
 *
 * Rules cards (intro, pause, victory, defeat) are plain HTML over the canvas.
 */
import { present, blit } from '../engine/pixel.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';
import { buildScheme, packPalette, heroBaseColors, bossBaseColors, minionBaseColors, SLOT, hslToRgb } from '../engine/palette.js';
import { MODES, createBattleGame } from './index.js';
import { SCREEN } from './kit/common.js';
import { createView, drawBattle, drawBattleHud, burst, updateParticles } from './kit/view.js';
import { STARBEAT } from './starbeat/rules.js';
import { FX, MN, ST, pixelColors } from '../engine/palette.js';
import { TRAIL_STYLES } from '../characters/trails.js';
import { drawSpellOverlay } from './kit/overlay.js';
import { createSpellRuntime, paintSpellIcon } from '../progression/spells.js';
import { paintPet, petBaseColors } from '../characters/pets.js';
import { sound } from '../audio/music.js';
import { ASSIST } from '../ui/options.js';
import { keysFor } from './kit/keys.js';

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

export function createBossBattle({ parent = document.querySelector('main') || document.body, showFps = false, settings = () => ({}) } = {}) {
  /** Assist mode: an extra heart and more time (ui/options.js). */
  const assist = g => { if (!settings().assist) return g; g.maxHearts += ASSIST.hearts; g.hearts += ASSIST.hearts; g.timeLeft = Math.round(g.timeLeft * ASSIST.time); return g; };
  const root = el('section', { class: 'boss-screen', 'aria-label': 'Boss battle' });
  root.hidden = true;
  const canvas = el('canvas', { width: SCREEN.w, height: SCREEN.h, class: 'boss-canvas', 'aria-hidden': 'true' });
  const card = el('div', { class: 'boss-card', role: 'dialog', 'aria-live': 'polite' });
  const spellBar = el('div', { class: 'spell-bar', 'aria-label': 'Spells' });
  const coach = el('p', { class: 'spell-coach', hidden: true });
  const keyStrip = el('p', { class: 'battle-keys', 'aria-hidden': 'true' });     // the game's keys, the same way in every game
  // 3D journeys (games/kit/travel3d.js): the WebGL view shows through; the pixel HUD is drawn on this see-through layer
  const hudCanvas = el('canvas', { width: SCREEN.w, height: SCREEN.h, class: 'boss-hud3d', 'aria-hidden': 'true', hidden: true });
  const flash = el('div', { class: 'battle-flash', hidden: true });
  root.append(canvas, hudCanvas, flash, spellBar, coach, keyStrip, card);
  const hudTarget = { ctx: hudCanvas.getContext('2d'), image: null };
  fitPixelCanvas(hudCanvas);
  let coached = 0;                   // battles the coach bubble has shown in (it shows in the first few)
  parent.append(root);
  // a CPU-side canvas: putImageData every frame never round-trips through a (software) GPU
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const target = { ctx, image: null };
  fitPixelCanvas(canvas);

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
      npc: state.npcColors,
      pet: state.petColors,
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

  // --- spells ------------------------------------------------------------------
  // Spells are cast from the keyboard in every game: 1–5 (top row or numpad) pick one, Tab casts
  // the next one that's ready (no game uses 1–5 or Tab — Key Jump's digits are 6–9 and 0).
  function renderSpellBar() {
    spellBar.replaceChildren();
    const rt = state?.spells;
    if (!rt || !rt.spells.length) { spellBar.hidden = true; return; }
    spellBar.hidden = false;
    state.barVersion = rt.version;
    rt.active.forEach((sp, i) => {
      const icon = paintSpellIcon(document.createElement('canvas'), sp.id, { scale: 2, dim: sp.left <= 0 });
      const cooling = rt.recharge && sp.left < sp.max && sp.cd > 0;
      const button = el('button', { type: 'button', class: `spell${sp.left <= 0 ? ' spent' : ''}`, title: `${sp.name} — ${sp.what}\nTip: ${sp.when}${rt.recharge ? `\nRecharges in ${rt.recharge} s here.` : ''}`, onclick: e => { e.currentTarget.blur(); cast(i); } },
        [icon, el('span', { class: 'spell-key', text: String(i + 1) }), el('span', { class: 'spell-name', text: sp.name }),
          sp.left > 1 ? el('span', { class: 'spell-charges', text: `×${sp.left}` }) : null,
          cooling ? el('span', { class: 'spell-cooldown', text: `${Math.ceil(sp.cd)}s` }) : null]);
      if (sp.left <= 0) button.disabled = true;
      spellBar.append(button);
    });
    for (const sp of rt.spells.filter(x => x.kind === 'passive')) {
      spellBar.append(el('span', { class: 'spell passive', title: `${sp.name} (always on) — ${sp.what}` }, [paintSpellIcon(document.createElement('canvas'), sp.id, { scale: 2 }), el('span', { class: 'spell-name', text: sp.name })]));
    }
  }
  /** "Your spells" for the rules card: what each does, the key, when to use it. */
  function spellsIntro() {
    const rt = state.spells;
    if (!rt.spells.length) return null;
    const once = rt.recharge ? `each recharges ${rt.recharge} s after you use it here` : 'each works once per game';
    const box = el('div', { class: 'boss-spells' }, [el('p', { class: 'boss-spells-title', text: `Your spells — press its number key during the game, or Tab for the next one ready (${once})` })]);
    rt.active.forEach((sp, i) => box.append(el('div', { class: 'boss-spell' }, [
      paintSpellIcon(document.createElement('canvas'), sp.id, { scale: 2 }),
      el('kbd', { text: String(i + 1) }),
      el('div', {}, [el('strong', { text: sp.name }), el('span', { text: ` — ${sp.what}` }), el('em', { text: `Tip: ${sp.when}` })]),
    ])));
    const passives = rt.spells.filter(x => x.kind === 'passive');
    if (passives.length) box.append(el('p', { class: 'boss-spells-passive', text: `Always on: ${passives.map(p => `${p.name} (${p.what.replace(/\.$/, '')})`).join(' · ')}` }));
    return box;
  }
  /** The first battles of a session: a bubble over the spell bar says what to press and when. */
  function showCoach() {
    const first = state.spells.active[0];
    if (!first || coached >= 3) return;
    coached++;
    const more = state.spells.active.length - 1;
    coach.innerHTML = '';
    coach.append(el('strong', { text: `Press 1 (or Tab): ${first.name}` }), el('span', { text: ` — ${first.what} Tip: ${first.when}` }));
    if (more > 0) coach.append(el('span', { text: ` (${more} more spell${more > 1 ? 's' : ''} on the bar.)` }));
    coach.hidden = false;
    clearTimeout(state.coachTimer);
    state.coachTimer = setTimeout(() => { coach.hidden = true; }, 9000);
  }

  function cast(i) {
    if (!state || state.phase !== 'playing') return;
    const r = state.spells.cast(i, state.game);
    if (r.ok) { coach.hidden = true; renderSpellBar(); canvas.focus?.(); }
    else if (r.reason === 'full') state.spells.flash = { text: 'Hearts full', t: 0.8 };
    else if (r.reason === 'spent') state.spells.flash = { text: state.spells.recharge ? `${r.spell.name}: ${Math.ceil(r.spell.cd)} s` : `${r.spell.name} is spent`, t: 0.8 };
  }
  /** Tab: the next spell that would do something now (not a heal at full hearts). */
  function quickCast() {
    if (!state || state.phase !== 'playing') return;
    const g = state.game, list = state.spells.active;
    const i = list.findIndex(sp => sp.left > 0 && !(sp.effect.heal && g.hearts >= g.maxHearts));
    if (i >= 0) cast(i);
    else if (list.length) state.spells.flash = { text: 'No spell ready', t: 0.8 };
  }

  /** 3D or 2D (journeys with a 3D version). */
  function applyView() {
    const on = !!state.use3d;
    root.classList.toggle('three-d', on);
    document.body.classList.toggle('in-battle-3d', on);
    canvas.hidden = on;
    hudCanvas.hidden = !on;
    if (on) state.options.scene3d.attach(state.game);
  }

  // --- flow --------------------------------------------------------------------
  function begin() {
    hideCard();
    if (state.tries === 0) showCoach();
    state.phase = 'countdown';
    state.countdown = 3;
    canvas.focus?.();
  }

  function finish(result) {
    state.phase = 'over';
    const g = state.game;
    sound.jingle(result === 'won' ? 'victory' : 'defeat', g.boss.index || 1);
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
    if (g.boss.kind === 'quest') {
      if (result === 'won') showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>Dungeon cleared!</h2><p><strong>${escapeHtml(g.boss.name)}</strong> is down — ${g.stats.good} foes and blocks, ${g.maxHearts - g.hearts} heart${g.maxHearts - g.hearts === 1 ? '' : 's'} lost.</p>`, [['Back to the surface ▸', () => close({ won: true }), true]]);
      else showCard(`<p class="boss-kicker">${escapeHtml(g.boss.game)}</p><h2>${g.reason === 'time' ? 'Time’s up!' : 'Out of hearts!'}</h2><p>The dungeon spits you out (room ${(g.room ?? 0) + 1} of ${g.rooms?.length ?? 4}).</p>`, [['Try again', () => restart(), true], ['Give up the quest', () => close({ won: false })]]);
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
    state.game = assist(createBattleGame(boss, { seed: seed + (++state.tries) * 7919 }));
    state.spells = createSpellRuntime(state.options.spells, { kind: boss.kind, recharge: (MODES[boss.mode] || MODES.runner).spellRecharge || 0 });
    state.spells.begin(state.game);
    renderSpellBar();
    if (state.use3d) state.options.scene3d.attach(state.game);
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
    root.classList.remove('three-d');
    document.body.classList.remove('in-battle-3d');
    root.style.transform = '';
    spellBar.replaceChildren();
    coach.hidden = true;
    const resolve = state.resolve;
    const stats = state.game.stats, time = state.game.time;
    sound.restore(state.music);
    state = null;
    resolve({ ...outcome, stats, time });
  }

  function pause() {
    state.phase = 'paused';
    showCard('<h2>Paused</h2>', [['Resume', () => { hideCard(); state.phase = 'playing'; state.last = null; canvas.focus?.(); }, true], ['Give up — no reward', () => close({ won: false })]]);
  }

  function onKey(e) {
    if (!state) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const inGame = state.phase === 'playing' || state.phase === 'countdown';
    if (e.code === 'Tab' && !inGame) return;               // (on a card, Tab moves between its buttons)
    const onButton = e.target instanceof HTMLButtonElement;
    if (state.phase === 'playing' || state.phase === 'countdown') {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { if (state.phase === 'playing') pause(); return; }
      const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
      if (digit) { if (!e.repeat) cast(Number(digit[1]) - 1); return; }
      if (e.code === 'Tab') { if (!e.repeat) quickCast(); return; }
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
      const before = Math.ceil(state.countdown);
      state.countdown -= dt;
      if (Math.ceil(state.countdown) !== before && state.countdown > 0) sound.fx('count');
      if (state.countdown <= 0) { state.phase = 'playing'; sound.fx('go'); }
    } else if (state.phase === 'playing') {
      state.acc += dt * state.spells.timeScale;              // slow motion: fewer fixed steps per frame
      // (perf checks: window.__autoplay lets the game's bot play — see scripts/battle-fps.py)
      if (window.__autoplay && !state.bot) state.bot = (MODES[g.mode] || MODES.runner).bot();
      while (state.acc >= STEP) { if (window.__autoplay) state.bot(g, STEP); g.step(STEP); state.spells.afterStep(g); state.acc -= STEP; }
      state.spells.tick(dt);
      if (state.spells.version !== state.barVersion) renderSpellBar();     // a spell came back (the delve), a countdown ticked
      for (const e of g.drain()) effect(e);
      state.spells.drained();
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
    if (settings().reducedMotion) { state.shake = 0; state.hurtFlash = 0; }
    if (state.shake > 0) {
      state.shake -= dt;
      (state.use3d ? root : canvas).style.transform = state.shake > 0 ? `translate(${(Math.random() - 0.5) * 1.2}%, ${(Math.random() - 0.5) * 1.2}%)` : '';
    }
    const drawStart = performance.now();
    if (state.use3d) {
      // the 3D journey: the same game, drawn by the WebGL renderer; the pixel HUD on top
      state.options.scene3d.draw(g, dt, state.clock);
      drawBattleHud(state.view, g, { phase: state.phase, countdown: state.countdown, clock: state.clock, fps: showFps ? state.fps : null });
      if (state.phase === 'playing' || state.phase === 'paused') drawSpellOverlay(state.view.screen, state.spells, [160, 120], state.clock);
      if (state.pet) drawPet(state.view.screen, g, dt);
      const pal = palette().slice();
      pal[0] = 0;                                   // index 0: see-through
      present(state.view.screen, pal, hudTarget);
      state.drawMs = state.drawMs * 0.9 + (performance.now() - drawStart) * 0.1;
      return;
    }
    drawBattle(state.view, g, { phase: state.phase, countdown: state.countdown, clock: state.clock, fps: showFps ? state.fps : null });
    if (state.phase === 'playing' || state.phase === 'paused') drawSpellOverlay(state.view.screen, state.spells, heroAt(g), state.clock);
    if (state.pet) drawPet(state.view.screen, g, dt);
    present(state.view.screen, palette(), target);
    state.drawMs = state.drawMs * 0.9 + (performance.now() - drawStart) * 0.1;   // CPU per drawn frame (perf checks)
  }

  /** Where the hero / the boss are on screen, per mini-game (for effects). */
  function heroAt(g) { return (MODES[g.mode] || MODES.runner).heroAt?.(g) || [92, 100]; }
  function bossAt(g) { return (MODES[g.mode] || MODES.runner).bossAt?.(g) || null; }

  /** The pet sits on the HUD beside your hearts and reacts (characters/pets.js: cosmetic only). */
  function drawPet(s, g, dt) {
    const pet = state.pet;
    pet.moodT = Math.max(0, pet.moodT - dt);
    const pose = g.result === 'won' || g.victory > 0 ? 'cheer' : g.result === 'lost' ? 'sleep' : pet.moodT > 0 ? pet.mood : 'sit';
    const frame = Math.floor(state.clock * (pose === 'cheer' ? 6 : 2)) % 2;
    const key = `${pose}|${frame}`;
    if (!pet.sprites.has(key)) pet.sprites.set(key, paintPet(pet.data, pose, frame));
    const x = 8 + g.maxHearts * 9, bob = pose === 'cheer' ? -Math.abs(Math.sin(state.clock * 10)) * 3 : 0;
    blit(s, pet.sprites.get(key), x, bob, {});
  }
  function petMood(mood, t) { if (state.pet) { state.pet.mood = mood; state.pet.moodT = t; } }

  function effect(e) {
    const g = state.game, v = state.view;
    effectSound(e, g);
    if (e.type === 'good') petMood('hop', 0.35);
    else if (e.type === 'hurt' && !e.blocked) petMood('hide', 0.9);
    if (state.use3d) {                               // 3D: effects in the world, a red flash when hit
      state.options.scene3d.effect(e, g);
      if (e.type === 'hurt' && !e.blocked && !settings().reducedMotion) { state.shake = 0.25; flash.hidden = false; flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
      return;
    }
    if (e.type === 'good') {
      if (g.mode === 'quickdraw') burst(v, e.x, e.y, { n: 14, speed: 60, colors: [MN.LIGHT, MN.BODY, SLOT.WHITE] });
      else if (g.mode === 'sled') burst(v, ...heroAt(g), { n: 16, speed: 70, colors: [FX.SNOW, FX.SNOW_D, SLOT.WHITE] });
      else if (g.mode === 'starbeat') burst(v, STARBEAT.lanes[e.lane], STARBEAT.hitY, { n: e.perfect ? 14 : 8, speed: 60, gravity: 40 });
      else { const [x, y] = heroAt(g); burst(v, x, y, { n: g.mode === 'runner' ? 16 : 10, speed: 60, gravity: 60 }); }
    } else if (e.type === 'pop') {
      burst(v, e.x, e.y, { n: 10, speed: 55, colors: [MN.LIGHT, MN.BODY, SLOT.WHITE] });
    } else if (e.type === 'bossHit') {
      const at = bossAt(g);
      if (at && g.mode !== 'quickdraw' && g.mode !== 'starbeat') burst(v, at[0], at[1], { n: 20, speed: 110 });
    } else if (e.type === 'bossDefeated') {
      for (let i = 0; i < 6; i++) burst(v, 120 + i * 30, 50 + (i % 3) * 25, { n: 22, speed: 120, life: 1.1 });
    } else if (e.type === 'hurt' && e.blocked) {
      const [x, y] = heroAt(g);
      burst(v, x, y, { n: 14, speed: 70, colors: [SLOT.CYAN, SLOT.WHITE], gravity: 0 });
    } else if (e.type === 'spell') {
      const [x, y] = heroAt(g);
      burst(v, x, y, { n: 24, speed: 90, gravity: 0, life: 0.9 });
    } else if (e.type === 'arrow' || e.type === 'thorns' || e.type === 'pounce') {
      const at = bossAt(g) || [250, 70];
      burst(v, at[0], at[1], { n: 12, speed: 80, colors: e.type === 'thorns' ? [SLOT.RED, SLOT.WHITE] : [SLOT.GOLD, SLOT.WHITE] });
    } else if (e.type === 'laststand') {
      const [x, y] = heroAt(g);
      burst(v, x, y, { n: 30, speed: 110, colors: [SLOT.GOLD, SLOT.RED, SLOT.WHITE], gravity: 0, life: 1 });
      state.shake = 0.3;
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

  /** The game's events as chip sounds (games/<id>/rules.js events). */
  function effectSound(e, g) {
    const t = e.type;
    if (t === 'good') sound.fx(e.block ? 'block' : e.parry ? 'parry' : 'good', { combo: g.steps % 12 });
    else if (t === 'wrong') sound.fx('wrong');
    else if (t === 'hurt') sound.fx(e.blocked ? 'block' : 'hurt');
    else if (t === 'bossHit') sound.fx('bossHit');
    else if (t === 'bossDefeated') sound.fx('bossDefeated');
    else if (t === 'spell') sound.fx('spell');
    else if (t === 'heal') sound.fx('heal');
    else if (t === 'laststand') sound.fx('heal');
    else if (t === 'block' || t === 'clink') sound.fx('block');
    else if (t === 'parry' || t === 'stagger') sound.fx('parry');
    else if (t === 'swing') sound.fx('swing');
    else if (t === 'shoot') sound.fx(e.kind === 'bolt' ? 'bolt' : 'shoot');
    else if (t === 'loose' || t === 'arrow') sound.fx('shoot', { gap: 60 });
    else if (t === 'slam' || t === 'crash') sound.fx('slam');
    else if (t === 'roll') sound.fx('roll');
    else if (t === 'blink') sound.fx('blink');
    else if (t === 'jump') sound.fx('jump');
    else if (t === 'land') sound.fx('land');
    else if (t === 'scrape' || t === 'splat') sound.fx('splash', { gap: 120 });
    else if (t === 'room' || t === 'clear') sound.fx('checkpoint');
    else if (t === 'kill') sound.fx('defeat');
    else if (t === 'pop') sound.fx('stomp');
  }

  return {
    get active() { return !!state; },
    /** The running game (diagnostics / automation). */
    get game() { return state?.game ?? null; },
    /** Frame rate and drawing cost (perf checks): { fps, drawMs }. */
    get perf() { return state ? { fps: state.fps, drawMs: state.drawMs } : null; },
    /**
     * Run a battle. Resolves with { won, stats } when the player claims the reward,
     * skips or gives up.
     */
    start({ boss, design, seed = 1, levelName = '', spells = [], pet = null, scene3d = null, use3d = false, onViewChange = () => {} }) {
      return new Promise(resolve => {
        const mode = MODES[boss.mode] || MODES.runner;
        state = {
          options: { boss, design, seed, spells, pet, scene3d, onViewChange }, tries: 0, resolve,
          game: assist(createBattleGame(boss, { seed })),
          spells: createSpellRuntime(spells, { kind: boss.kind, recharge: mode.spellRecharge || 0 }),
          view: createView({ boss, design, seed }),
          heroColors: heroBaseColors(design),
          bossColors: bossBaseColors({ hue: boss.hue, accentHue: boss.accentHue }),
          minionColors: minionBaseColors({ hue: boss.minionHue ?? boss.hue + 180 }),
          npcColors: boss.npc ? heroBaseColors(boss.npc.design) : null,
          petColors: pet ? petBaseColors(pet) : null,
          pet: pet ? { data: pet, sprites: new Map(), mood: null, moodT: 0 } : null,
          phase: 'intro', countdown: 0, acc: 0, clock: 0, last: null, lastDraw: 0,
          shake: 0, hurtFlash: 0, raf: 0, palette: null, paletteKey: null, drawn: 0, fps: 0, fpsSince: performance.now(), drawMs: 0,
          trail: TRAIL_STYLES[design.trail] ? pixelColors(TRAIL_STYLES[design.trail].pixels) : null,
        };
        state.spells.begin(state.game);
        renderSpellBar();
        const keys = keysFor(MODES[boss.mode], { spells: state.spells.active.length > 0 });
        keyStrip.replaceChildren(...keys.flatMap(([k, what], i) => [i ? ' · ' : '', el('kbd', { text: k }), ` ${what}`]));
        state.music = sound.chip.playing;             // (the tune to go back to afterwards)
        sound.battle(boss);
        state.use3d = use3d && !!scene3d?.supports(boss.mode);
        applyView();
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
        const quest = boss.kind === 'quest';
        const what = travel ? 'Travel' : checkpoint ? 'Arcade checkpoint' : quest ? `Quest · ${escapeHtml(mode.name)}` : `Boss battle · ${escapeHtml(mode.name)}`;
        showCard(`<p class="boss-kicker">${levelName ? `${escapeHtml(levelName)} · ` : ''}${what} ${capstone}${round}</p>
          <h2>${escapeHtml(boss.name)}</h2><p class="boss-title">${escapeHtml(boss.title)}</p>
          <ul class="boss-rules">${mode.rules(boss).map(r => `<li>${r}</li>`).join('')}</ul>
          <p class="boss-keys">${keysFor(MODES[boss.mode], { spells: state.spells.active.length > 0 }).map(([k, what]) => `<kbd>${escapeHtml(k)}</kbd> ${escapeHtml(what)}`).join(' · ')}</p>`,
          travel ? [['Set off! (Enter)', () => begin(), true], ['Walk the long way (no star)', () => close({ won: false })]]
            : checkpoint ? [['Play! (Enter)', () => begin(), true], ['Skip the checkpoint', () => close({ won: false })]]
              : quest ? [['Down we go! (Enter)', () => begin(), true], ['Not now', () => close({ won: false })]] : [['Fight! (Enter)', () => begin(), true], ['Skip — no reward', () => close({ won: false })]]);
        const spellsCard = spellsIntro();
        if (spellsCard) card.insertBefore(spellsCard, card.querySelector('.boss-buttons'));
        if (scene3d?.supports(boss.mode)) {            // a journey with a 3D version: switch between them
          const label = () => (state.use3d ? '▦ Play the 2D version' : '🎥 Play the 3D version');
          const toggle = el('button', { type: 'button', class: 'view-toggle', text: label(), onclick: e => { state.use3d = !state.use3d; applyView(); e.currentTarget.textContent = label(); onViewChange(state.use3d ? '3d' : '2d'); card.querySelector('button.primary')?.focus(); } });
          card.querySelector('.boss-buttons')?.append(toggle);
        }
        state.raf = requestAnimationFrame(frame);
      });
    },
  };
}

