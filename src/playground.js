/**
 * Avatar Playground
 * A sandbox arena for evaluating the player avatar: free movement over varied
 * terrain, an orbit camera, slow motion / frame stepping, forced animation
 * previews, outfit swapping and a physics-hitbox overlay.
 */
import { createLevel } from './levelBuilder.js';
import { createPlayer, stepPlayer } from './physics.js';
import { createRenderer, chaseCamera } from './renderer.js';
import { particleSystem } from './particles.js';
import { createAvatar, computeShadow, emitAvatarEffects, AVATAR_PALETTES } from './avatar.js';
import { BIOMES } from './biomes.js';
import { buildScenery } from './scenery.js';
import { resolveQuality, sceneryForQuality } from './quality.js';
import { createFpsMeter } from './fpsMeter.js';
import { createSession } from './session.js';
import { enemyParts } from './enemies.js';
import { emitGameplayEffects } from './effects.js';
import { createHealthHud } from './hud.js';
import { createCharacterStore } from './character.js';
import { paintPortrait } from './characterScreen.js';

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------
function buildArena() {
  const b = createLevel('Playground').setSpawn(0, 0.5, 0);
  const GRASS_A = [1.06, 1.06, 1.06], GRASS_B = [0.9, 0.92, 0.9];
  const tile = (x, z) => b.addPlatform(x, 0, z, 2, 1, 2);
  // main field: x -12..12, z -6..14 (checkerboard helps judge speed & stride)
  for (let ix = 0; ix < 12; ix++) for (let iz = 0; iz < 10; iz++) tile(-11 + ix * 2, -5 + iz * 2);
  // island across a 3-unit pit: x -4..4, z 17..23
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) tile(-3 + ix * 2, 18 + iz * 2);
  const level = b.level;
  level.platforms.forEach(p => {
    const checker = (Math.round((p.x + 11) / 2) + Math.round((p.z + 5) / 2)) % 2;
    p.tint = checker ? GRASS_A : GRASS_B; // checkerboard helps judge speed & stride
  });

  const solid = (x, z, w, d, bottom, top, material) =>
    level.platforms.push({ x, y: (bottom + top) / 2, z, width: w, height: top - bottom, depth: d, material, tint: [1, 1, 1] });
  // staircase (screen-left) up to a high ledge — test climbing, big drop + landing
  [1, 1.5, 2, 2.5].forEach((top, i) => solid(8, i * 2, 3, 2, 0.5, top, 'stone'));
  solid(8, 9, 3, 4, 0.5, 3.5, 'stone');
  // long wall (screen-right) — test collision / sliding
  solid(-7, 4, 0.8, 8, 0.5, 3.5, 'brick');
  // low hurdle — run & hop
  solid(1.5, 5, 3, 0.6, 0.5, 1.0, 'wood');
  // floating block — bonk your head when jumping under it
  solid(-2.5, 10, 2.5, 2.5, 2.7, 3.2, 'wood');

  // combat pad with a crawler; a spiker guards the high ledge; a wisp glides over the pit
  solid(4.5, 10.5, 4.5, 3, 0.5, 1.0, 'wood');
  const pad = level.platforms.length - 1;
  const ledge = level.platforms.findIndex(p => p.x === 8 && p.z === 9);
  level.enemies = [
    { type: 'crawler', platform: pad, axis: 'x', phase: 0.2 },
    { type: 'spiker', platform: ledge, axis: 'z', phase: 0.6 },
    { type: 'wisp', from: [-3, 1.7, 15.5], to: [3, 1.7, 15.5], phase: 0.3 },
  ];
  level.goal = { x: 0, y: 0.5, z: 21, radius: 1 };
  return level;
}

