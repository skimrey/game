/**
 * Level Lab — inspect, audit, play and watch the bot solve any level:
 * campaign levels or freshly generated ones (seed + difficulty).
 */
import { levels, handcraftedLevels, tierForDifficulty } from '../levels/index.js';
import { BIOMES } from '../world/biomes.js';
import { environmentFor } from '../world/environment.js';
import { auditScenery } from '../world/scenery.js';
import { auditFun, designDifficulty } from '../levels/funAudit.js';
import { resolveQuality, sceneryForQuality } from '../engine/quality.js';
import { createFpsMeter } from '../engine/fpsMeter.js';
import { createPlayer, stepPlayer } from '../world/physics.js';
import { createSession } from '../world/session.js';
import { enemyParts } from '../world/enemies.js';
import { emitGameplayEffects } from '../engine/effects.js';
import { createHealthHud } from '../ui/hud.js';
import { auditEncounters } from '../levels/encounterAudit.js';
import { createRenderer, chaseCamera } from '../engine/renderer.js';
import { particleSystem } from '../engine/particles.js';
import { createAvatar, computeShadow, emitAvatarEffects } from '../characters/avatar.js';
import { auditLevel, decodeInput, topOf, DT } from '../levels/audit.js';
import { generateLevel } from '../levels/generator.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const status = $('status');
const labels = $('labels');
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let level = null;
let audit = null;
let environment = null;
let sceneryAudit = null;
let funAudit = null;
let biomeOverride = null;
let trajectory = [];
let player = null;
let session = null;
let encounterAudit = null;
const encounterCache = new WeakMap();
let dash = false, pound = false;
const hud = createHealthHud(3);
/** The bot run to show: the combat bot's (enemies active) when the level has enemies. */
const botInputs = () => (level.enemies?.length ? encounterAudit?.combat?.inputs : null) || audit.solution?.inputs || null;
let mode = 'play';
let cameraMode = 'follow';
let botTick = 0;
let botSpeed = 1;
let botDoneTimer = 0;
let runTime = 0;
let finishedTime = null;
let jump = false;
const keys = new Set();
const avatar = createAvatar();
const orbit = { yaw: Math.PI, pitch: 0.6, dist: 20, target: [0, 0, 0] };

// ---------------------------------------------------------------------------
// Level selection
// ---------------------------------------------------------------------------
const select = $('level-select');
levels.forEach((l, i) => {
  const option = document.createElement('option');
  option.value = String(i);
  const tag = i < handcraftedLevels.length ? 'hand-made' : `generated · seed ${l.meta.seed} · d ${l.meta.difficulty}`;
  option.textContent = `${i + 1}. ${l.name} (${tag})`;
  select.append(option);
});
const custom = document.createElement('option');
custom.value = 'custom';
custom.textContent = '✦ Generator (custom seed)';
select.append(custom);

function loadLevel(next, { generation = null } = {}) {
  level = next;
  environment = environmentFor(level, biomeOverride);
  audit = environment.audit;
  sceneryAudit = auditScenery(level, environment.scenery, audit);
  funAudit = auditFun(level, audit, designDifficulty(level));
  if (!encounterCache.has(level)) encounterCache.set(level, auditEncounters(level, audit));
  encounterAudit = encounterCache.get(level);
  trajectory = computeTrajectory();
  $('title').textContent = level.name;
  frameOverview();
  restart();
  renderReport(generation);
  buildLabels();
  const index = levels.indexOf(level);
  $('open-game').href = index >= 0
    ? `./index.html?level=${index + 1}`
    : `./index.html?seed=${level.meta.seed}&difficulty=${level.meta.difficulty}`;
}

function loadFromControls() {
  if (select.value === 'custom') {
    $('generator').hidden = false;
    const seed = Math.max(1, Math.floor(Number($('seed').value) || 1));
    const difficulty = Number($('difficulty').value);
    try {
      const result = generateLevel({ seed, difficulty });
      result.level.tier = tierForDifficulty(difficulty).id;
      loadLevel(result.level, { generation: result });
    } catch (error) {
      status.textContent = error.message;
    }
  } else {
    $('generator').hidden = true;
    loadLevel(levels[Number(select.value)]);
  }
}

