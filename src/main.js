import { levels } from './levels.js';
import { createPlayer, stepPlayer } from './physics.js';
import { createRenderer } from './renderer.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('#status');
const keys = new Set();
let jump = false;
let levelIndex = 0;
let player = createPlayer(levels[levelIndex].spawn);
let finished = false;

function updateStatus() {
  status.textContent = finished ? 'All levels complete! Press R to play again.' :
    `Level ${levelIndex + 1}/${levels.length}: ${levels[levelIndex].name} — reach the gold marker.`;
}

function restart() {
  if (finished) levelIndex = 0;
  finished = false;
  player = createPlayer(levels[levelIndex].spawn);
  updateStatus();
}

window.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && !keys.has(event.code)) jump = true;
  if (event.code === 'KeyR' && !event.repeat) restart();
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); jump = false; });

try {
  const render = createRenderer(canvas);
  updateStatus();
  let lastTime;
  let accumulator = 0;
  const step = 1 / 120;
  function frame(time) {
    if (lastTime !== undefined) accumulator += Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    while (accumulator >= step) {
      if (!finished) {
        const result = stepPlayer(player, levels[levelIndex], {
          left: keys.has('KeyA') || keys.has('ArrowLeft'),
          right: keys.has('KeyD') || keys.has('ArrowRight'),
          forward: keys.has('KeyW') || keys.has('ArrowUp'),
          back: keys.has('KeyS') || keys.has('ArrowDown'),
          jump
        }, step);
        jump = false;
        if (result === 'goal') {
          if (levelIndex + 1 < levels.length) {
            levelIndex++;
            player = createPlayer(levels[levelIndex].spawn);
          } else {
            finished = true;
          }
          updateStatus();
        }
      }
      accumulator -= step;
    }
    render(levels[levelIndex], player);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  status.textContent = `Unable to start: ${error.message}`;
}
