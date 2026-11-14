import { levels } from './levels.js';
import { createPlayer, stepPlayer, PLAYER } from './physics.js';
import { createRenderer } from './renderer.js';
import { inputManager } from './input.js';
import { gameState } from './state.js';
import { performanceMonitor } from './performance.js';
import { particleSystem } from './particles.js';
import { Config } from './config.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('#status');
const keys = new Set();

let levelIndex = 0;
let player = createPlayer(levels[levelIndex].spawn);
let finished = false;
let levelStartTime = performance.now();
let jump = false;

function updateStatus() {
  const level = levels[levelIndex];
  const bestTime = gameState.getStat('bestTimes')[level.name];
  const bestTimeStr = bestTime ? ` (Best: ${bestTime.toFixed(1)}s)` : '';

  status.textContent = finished
    ? `All ${levels.length} levels complete! Press R to play again.`
    : `Level ${levelIndex + 1}/${levels.length}: ${level.name} — reach the gold marker.${bestTimeStr}`;
}

function restart() {
  if (finished) levelIndex = 0;
  finished = false;
  player = createPlayer(levels[levelIndex].spawn);
  levelStartTime = performance.now();
  particleSystem.clear();
  updateStatus();
}

window.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === 'Space' && !keys.has(event.code)) {
    jump = true;
  }
  if (event.code === 'KeyR' && !event.repeat) {
    restart();
  }
  inputManager.onKeyDown(event.code);
  keys.add(event.code);
});

window.addEventListener('keyup', event => {
  inputManager.onKeyUp(event.code);
  keys.delete(event.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  inputManager.clearKeys();
  jump = false;
});

try {
  const render = createRenderer(canvas);
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
        const input = inputManager.getInput(gameState.getSetting('controlScheme'));

        const result = stepPlayer(player, levels[levelIndex], {
          left: input.left,
          right: input.right,
          forward: input.forward,
          back: input.back,
          jump
        }, step);

        jump = false;

        if (result === 'goal') {
          const levelTime = (performance.now() - levelStartTime) / 1000;
          gameState.updateLevelTime(levels[levelIndex].name, levelTime);
          gameState.markLevelComplete(levels[levelIndex].name);
          gameState.saveToLocalStorage();

          // Emit celebration particles
          particleSystem.emit(levels[levelIndex].goal.x, levels[levelIndex].goal.y, levels[levelIndex].goal.z, {
            count: 20,
            speed: 8,
            color: [1, 0.83, 0.15],
            lifetime: 1.5
          });

          if (levelIndex + 1 < levels.length) {
            levelIndex++;
            player = createPlayer(levels[levelIndex].spawn);
            levelStartTime = performance.now();
          } else {
            finished = true;
          }
          updateStatus();
        } else if (result === 'respawn') {
          gameState.recordDeath();
          gameState.saveToLocalStorage();

          // Emit respawn particles
          particleSystem.emit(player.x, player.y, player.z, {
            count: 10,
            speed: 5,
            color: [0.9, 0.3, 0.25],
            lifetime: 0.8
          });
        }
      }

      particleSystem.update(step);
      accumulator -= step;
    }

    performanceMonitor.endUpdate();
    performanceMonitor.beginRender();

    render(levels[levelIndex], player, particleSystem.getActiveParticles());

    performanceMonitor.endRender();
    performanceMonitor.endFrame();

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