const level = buildArena();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const canvas = document.querySelector('#game');
const status = document.querySelector('#status');
const keys = new Set();
const session = createSession(level);
let player = session.player;
const avatar = createAvatar();
avatar.reset(player);
let jump = false;
let timeScale = 1;
let paused = false;
let stepRequests = 0;
let cameraMode = 'follow';
let orbit = { yaw: Math.PI, pitch: 0.35, dist: 5.5 };
let showHitbox = false, showShadow = true, showDust = true, legacyBox = false;
let onGoal = false;
let biome = BIOMES.meadow;
const quality = resolveQuality();
const benchSeconds = Number(new URLSearchParams(location.search).get('bench')) || 0;
// ?ui=0 hides the HUD and side panel (clean view; also used to measure compositing cost)
if (new URLSearchParams(location.search).get('ui') === '0') {
  for (const el of [document.querySelector('.hud'), document.getElementById('panel')]) if (el) el.style.display = 'none';
}
let meter = null;
const hud = createHealthHud(3);
const sceneryCache = new Map();
function scenery() {
  if (!sceneryCache.has(biome.id)) sceneryCache.set(biome.id, buildScenery(level, biome, null));
  return sceneryCache.get(biome.id);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyQ', 'KeyK'];

function resetPlayer() {
  session.reset();
  player = session.player;
  avatar.reset(player);
  particleSystem.clear();
}
let dash = false, pound = false;
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyJ'], POUND_KEYS = ['KeyQ', 'KeyK'];

window.addEventListener('keydown', event => {
  if (GAME_KEYS.includes(event.code)) {
    event.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  if (event.code === 'Space' && !keys.has(event.code)) jump = true;
  if (DASH_KEYS.includes(event.code) && !keys.has(event.code)) dash = true;
  if (POUND_KEYS.includes(event.code) && !keys.has(event.code)) pound = true;
  if (!event.repeat) {
    if (event.code === 'KeyR') resetPlayer();
    if (event.code === 'KeyP') setPaused(!paused);
    if (event.code === 'KeyN') requestStep();
    if (event.code === 'KeyC') setCamera(cameraMode === 'follow' ? 'orbit' : 'follow');
    if (event.code === 'KeyH') { showHitbox = !showHitbox; ui.hitbox.checked = showHitbox; }
  }
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); jump = false; });

/** Bench mode: a repeatable run around the arena (forward, strafe, hop, turn back). */
const BENCH_SCRIPT = [
  [1.6, ['KeyW']], [1.2, ['KeyW', 'KeyA']], [0.2, ['KeyW', 'Space']], [1.4, ['KeyD']],
  [1.0, ['KeyS', 'KeyD']], [0.2, ['KeyS', 'Space']], [1.4, ['KeyA']], [1.2, ['KeyS']],
];
let benchClock = 0;
function benchKeys() {
  const total = BENCH_SCRIPT.reduce((s, [d]) => s + d, 0);
  let t = benchClock % total;
  for (const [d, codes] of BENCH_SCRIPT) { if (t < d) return codes; t -= d; }
  return [];
}

function readInput() {
  if (benchSeconds) {
    const codes = benchKeys();
    keys.clear();
    for (const c of codes) keys.add(c);
    if (codes.includes('Space') && player.grounded) jump = true;
  }
  const has = code => keys.has(code);
  const ix = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0); // screen right
  const iz = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);   // screen forward
  if (!ix && !iz) return { left: false, right: false, forward: false, back: false };
  if (cameraMode === 'follow') {
    return { left: ix < 0, right: ix > 0, forward: iz > 0, back: iz < 0 };
  }
  // Orbit: camera-relative, snapped to the 8 directions the physics supports.
  const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw);  // camera forward (xz)
  const rx = -fz, rz = fx;                                     // camera right (xz)
  const wx = ix * rx + iz * fx, wz = ix * rz + iz * fz;
  const angle = Math.round(Math.atan2(wx, wz) / (Math.PI / 4)) * (Math.PI / 4);
  const sx = Math.sin(angle), sz = Math.cos(angle);
  // physics: +x = "left", +z = "forward"
  return { left: sx > 0.3, right: sx < -0.3, forward: sz > 0.3, back: sz < -0.3 };
}

// Orbit camera: drag + wheel
let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (cameraMode !== 'orbit') setCamera('orbit');
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.008;
  orbit.pitch = Math.max(-0.2, Math.min(1.4, orbit.pitch + (e.clientY - drag.y) * 0.006));
  drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (cameraMode !== 'orbit') setCamera('orbit');
  orbit.dist = Math.max(2, Math.min(18, orbit.dist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

function orbitCamera() {
  const target = [player.x, player.y + 0.85, player.z];
  const c = Math.cos(orbit.pitch);
  return {
    eye: [target[0] + Math.sin(orbit.yaw) * c * orbit.dist, target[1] + Math.sin(orbit.pitch) * orbit.dist, target[2] + Math.cos(orbit.yaw) * c * orbit.dist],
    target,
  };
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const ui = {
  state: $('ro-state'), speed: $('ro-speed'), vy: $('ro-vy'), grounded: $('ro-grounded'),
  yaw: $('ro-yaw'), blend: $('ro-blend'), squash: $('ro-squash'), fps: $('ro-fps'),
  hitbox: $('opt-hitbox'), shadow: $('opt-shadow'), dust: $('opt-dust'), legacy: $('opt-legacy'),
  timeScale: $('time-scale'), timeLabel: $('time-label'), pause: $('pause'),
};

function segmented(container, onSelect) {
  const buttons = [...container.querySelectorAll('button')];
  const select = value => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.value === value));
    onSelect(value);
  };
  buttons.forEach(b => b.addEventListener('click', () => { select(b.dataset.value); b.blur(); }));
  return select;
}

