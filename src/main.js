import { levels, tierForDifficulty, TIERS } from './levels.js';
import { BIOMES } from './biomes.js';
import { environmentFor } from './environment.js';
import { decodeInput } from './levelAudit.js';
import { resolveQuality, sceneryForQuality } from './quality.js';
import { createFpsMeter } from './fpsMeter.js';
import { generateLevel } from './levelGenerator.js';
import { createRenderer } from './renderer.js';
import { gameState } from './state.js';
import { performanceMonitor } from './performance.js';
import { particleSystem } from './particles.js';
import { Config } from './config.js';
import { createAvatar, computeShadow, emitAvatarEffects } from './avatar.js';
import { createSession } from './session.js';
import { enemyParts } from './enemies.js';
import { emitGameplayEffects } from './effects.js';
import { createHealthHud } from './hud.js';
import { createControls } from './controls.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('#status');

// URL options: ?level=N starts the campaign at level N; ?seed=S&difficulty=D plays one generated level;
// ?quality=test|normal picks the rendering preset (see quality.js); ?bench=S runs a benchmark.
const params = new URLSearchParams(location.search);
function standaloneLevel() {
  const difficulty = Math.max(0, Math.min(1, Number(params.get('difficulty') ?? 0.5)));
  const level = generateLevel({ seed: Number(params.get('seed')) || 1, difficulty }).level;
  level.tier = tierForDifficulty(difficulty).id;
  return level;
}
const campaign = params.has('seed') ? [standaloneLevel()] : levels;
const banner = document.querySelector('#tier-banner');
let shownTier = null;

/** Show a title card when entering a new difficulty tier. */
function announceTier() {
  const { tier } = environmentFor(campaign[levelIndex]);
  if (!banner || tier.id === shownTier) return;
  shownTier = tier.id;
  banner.querySelector('.tier-label').textContent = tier.label;
  banner.querySelector('.tier-name').textContent = tier.name;
  banner.classList.remove('show');
  void banner.offsetWidth; // restart the CSS animation
  banner.classList.add('show');
}

let levelIndex = Math.max(0, Math.min(campaign.length - 1, (Number(params.get('level')) || 1) - 1));
let session = createSession(campaign[levelIndex]);
let finished = false;
let levelStartTime = performance.now();
let message = null;          // temporary status message { text, until }
const benchSeconds = Number(params.get('bench')) || 0;
let benchTick = 0;
const avatar = createAvatar();
avatar.reset(session.player);
const controls = createControls();
const hud = createHealthHud(session.maxHealth);

function updateStatus() {
  const level = campaign[levelIndex];
  const bestTime = gameState.getStat('bestTimes')[level.name];
  const bestTimeStr = bestTime ? ` (Best: ${bestTime.toFixed(1)}s)` : '';

  const { tier } = environmentFor(level);
  status.textContent = finished
    ? `All ${campaign.length} levels complete! Press R to play again.`
    : `${tier.label} · ${tier.name} — Level ${levelIndex + 1}/${campaign.length}: ${level.name}${bestTimeStr}`;
  if (!finished) announceTier();
}

function say(text, seconds = 2.5) {
  message = { text, until: performance.now() + seconds * 1000 };
  status.textContent = text;
}

function loadLevel(index) {
  levelIndex = index;
  session = createSession(campaign[levelIndex]);
  avatar.reset(session.player);
  particleSystem.clear();
  levelStartTime = performance.now();
  benchTick = 0;
  updateStatus();
}

function restart() {
  if (finished) { finished = false; loadLevel(0); return; }
  loadLevel(levelIndex);
}

window.addEventListener('keydown', event => {
  if (event.code === 'KeyR' && !event.repeat) restart();
});

function onEvents(events) {
  emitGameplayEffects(events, particleSystem);
  for (const e of events) {
    if (e.type === 'hurt' || e.type === 'fell') {
      hud.flash();
      if (e.type === 'fell' && e.health > 0) say(`Fell! ${e.health} heart${e.health === 1 ? '' : 's'} left.`);
    }
    if (e.type === 'death') {
      gameState.recordDeath();
      gameState.saveToLocalStorage();
      say('Out of hearts — restarting the level.');
    }
  }
}

try {
  const quality = resolveQuality(params);
  const render = createRenderer(canvas, quality);
  const meter = createFpsMeter(quality, { canvas, renderer: render });
  if (benchSeconds) meter.startBench(benchSeconds).then(r => { status.textContent = `Bench: ${r.fps.toFixed(1)} fps avg · ${r.lowFps.toFixed(1)} low`; });
  // paint every tier's textures up front so entering a new tier never hitches
  render.warmUp(TIERS.flatMap(t => [BIOMES[t.biome].material, BIOMES[t.biome].ground?.material].filter(Boolean)));
  updateStatus();

  let lastTime;
  let accumulator = 0;
  const step = 1 / 120;

  function frame(time) {
    performanceMonitor.beginFrame();
    performanceMonitor.beginUpdate();

    if (lastTime !== undefined) {
      accumulator += Math.min((time - lastTime) / 1000, Config.MAX_DELTA_TIME);
    }
    lastTime = time;

    while (accumulator >= step) {
      if (!finished) {
        let input = controls.read();
        if (benchSeconds) {
          // Bench: replay the audit bot's verified solution (restart when it ends)
          const inputs = environmentFor(campaign[levelIndex]).audit.solution.inputs;
          if (benchTick >= inputs.length) { session.reset(); benchTick = 0; }
          input = decodeInput(inputs[benchTick++]);
        }

        const before = session.player;
        const { result, events } = session.step(input, step);
        onEvents(events);
        if (session.player !== before) avatar.reset(session.player);

        if (result === 'goal' && benchSeconds) {
          session.reset();
          benchTick = 0;
        } else if (result === 'goal') {
          const level = campaign[levelIndex];
          const levelTime = (performance.now() - levelStartTime) / 1000;
          gameState.updateLevelTime(level.name, levelTime);
          gameState.markLevelComplete(level.name);
          gameState.saveToLocalStorage();
          particleSystem.emit(level.goal.x, level.goal.y, level.goal.z, { count: 20, speed: 8, color: [1, 0.83, 0.15], lifetime: 1.5 });

          if (levelIndex + 1 < campaign.length) {
            loadLevel(levelIndex + 1);
          } else {
            finished = true;
            updateStatus();
          }
        }
      }

      emitAvatarEffects(avatar.update(session.player, step), particleSystem);
      particleSystem.update(step);
      accumulator -= step;
    }
    if (message && performance.now() > message.until) { message = null; updateStatus(); }

    performanceMonitor.endUpdate();
    performanceMonitor.beginRender();

    const level = campaign[levelIndex];
    const environment = environmentFor(level);
    const blink = session.invulnerable > 0 && Math.floor(session.time * 14) % 2 === 1;
    render(level, session.player, particleSystem.getActiveParticles(), {
      avatar: blink ? [] : avatar.getParts(session.player),
      shadow: computeShadow(level, session.player),
      boxes: session.enemyBoxes(enemyParts),
      biome: environment.biome,
      scenery: sceneryForQuality(environment.scenery, render.quality),
      platformTint: environment.platformTint,
    });
    hud.update(session);

    performanceMonitor.endRender();
    performanceMonitor.endFrame();
    meter.frame(time);

    if (Config.SHOW_PERFORMANCE_STATS) {
      console.log(performanceMonitor.toString());
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
  console.error(error);
}

// For debugging from the console
window.game = { get session() { return session; }, get level() { return campaign[levelIndex]; }, loadLevel, controls };