select.addEventListener('change', () => { loadFromControls(); select.blur(); });
const biomeSelect = $('biome');
for (const b of Object.values(BIOMES)) {
  const option = document.createElement('option');
  option.value = b.id;
  option.textContent = b.name;
  biomeSelect.append(option);
}
biomeSelect.addEventListener('change', () => {
  biomeOverride = biomeSelect.value || null;
  loadLevel(level);
  biomeSelect.blur();
});
$('difficulty').addEventListener('input', () => { $('difficulty-label').textContent = Number($('difficulty').value).toFixed(2); });
$('difficulty').addEventListener('change', () => { loadFromControls(); $('difficulty').blur(); });
$('seed').addEventListener('change', loadFromControls);
const bumpSeed = delta => { $('seed').value = Math.max(1, Number($('seed').value) + delta); loadFromControls(); };
$('prev-seed').addEventListener('click', e => { bumpSeed(-1); e.currentTarget.blur(); });
$('next-seed').addEventListener('click', e => { bumpSeed(1); e.currentTarget.blur(); });
$('random-seed').addEventListener('click', e => { $('seed').value = 1 + Math.floor(Math.random() * 99999); loadFromControls(); e.currentTarget.blur(); });

// ---------------------------------------------------------------------------
// Audit report
// ---------------------------------------------------------------------------
function renderReport(generation) {
  const badge = $('badge');
  const state = !audit.ok ? 'fail' : audit.warnings.length ? 'warn' : 'pass';
  badge.className = `badge ${state}`;
  badge.textContent = { fail: 'FAIL', warn: 'PASS*', pass: 'PASS' }[state];

  const m = audit.metrics;
  const rows = m ? [
    ['Rating', `${m.rating.toFixed(1)} / 10`],
    ['Jumps', m.jumps],
    ['Hardest jump', `${(m.maxDifficulty * 100).toFixed(0)}% of limit`],
    ['Avg jump', `${(m.avgDifficulty * 100).toFixed(0)}%`],
    ['Max rise / drop', `${m.maxRise.toFixed(2)} / ${m.maxDrop.toFixed(2)}`],
    ['Moves', `${m.moves.jump} jumps · ${m.moves.dash} air-dash jump${m.moves.dash === 1 ? '' : 's'}${m.dashWindow ? ` (timing window ${(m.dashWindow * 1000).toFixed(0)} ms)` : ''} · ${m.moves.longDrop} long drop${m.moves.longDrop === 1 ? '' : 's'}`],
    ['Bot par time', `${m.parTime.toFixed(1)} s`],
    ['Platforms', m.platforms],
  ] : [['Platforms', level.platforms.length]];
  rows.unshift(['Tier', `${environment.tier.label} · ${environment.tier.name}`]);
  rows.push(['Environment', `${environment.biome.name}${biomeOverride ? ' (override)' : ''}`]);
  rows.push(['Scenery', `${environment.scenery.boxes.length} boxes · ${sceneryAudit.ok ? 'safe' : 'UNSAFE'}`]);
  if (funAudit.metrics) {
    const f = funAudit.metrics, req = funAudit.requirements;
    const mark = (value, min) => (value >= min ? '✓' : '✗');
    rows.push(['— Fun', `${f.funScore.toFixed(1)} / 10 (design difficulty ${f.difficulty.toFixed(2)})`]);
    rows.push(['False paths', `${f.falsePaths} ${mark(f.falsePaths, req.falsePaths)} (needs ${req.falsePaths})`]);
    rows.push(['Directions', `${f.directions.length} ${mark(f.directions.length, req.directions)} ${f.directions.join(' ')}`]);
    rows.push(['Sideways / fwd', `${f.lateralRatio.toFixed(2)} ${mark(f.lateralRatio, req.lateralRatio)} (≥ ${req.lateralRatio.toFixed(2)})`]);
    rows.push(['Up+down / fwd', `${f.verticalRatio.toFixed(2)} ${mark(f.verticalRatio, req.verticalRatio)} (≥ ${req.verticalRatio.toFixed(2)})`]);
    rows.push(['Turns', `${f.turns} ${mark(f.turns, req.turns)} (≥ ${req.turns})`]);
    rows.push(['Min placement diff', `${f.minPlacementDifference.toFixed(2)}`]);
    rows.push(['Air-dash gaps', `${f.dashes} ${mark(f.dashes, req.dashes)} (needs ${req.dashes})`]);
    rows.push(['Long drops', `${f.longDrops} ${mark(f.longDrops, req.longDrops)} (needs ${req.longDrops})`]);
    rows.push(['Shortcuts', `${f.shortcuts} ${mark(f.shortcuts, req.shortcuts)} (needs ${req.shortcuts})${f.shortcutDetails.filter(c => c.verified).map(c => ` · ${c.path.join('→')} skips ${c.skipped}, needs ${c.needs.join('+')}`).join('')}`]);
    const em = encounterAudit?.metrics;
    if (em) rows.push(['Encounters', `${em.encounters} ${mark(em.encounters, req.encounters)} (needs ${req.encounters}) · ${em.enemies} enemies · combat bot: ${em.hits} hit${em.hits === 1 ? '' : 's'}, ${em.defeated} defeated`]);
  }
  if (level.meta?.theme) rows.push(['Theme', level.meta.theme]);
  if (generation) rows.push(['Generator tries', `${generation.attempts}${generation.rejections.length ? ` (rejected: ${generation.rejections.join(', ')})` : ''}`]);
  $('metrics').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  const issues = [
    ...audit.errors.map(e => ({ ...e, kind: 'error' })),
    ...audit.warnings.map(w => ({ ...w, kind: 'warning' })),
    ...sceneryAudit.errors.map(e => ({ ...e, kind: 'error' })),
    ...(funAudit?.issues || []).filter(i => i.code !== 'NOT_PLAYABLE').map(i => ({ ...i, kind: 'warning' })),
    ...(encounterAudit?.errors || []).map(e => ({ ...e, kind: 'error' })),
    ...sceneryAudit.warnings.map(w => ({ ...w, kind: 'warning' })),
  ];
  $('issues').innerHTML = issues.length
    ? issues.map(i => `<li class="${i.kind}"><code>${i.code}</code> ${i.message}</li>`).join('')
    : '<li>No issues: completable, forgiving, fun requirements met, scenery safe.</li>';
  $('segments').textContent = level.meta?.segments ? `Segments: ${level.meta.segments.join(' → ')}` : 'Hand-made level';
  $('route').innerHTML = (audit.route || []).map(e =>
    `<li>${e.from} → ${e.to} · ${e.kind === 'dash' ? 'air-dash jump' : e.kind}${e.kind !== 'walk' ? ` ${(e.difficulty * 100).toFixed(0)}% · ${e.dh >= 0 ? 'rise' : 'drop'} ${Math.abs(e.dh).toFixed(2)}` : ''}</li>`).join('');
}

