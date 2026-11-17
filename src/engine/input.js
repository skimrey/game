/**
 * Gamepad/Input Manager
 * Handles keyboard and gamepad input with support for multiple control schemes
 */

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.gamepadIndex = null;
    this.deadzone = 0.15;
  }

  isKeyPressed(key) {
    return this.keys.has(key);
  }

  onKeyDown(key) {
    this.keys.add(key);
  }

  onKeyUp(key) {
    this.keys.delete(key);
  }

  clearKeys() {
    this.keys.clear();
  }

  getGamepadInput() {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads || !gamepads[0]) return null;

    const gp = gamepads[0];
    return {
      left: gp.axes[0] < -this.deadzone,
      right: gp.axes[0] > this.deadzone,
      forward: gp.axes[1] < -this.deadzone,
      back: gp.axes[1] > this.deadzone,
      jump: gp.buttons[0]?.pressed || false,
      rawStick: {
        x: gp.axes[0],
        y: gp.axes[1],
      },
    };
  }

  getInput(controlScheme = 'wasd') {
    if (controlScheme === 'gamepad') {
      return this.getGamepadInput() || this.getKeyboardInput();
    }
    return this.getKeyboardInput(controlScheme);
  }

  getKeyboardInput(scheme = 'wasd') {
    let leftKey, rightKey, forwardKey, backKey;

    if (scheme === 'wasd') {
      leftKey = 'KeyA';
      rightKey = 'KeyD';
      forwardKey = 'KeyW';
      backKey = 'KeyS';
    } else if (scheme === 'arrows') {
      leftKey = 'ArrowLeft';
      rightKey = 'ArrowRight';
      forwardKey = 'ArrowUp';
      backKey = 'ArrowDown';
    }

    return {
      left: this.keys.has(leftKey),
      right: this.keys.has(rightKey),
      forward: this.keys.has(forwardKey),
      back: this.keys.has(backKey),
      jump: this.keys.has('Space'),
      restart: this.keys.has('KeyR'),
      pause: this.keys.has('KeyP'),
    };
  }
}

export const inputManager = new InputManager();