const setPreview = segmented($('preview'), value => { avatar.preview = value; });
const setCameraUI = segmented($('camera'), value => { cameraMode = value; });
function setCamera(mode) {
  if (mode === 'orbit' && cameraMode !== 'orbit') {
    // start the orbit from the current chase-camera angle for continuity
    const chase = chaseCamera(player);
    orbit.yaw = Math.atan2(chase.eye[0] - player.x, chase.eye[2] - player.z);
  }
  setCameraUI(mode);
}
$('camera').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setCamera(b.dataset.value), true));

$('front-view').addEventListener('click', e => {
  setCamera('orbit');
  orbit = { yaw: avatar.yaw, pitch: 0.15, dist: 4 };
  e.currentTarget.blur();
});
$('side-view').addEventListener('click', e => {
  setCamera('orbit');
  orbit = { yaw: avatar.yaw + Math.PI / 2, pitch: 0.1, dist: 4.5 };
  e.currentTarget.blur();
});

function setPaused(value) {
  paused = value;
  ui.pause.textContent = paused ? 'Resume' : 'Pause';
  ui.pause.classList.toggle('active', paused);
}
function requestStep() {
  setPaused(true);
  stepRequests += 2; // 1/60 s
}
ui.pause.addEventListener('click', e => { setPaused(!paused); e.currentTarget.blur(); });
$('step').addEventListener('click', e => { requestStep(); e.currentTarget.blur(); });
$('reset').addEventListener('click', e => { resetPlayer(); e.currentTarget.blur(); });

ui.timeScale.addEventListener('input', () => {
  timeScale = Number(ui.timeScale.value);
  ui.timeLabel.textContent = `${timeScale.toFixed(2)}×`;
});
ui.timeScale.addEventListener('change', () => ui.timeScale.blur());
ui.hitbox.addEventListener('change', () => { showHitbox = ui.hitbox.checked; ui.hitbox.blur(); });
ui.shadow.addEventListener('change', () => { showShadow = ui.shadow.checked; ui.shadow.blur(); });
ui.dust.addEventListener('change', () => { showDust = ui.dust.checked; ui.dust.blur(); });
ui.legacy.addEventListener('change', () => { legacyBox = ui.legacy.checked; ui.legacy.blur(); });

const biomeSelect = $('biome');
for (const b of Object.values(BIOMES)) {
  const option = document.createElement('option');
  option.value = b.id;
  option.textContent = b.name;
  biomeSelect.append(option);
}
biomeSelect.addEventListener('change', () => { biome = BIOMES[biomeSelect.value]; biomeSelect.blur(); });

