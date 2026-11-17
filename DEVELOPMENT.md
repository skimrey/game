# Development Guide

## Architecture Overview

This game uses a modular, component-based architecture designed for extensibility without external dependencies.

### Module Dependencies

The code is grouped by layer — `app/` (the running game) on top of `engine/`, `world/`, `levels/`,
`characters/`, `games/`, `progression/`, `town/`, `cards/`, `ui/`, `audio/`. The full map and the
"how to add…" recipes are in [STRUCTURE.md](STRUCTURE.md). (The examples below are from the
original template and still show the general pattern: a module with a small API, wired in `app/`.)

**Key Principle**: Modules are loosely coupled. Each module can be understood independently.

## Adding a New Game System

### Example: Adding a Power-up System

1. **Create `src/powerups.js`:**

```javascript
export class PowerupSystem {
  constructor() {
    this.active = [];
  }

  create(x, y, z, type, duration = 5) {
    this.active.push({ x, y, z, type, duration, age: 0 });
  }

  update(dt) {
    this.active = this.active.filter(p => {
      p.age += dt;
      return p.age < p.duration;
    });
  }

  checkCollision(player) {
    for (const powerup of this.active) {
      const dist = Math.hypot(
        player.x - powerup.x,
        player.y - powerup.y,
        player.z - powerup.z
      );
      if (dist < 1) return powerup.type;
    }
    return null;
  }
}

export const powerupSystem = new PowerupSystem();
```

2. **Import in `src/app/boot.js`:**

```javascript
import { powerupSystem } from './powerups.js';

// In game loop:
const powerup = powerupSystem.checkCollision(player);
if (powerup === 'speed-boost') {
  // Apply effect
}
powerupSystem.update(step);
```

3. **Render in `src/engine/renderer.js`:**

```javascript
return (level, player, particles = [], powerups = []) => {
  // ... existing rendering
  for (const p of powerups) {
    box([p.x, p.y, p.z], [0.5, 0.5, 0.5], [0, 1, 1]); // Cyan
  }
};
```

## Extending the Physics System

### Custom Player Movement

Modify `src/world/physics.js`:

```javascript
export function applyMovementModifier(player, modifier) {
  if (modifier === 'slow') {
    // Reduce speed
  }
}
```

## Creating New Level Types

Use helpers in `src/levels/builder.js`:

```javascript
// Add to LevelBuilder class:
addBridgeSequence(x, y, z, length = 10, width = 2) {
  for (let i = 0; i < length; i++) {
    this.addPlatform(x + i * 1.5, y, z, width, 1, 1);
  }
  return this;
}
```

## Performance Optimization Tips

1. **Reduce Particle Count**: In `src/app/boot.js`:
   ```javascript
   particleSystem.emit(x, y, z, { count: 5 }); // Instead of 20
   ```

2. **Optimize Collision Checks**: Pre-filter platforms by distance

3. **Use Simpler Geometry**: The box renderer is already optimal

4. **Profile with Chrome DevTools**:
   - F12 → Performance tab
   - Record a frame and analyze

## Debugging

### Enable Debug Mode

In `src/engine/config.js`:
```javascript
DEBUG_MODE: true,
SHOW_COLLISION_BOXES: true,
SHOW_PERFORMANCE_STATS: true,
```

### Log Game State

```javascript
import { gameState } from './engine/state.js';
console.log(gameState.stats);
```

### Test Physics Directly

```javascript
import { createPlayer, stepPlayer } from './world/physics.js';
import { levels } from './levels/index.js';

const player = createPlayer(levels[0].spawn);
const result = stepPlayer(player, levels[0], { left: false, right: true, forward: false, back: false, jump: false }, 1/120);
console.log(result, player);
```

## Testing Guidelines

Place tests in `test/` directory. Use Node.js built-in test runner:

```javascript
// test/myfeature.test.js
import test from 'node:test';
import assert from 'node:assert';
import { myFunction } from '../src/myfeature.js';

test('myFunction works', () => {
  assert.equal(myFunction(2, 3), 5);
});
```

Run with:
```sh
npm test
```

## Browser Compatibility

### Supported:
- Chrome 9+
- Firefox 4+
- Safari 5.1+
- Edge (all versions)

### Features Used:
- WebGL
- ES6 Modules
- localStorage (optional)
- requestAnimationFrame
- Gamepad API (optional fallback)

## Common Tasks

### Add a new level
```javascript
// In src/levels/index.js
createLevel('Challenge').setSpawn(...).addPlatform(...).build()
```

### Change player speed
```javascript
// In src/world/physics.js or src/engine/config.js
PLAYER_SPEED: 7
```

### Adjust difficulty
```javascript
// In src/world/physics.js
GRAVITY: 25 // Increase for more challenge
PLAYER_JUMP_SPEED: 10 // Increase for more control
```

### Add sound to a level
```javascript
// In src/app/boot.js
sound.level(zone);   // each zone has its own generated tune (src/audio/compose.js)
```

## File Size Reference

Keep the project lean:
- Main bundle: ~50KB unminified
- Each module: 1-3KB
- Total with all systems: ~80KB

This allows fast loading even on slow connections.

## Maintenance Checklist

- [ ] Keep physics.test.js updated when changing physics
- [ ] Update config.js comments when adding new features
- [ ] Document new modules in this guide
- [ ] Test in multiple browsers before release
- [ ] Check console for warnings/errors
- [ ] Verify all levels are winnable
- [ ] Test gamepad support on actual hardware
