/**
 * Controls — keyboard + gamepad, with edge-triggered actions.
 *
 *   Move          WASD / arrow keys / left stick
 *   Jump          Space / gamepad A (✕)
 *   Air dash      Shift or J / gamepad X (□)      — in the air, once per jump
 *   Ground pound  Q or K / gamepad B (○)          — in the air
 *
 * read() returns { left, right, forward, back, jump, dash, pound }; jump/dash/pound
 * are true once per press (consumed on read), so a press is never lost or repeated
 * when a frame runs several physics steps.
 */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
  pound: ['KeyQ', 'KeyK'],
};
const GAMEPAD = { jump: 0, pound: 1, dash: 2 };
const ACTIONS = ['jump', 'dash', 'pound'];
export const GAME_KEYS = Object.values(BINDINGS).flat();

export function createControls(target = window) {
  const held = new Set();
  const pressed = new Set();
  const padWas = {};

  const onDown = event => {
    if (GAME_KEYS.includes(event.code)) event.preventDefault();
    if (!held.has(event.code)) {
      for (const action of ACTIONS) if (BINDINGS[action].includes(event.code)) pressed.add(action);
    }
    held.add(event.code);
  };
  const onUp = event => held.delete(event.code);
  const onBlur = () => { held.clear(); pressed.clear(); };
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  const any = codes => codes.some(c => held.has(c));

  return {
    held,
    /** Direction (screen-relative for the default camera) + one-shot actions. */
    read() {
      const out = {
        left: any(BINDINGS.left), right: any(BINDINGS.right),
        forward: any(BINDINGS.forward), back: any(BINDINGS.back),
        jump: pressed.has('jump'), dash: pressed.has('dash'), pound: pressed.has('pound'),
      };
      pressed.clear();
      const pad = navigator.getGamepads?.()?.[0];
      if (pad) {
        const dz = 0.3;
        out.left ||= pad.axes[0] < -dz;
        out.right ||= pad.axes[0] > dz;
        out.forward ||= pad.axes[1] < -dz;
        out.back ||= pad.axes[1] > dz;
        for (const action of ACTIONS) {
          const down = !!pad.buttons[GAMEPAD[action]]?.pressed;
          if (down && !padWas[action]) out[action] = true;
          padWas[action] = down;
        }
      }
      return out;
    },
    /** Queue an action (e.g. from a bench script or touch button). */
    press(action) { pressed.add(action); },
    clear() { held.clear(); pressed.clear(); },
    dispose() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