// Outfits: the game's heroes and the player's own designs (character screen), then the legacy palettes
const paletteContainer = $('palettes');
const characters = createCharacterStore();
const outfits = [
  ...characters.all().map(design => ({ title: design.name, apply: () => avatar.setCharacter(design), design })),
  ...(characters.draft() ? [{ title: `${characters.draft().name} (unsaved)`, apply: () => avatar.setCharacter(characters.draft()), design: characters.draft() }] : []),
  ...Object.entries(AVATAR_PALETTES).map(([name, pal]) => ({ title: `${name} palette`, apply: () => avatar.setPalette(name), pal })),
];
const selectedId = characters.selected().id;
for (const outfit of outfits) {
  const button = document.createElement('button');
  button.title = outfit.title;
  if (outfit.design) {
    const canvas = document.createElement('canvas');
    canvas.width = 48; canvas.height = 56;
    paintPortrait(canvas, outfit.design, { framing: 'bust', background: [[0.2, 0.27, 0.38], [0.3, 0.38, 0.5]] });
    button.classList.add('portrait');
    button.append(canvas);
  } else {
    const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
    button.innerHTML = [outfit.pal.cap, outfit.pal.shirt, outfit.pal.pants].map(c => `<span style="background:${css(c)}"></span>`).join('');
  }
  if (outfit.design?.id === selectedId) { button.classList.add('active'); outfit.apply(); }
  button.addEventListener('click', () => {
    outfit.apply();
    paletteContainer.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
    button.blur();
  });
  paletteContainer.append(button);
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const STEP = 1 / 120;
let render;
let lastTime;
let accumulator = 0;
let fpsFrames = 0, fpsTime = 0, fps = 0, hudTimer = 0;

function tick() {
  if (benchSeconds) {
    benchClock += STEP;
    if (Math.abs(player.x) > 9 || player.z > 12 || player.z < -4) { resetPlayer(); }
  }
  const { result, events: gameEvents } = session.step({ ...readInput(), jump, dash, pound }, STEP);
  jump = dash = pound = false;
  if (player !== session.player) {            // respawned (fell, or the level restarted)
    player = session.player;
    avatar.reset(player);
    particleSystem.emit(player.x, player.y, player.z, { count: 10, speed: 5, color: [0.9, 0.3, 0.25], lifetime: 0.8 });
  }
  emitGameplayEffects(gameEvents, particleSystem);
  if (gameEvents.some(e => e.type === 'hurt' || e.type === 'fell')) hud.flash();
  if (result === 'goal' && !onGoal) {
    particleSystem.emit(level.goal.x, level.goal.y + 1.4, level.goal.z, { count: 24, speed: 7, color: [1, 0.83, 0.15], lifetime: 1.4 });
  }
  onGoal = result === 'goal';
  const events = avatar.update(player, STEP);
  if (showDust) emitAvatarEffects(events, particleSystem);
  particleSystem.update(STEP);
}

function updateHud(dt) {
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.08;
  ui.state.textContent = avatar.preview === 'live' ? avatar.state : `${avatar.state} (preview)`;
  ui.speed.textContent = `${avatar.speed.toFixed(2)} u/s`;
  ui.vy.textContent = `${avatar.vy.toFixed(2)} u/s`;
  ui.grounded.textContent = avatar.grounded ? 'yes' : 'no';
  ui.yaw.textContent = `${Math.round((avatar.yaw * 180) / Math.PI)}°`;
  ui.blend.textContent = `${avatar.runBlend.toFixed(2)} / ${avatar.airBlend.toFixed(2)}`;
  ui.squash.textContent = avatar.squash.toFixed(3);
  ui.fps.textContent = meter ? meter.fps : fps;
  status.textContent = paused
    ? 'Paused — press N to step, P to resume.'
    : `Explore: stairs & ledge (left), wall (right), hurdle, head-bonk block, pit & the gem ahead.${timeScale !== 1 ? ` Slow-mo ${timeScale.toFixed(2)}×` : ''}`;
}

function frame(time) {
  const realDt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (!paused) accumulator += realDt * timeScale;
  while (accumulator >= STEP) { tick(); accumulator -= STEP; }
  while (stepRequests > 0) { tick(); stepRequests--; }

  render(level, player, particleSystem.getActiveParticles(), {
    avatar: legacyBox ? null : (session.invulnerable > 0 && Math.floor(session.time * 14) % 2 ? [] : avatar.getParts(player)),
    boxes: session.enemyBoxes(enemyParts),
    shadow: showShadow ? computeShadow(level, player) : null,
    camera: cameraMode === 'orbit' ? orbitCamera() : undefined,
    hitbox: showHitbox,
    biome,
    scenery: sceneryForQuality(scenery(), render.quality),
  });
  updateHud(realDt);
  hud.update(session);
  meter.frame(time);
  requestAnimationFrame(frame);
}

try {
  render = createRenderer(canvas, quality);
  meter = createFpsMeter(quality, { canvas, renderer: render });
  requestAnimationFrame(frame);
  if (benchSeconds) {
    meter.startBench(benchSeconds, Number(new URLSearchParams(location.search).get('warmup')) || undefined).then(r => {
      status.textContent = `Bench: ${r.fps.toFixed(1)} fps avg · ${r.lowFps.toFixed(1)} fps low · ${r.canvas?.join('×')}`;
    });
  }
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
  console.error(error);
}

// Exposed for debugging from the console.
window.playground = {
  get render() { return render; },
  avatar, level, keys, setPreview, setCamera, session,
  get player() { return player; },
  orbit: () => orbit,
  step(n = 1) { for (let i = 0; i < n; i++) tick(); },
};