// ---------------------------------------------------------------------------
// Bot trajectory & overview camera
// ---------------------------------------------------------------------------
function computeTrajectory() {
  const inputs = botInputs();
  if (!inputs) return [];
  const sim = createSession(level);
  const points = [];
  inputs.forEach((n, i) => {
    sim.step(decodeInput(n), DT);
    const p = sim.player;
    if (i % 5 === 0) points.push({ x: p.x, y: p.y + 0.1, z: p.z, air: !p.grounded });
  });
  return points;
}

function frameOverview() {
  const xs = level.platforms.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2]);
  const zs = level.platforms.flatMap(p => [p.z - p.depth / 2, p.z + p.depth / 2]);
  const ys = level.platforms.map(topOf);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  orbit.target = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  orbit.dist = Math.max(14, span * 1.05 + 4);
  orbit.yaw = Math.PI + 0.55;
  orbit.pitch = 0.8;
}

function currentCamera() {
  if (cameraMode === 'follow') return chaseCamera(player);
  const target = cameraMode === 'orbit' ? [player.x, player.y + 0.85, player.z] : orbit.target;
  const dist = cameraMode === 'orbit' ? 6 : orbit.dist;
  const c = Math.cos(orbit.pitch);
  return {
    eye: [target[0] + Math.sin(orbit.yaw) * c * dist, target[1] + Math.sin(orbit.pitch) * dist, target[2] + Math.cos(orbit.yaw) * c * dist],
    target,
  };
}

