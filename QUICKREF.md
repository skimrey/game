# Quick Reference Guide

## Running the Game

```bash
# Start a local server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

## Controls

| Action | Key |
|--------|-----|
| Move Forward | W or ↑ |
| Move Backward | S or ↓ |
| Move Left | A or ← |
| Move Right | D or → |
| Jump | Space |
| Restart Level | R |

**Gamepad**: Left stick to move, A/Cross to jump

## Project Structure

```
game/
├── index.html              # Game window
├── style.css               # UI styles
├── package.json            # Project metadata
│
├── src/                    # Game source code
│   ├── main.js             # Game loop and coordinator
│   ├── physics.js          # Player movement and collisions
│   ├── renderer.js         # WebGL rendering
│   ├── levels.js           # Level definitions
│   ├── config.js           # Configuration constants
│   ├── input.js            # Keyboard and gamepad input
│   ├── audio.js            # Sound effects framework
│   ├── particles.js        # Visual effects system
│   ├── state.js            # Game state and persistence
│   ├── levelBuilder.js     # Level creation helpers
│   ├── math.js             # Math utilities
│   └── performance.js      # Performance monitoring
│
├── test/                   # Test suite
│   └── physics.test.js     # Physics validation
│
├── assets/                 # Game assets
│   ├── audio/              # Sound files (add yours here)
│   │   ├── music/
│   │   └── sfx/
│   ├── textures/           # Texture files
│   ├── models/             # 3D models
│   └── shaders/            # GLSL shaders
│
├── README.md               # User guide
├── ARCHITECTURE.md         # System design
├── DEVELOPMENT.md          # Developer guide
├── IMPROVEMENTS.md         # What's new
└── .gitignore              # Git ignore rules
```

## Common Tasks

### Add a Sound Effect

```javascript
// In src/main.js, near top:
audioManager.loadSound('jump', './assets/audio/sfx/jump.mp3');

// When you want to play it:
audioManager.play('jump');
```

### Create a New Level

```javascript
// In src/levels.js, add to levels array:
createLevel('My Challenge')
  .setSpawn(0, 1, 0)
  .addPlatform(0, 0, 0, 6, 1, 6)      // x, y, z, width, height, depth
  .addPlatform(3, 0.5, 6, 4, 1, 3)
  .setGoal(3, 1, 14)
  .build(),
```

### Change Difficulty

```javascript
// In src/config.js:
GRAVITY: 25,              // Increase for harder
PLAYER_JUMP_SPEED: 10,    // Increase for more control
PLAYER_SPEED: 6           // Increase for faster movement
```

### Add Particles to an Event

```javascript
// In src/main.js, in the result === 'goal' block:
particleSystem.emit(goalX, goalY, goalZ, {
  count: 30,
  speed: 10,
  color: [1, 0.83, 0.15],  // Gold
  lifetime: 2
});
```

### Show Performance Stats

```javascript
// In src/config.js:
SHOW_PERFORMANCE_STATS: true
```

Then check browser console for FPS counter.

### Debug a Level

```javascript
// In src/config.js:
DEBUG_MODE: true,
SHOW_COLLISION_BOXES: true,
```

## Configuration Quick Reference

### Physics (src/config.js)
```javascript
GRAVITY: 20                 // Downward acceleration (m/s²)
PLAYER_SPEED: 5            // Horizontal move speed
PLAYER_JUMP_SPEED: 8       // Upward jump velocity
PLAYER_WIDTH: 0.4          // Player width (x-axis)
PLAYER_HEIGHT: 1.5         // Player height (y-axis)
```

### Camera (src/config.js)
```javascript
CAMERA_FOV: Math.PI / 3    // Field of view angle
CAMERA_HEIGHT_OFFSET: 7    // Height above player
CAMERA_DISTANCE_OFFSET: -12 // Distance behind player
CAMERA_FORWARD_OFFSET: 5   // Forward look offset
```

### Colors (src/config.js)
```javascript
COLORS: {
  PLATFORM: [0.35, 0.65, 0.35],  // Green
  GOAL: [1, 0.83, 0.15],          // Gold
  PLAYER: [0.9, 0.3, 0.25],       // Red-brown
}
```

## Testing

```bash
# Run all tests
npm test

# What's tested:
# - Physics gravity and jumping
# - Movement normalization
# - Collision detection
# - Goal and respawn triggers
# - Level design validity
```

## Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 9+ | ✅ Full |
| Firefox | 4+ | ✅ Full |
| Safari | 5.1+ | ✅ Full |
| Edge | All | ✅ Full |
| Mobile | Modern | ✅ Full |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| R | Restart current level |
| P | Pause (framework ready) |

## Troubleshooting

### Game won't start
- Check browser console for errors (F12)
- Ensure WebGL is supported
- Try a different browser

### Input not working
- Check if keyboard/gamepad is connected
- Try different control scheme in config.js
- Test with both WASD and Arrow keys

### Performance issues
- Reduce particle count in config.js
- Close other browser tabs
- Clear browser cache
- Check CPU usage

### Audio not playing
- Check browser autoplay policy settings
- Verify audio files exist
- Check console for loading errors
- Unmute browser

## Development Workflow

1. Make changes to src files
2. Refresh browser (no build needed)
3. Test in game
4. Run `npm test` to validate
5. Check console for errors (F12)

## Module Dependencies

```
main.js imports:
├── levels.js
├── physics.js
├── renderer.js
├── input.js
├── audio.js
├── particles.js
├── state.js
├── config.js
├── performance.js
└── math.js
```

## Important Constants

| Constant | Value | Unit |
|----------|-------|------|
| Frame Rate | 120 | FPS |
| Gravity | 20 | m/s² |
| Player Height | 1.5 | units |
| Player Width | 0.4 | units |
| Fall Threshold | -12 | units |
| Goal Radius | 1 | units |

## Resources

- **README.md** - User guide and features
- **ARCHITECTURE.md** - System design details
- **DEVELOPMENT.md** - Contributor guide
- **IMPROVEMENTS.md** - What's new summary

## API Examples

### Loading Audio
```javascript
audioManager.loadSound('name', 'path/to/file.mp3');
```

### Creating Particles
```javascript
particleSystem.emit(x, y, z, {count, speed, color, lifetime});
```

### Saving Game State
```javascript
gameState.updateLevelTime('Level Name', seconds);
gameState.saveToLocalStorage();
```

### Building a Level
```javascript
createLevel('Name')
  .addPlatform(x, y, z, w, h, d)
  .addStaircase(x, y, z, steps)
  .setGoal(x, y, z)
  .build()
```

## Performance Tips

1. Keep particle count under 100 active
2. Limit platforms to under 100 per level
3. Use simpler geometry when possible
4. Profile with Chrome DevTools
5. Monitor FPS counter

## Common Errors & Solutions

**"WebGL is not available"**
- Browser doesn't support WebGL
- Try a different browser

**Physics test fails**
- Level design issue
- Ensure spawn is on a platform
- Ensure goal is reachable

**Input not detected**
- Check InputManager in src/input.js
- Verify control scheme in config.js

**Audio doesn't play**
- Check file path
- Browser autoplay policy
- Audio format compatibility

## Next Steps

1. Add audio files to assets/audio/
2. Create new levels with LevelBuilder
3. Add visual effects with ParticleSystem
4. Extend physics with new mechanics
5. Build a menu system

Happy developing! 🎮