// ---------------------------------------------------------------------------
// Platform labels
// ---------------------------------------------------------------------------
let labelEls = [];
function buildLabels() {
  labels.innerHTML = '';
  const onRoute = new Set((audit.route || []).flatMap(e => [e.from, e.to]));
  const falsePath = new Set((funAudit?.metrics?.branches || []).filter(b => b.kind === 'false').flatMap(b => b.platforms));
  const shortcut = new Set((funAudit?.metrics?.shortcutDetails || []).filter(c => c.verified).flatMap(c => c.platforms));
  labelEls = level.platforms.map((p, i) => {
    const el = document.createElement('span');
    el.textContent = falsePath.has(i) ? `${i} ✕` : shortcut.has(i) ? `${i} ★` : i;
    const isGoal = Math.abs(topOf(p) - level.goal.y) < 1e-3 && Math.abs(level.goal.x - p.x) <= p.width / 2 && Math.abs(level.goal.z - p.z) <= p.depth / 2;
    el.className = isGoal ? 'goal' : onRoute.has(i) ? 'route' : falsePath.has(i) ? 'false-path' : shortcut.has(i) ? 'shortcut' : '';
    labels.append(el);
    return el;
  });
}

function updateLabels(render) {
  const show = $('opt-labels').checked;
  labels.hidden = !show;
  if (!show) return;
  level.platforms.forEach((p, i) => {
    const s = render.project([p.x, topOf(p) + 0.05, p.z]);
    const el = labelEls[i];
    if (!s || s.x < -50 || s.y < -50 || s.x > innerWidth + 50 || s.y > innerHeight + 50) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
  });
}

// ---------------------------------------------------------------------------
// Modes & input
// ---------------------------------------------------------------------------
function restart() {
  session = createSession(level);
  player = session.player;
  avatar.reset(player);
  particleSystem.clear();
  botTick = 0;
  botDoneTimer = 0;
  runTime = 0;
  finishedTime = null;
}

function segmented(container, onSelect) {
  const buttons = [...container.querySelectorAll('button')];
  const set = value => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.value === value));
    onSelect(value);
  };
  buttons.forEach(b => b.addEventListener('click', () => { set(b.dataset.value); b.blur(); }));
  return set;
}
const setMode = segmented($('mode'), value => { mode = value; restart(); });
const setCamera = segmented($('camera'), value => {
  cameraMode = value;
  if (value === 'overview') frameOverview();
  if (value === 'orbit') { orbit.yaw = Math.PI; orbit.pitch = 0.35; }
});
$('bot-speed').addEventListener('input', () => {
  botSpeed = Number($('bot-speed').value);
  $('bot-speed-label').textContent = `${botSpeed}×`;
});

const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyQ', 'KeyK'];
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement && event.target.type === 'number') return;
  if (GAME_KEYS.includes(event.code)) {
    event.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (mode !== 'play') setMode('play');
  }
  if (event.code === 'Space' && !keys.has(event.code)) jump = true;
  if (['ShiftLeft', 'ShiftRight', 'KeyJ'].includes(event.code) && !keys.has(event.code)) dash = true;
  if (['KeyQ', 'KeyK'].includes(event.code) && !keys.has(event.code)) pound = true;
  if (!event.repeat) {
    if (event.code === 'KeyR') restart();
    if (event.code === 'KeyB') setMode(mode === 'bot' ? 'play' : 'bot');
    if (event.code === 'KeyO') setCamera(cameraMode === 'overview' ? 'follow' : 'overview');
  }
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); jump = false; });

let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (cameraMode === 'follow') setCamera('orbit');
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.008;
  orbit.pitch = Math.max(-0.1, Math.min(1.45, orbit.pitch + (e.clientY - drag.y) * 0.006));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (cameraMode === 'overview') orbit.dist = Math.max(6, Math.min(80, orbit.dist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

function playerInput() {
  const has = c => keys.has(c);
  return {
    left: has('KeyA') || has('ArrowLeft'), right: has('KeyD') || has('ArrowRight'),
    forward: has('KeyW') || has('ArrowUp'), back: has('KeyS') || has('ArrowDown'),
  };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function tick() {
  if (finishedTime !== null && mode === 'play') {
    emitAvatarEffects(avatar.update(player, DT), particleSystem);
    particleSystem.update(DT);
    return;
  }
  let input;
  if (mode === 'bot') {
    const inputs = botInputs();
    if (!inputs) return;
    if (botTick >= inputs.length) {
      botDoneTimer += DT;
      if (botDoneTimer > 1.5) restart();
      input = {};
    } else {
      input = decodeInput(inputs[botTick++]);
    }
  } else {
    input = { ...playerInput(), jump, dash, pound };
    jump = dash = pound = false;
  }
  runTime += DT;
  const { result, events } = session.step(input, DT);
  emitGameplayEffects(events, particleSystem);
  if (events.some(e => e.type === 'hurt' || e.type === 'fell')) hud.flash();
  if (session.player !== player) { player = session.player; avatar.reset(player); }
  if (result === 'goal' && finishedTime === null) {
    finishedTime = runTime;
    particleSystem.emit(level.goal.x, level.goal.y + 1.4, level.goal.z, { count: 24, speed: 7, color: [1, 0.83, 0.15], lifetime: 1.4 });
  }
  emitAvatarEffects(avatar.update(player, DT), particleSystem);
  particleSystem.update(DT);
}

function statusText() {
  const par = audit.metrics ? ` · bot par ${audit.metrics.parTime.toFixed(1)} s` : '';
  if (!audit.ok) return `Audit FAILED: ${audit.errors[0].message}`;
  if (mode === 'bot') return `Watching the bot${finishedTime !== null ? ' — goal reached!' : '…'} (${(botTick * DT).toFixed(1)} s${par})`;
  if (finishedTime !== null) return `Goal! ${finishedTime.toFixed(1)} s${par}. Press R to retry.`;
  return `Playing — ${runTime.toFixed(1)} s${par}`;
}

let render;
let meter;
const quality = resolveQuality(params);
let lastTime;
let accumulator = 0;
function frame(time) {
  const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  accumulator += dt * (mode === 'bot' ? botSpeed : 1);
  while (accumulator >= DT) { tick(); accumulator -= DT; }

  const markers = $('opt-path').checked
    ? trajectory.map(p => ({ x: p.x, y: p.y, z: p.z, size: 0.12, color: p.air ? [1, 0.85, 0.2] : [1, 1, 1], alpha: 0.7 }))
    : [];
  const blink = session.invulnerable > 0 && Math.floor(session.time * 14) % 2 === 1;
  render(level, player, particleSystem.getActiveParticles(), {
    avatar: blink ? [] : avatar.getParts(player),
    boxes: session.enemyBoxes(enemyParts),
    shadow: computeShadow(level, player),
    camera: currentCamera(),
    markers,
    biome: environment.biome,
    scenery: sceneryForQuality(environment.scenery, render.quality),
    platformTint: environment.platformTint,
  });
  meter.frame(time);
  hud.update(session);
  updateLabels(render);
  status.textContent = statusText();
  requestAnimationFrame(frame);
}

try {
  render = createRenderer(canvas, quality);
  meter = createFpsMeter(quality, { canvas, renderer: render });
  if (params.has('seed')) {
    select.value = 'custom';
    $('seed').value = params.get('seed');
    $('difficulty').value = params.get('difficulty') ?? 0.5;
    $('difficulty-label').textContent = Number($('difficulty').value).toFixed(2);
  } else {
    select.value = String(Math.max(0, Math.min(levels.length - 1, Number(params.get('level') || 1) - 1)));
  }
  loadFromControls();
  if (params.get('mode') === 'bot') setMode('bot');
  if (params.get('camera')) setCamera(params.get('camera'));
  requestAnimationFrame(frame);
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
  console.error(error);
}

window.lab = {
  get level() { return level; }, get audit() { return audit; }, get player() { return player; },
  get finished() { return finishedTime !== null; }, get session() { return session; }, get encounters() { return encounterAudit; }, setMode, setCamera, tick,
};
