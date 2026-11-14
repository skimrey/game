# Architecture Documentation

## System Overview

This game is built using a modular, system-based architecture. Each system is self-contained, testable, and can be extended independently.

```
┌─────────────────────────────────────────────────────────┐
│                   Game Loop (main.js)                   │
│  - Input handling                                       │
│  - Frame timing (120 FPS, fixed timestep)              │
│  - State coordination                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
   ┌────────┐ ┌─────────┐ ┌──────────┐
   │Physics │ │Renderer │ │Input     │
   │System  │ │System   │ │Manager   │
   └────────┘ └─────────┘ └──────────┘
        │          │          │
        └──────────┼──────────┘
                   │
        ┌──────────┴──────────┬────────────┬─────────────┐
        │                     │            │             │
        ▼                     ▼            ▼             ▼
   ┌─────────┐          ┌──────────┐ ┌────────┐   ┌──────────┐
   │Game     │          │Particle  │ │Audio   │   │Level     │
   │State    │          │System    │ │Manager │   │Builder   │
   └─────────┘          └──────────┘ └────────┘   └──────────┘
        │
        │ localStorage
        ▼
    Player Stats & Settings
```

## Core Systems

### 1. Physics System (`src/physics.js`)

**Responsibility**: All gameplay logic and collision detection

**Key Components**:
- `PLAYER` constant: Player dimensions and speed
- `createPlayer()`: Initialize player state
- `stepPlayer()`: Update player position and handle collisions

**Physics Behavior**:
- Gravity: 20 m/s² downward
- Jump: Instantaneous velocity boost to 8 m/s upward
- Movement: Normalized stick input applied to 5 m/s speed
- Collision: AABB (axis-aligned bounding box) with platforms
- Grounding: Detected when player is on top of platform and vy ≤ 0

**Collision Resolution**:
- Horizontal: Clamp player position to platform extent
- Vertical: Snap to platform top, set vy to 0

**Return Values**:
- `'playing'`: Normal game state
- `'goal'`: Player reached goal area
- `'respawn'`: Player fell off world

### 2. Renderer (`src/renderer.js`)

**Responsibility**: All visual output using WebGL

**Key Components**:
- WebGL context setup and shader compilation
- Vertex and fragment shaders (inline in source)
- Camera system with `lookAt()` and `perspective()` matrices
- Box geometry rendering

**Rendering Pipeline**:
1. Clear depth and color buffers
2. Compute view-projection matrix from camera position
3. Draw each platform with green color
4. Draw goal marker with gold color
5. Draw player with red-brown color
6. Draw particles with fading alpha

**Camera System**:
- Follows player at offset: (x*0.5, y+7, z-12)
- Looks at point: (x*0.5, y+1, z+5)
- Provides smooth third-person view

**Optimization**:
- Single buffer object for all box geometry
- Unified shader for all objects (color passed as uniform)
- DPI scaling respects device pixel ratio

### 3. Input System (`src/input.js`)

**Responsibility**: Translate player input to game actions

**Input Sources**:
1. Keyboard: WASD and Arrow keys for movement, Space for jump
2. Gamepad: Left stick for movement, Button 0 (A/Cross) for jump

**Input Manager Features**:
- Configurable control schemes
- Gamepad deadzone support (default 0.15)
- Simultaneous key tracking
- Support for pause and restart

**Input Object Structure**:
```javascript
{
  left: boolean,
  right: boolean,
  forward: boolean,
  back: boolean,
  jump: boolean,
  restart?: boolean,
  pause?: boolean
}
```

### 4. Game State (`src/state.js`)

**Responsibility**: Persistent player data and game settings

**Tracked Stats**:
- `totalTime`: Cumulative play time
- `levelTimes`: Time spent on each level
- `deathCount`: Number of times respawned
- `bestTimes`: Best completion time per level
- `completedLevels`: Set of finished level names

**Settings**:
- `difficulty`: Gameplay difficulty (not yet used)
- `graphicsQuality`: Rendering quality (not yet used)
- `audioEnabled`: Sound on/off
- `controlScheme`: 'wasd', 'arrows', or 'gamepad'

**Persistence**:
- Saves to browser `localStorage` under key `'gameState'`
- Automatic saves after level completion, deaths
- Loads on game initialization

### 5. Particle System (`src/particles.js`)

**Responsibility**: Visual effects and temporary graphics

**Particle Lifecycle**:
1. Created at position with velocity
2. Updated each frame: position += velocity, velocity += gravity
3. Fade out based on lifetime
4. Removed when age > lifetime

**Particle Properties**:
- Position (x, y, z)
- Velocity (vx, vy, vz)
- Color (R, G, B)
- Lifetime and age
- Alpha (computed from age/lifetime)

**Emission Options**:
```javascript
{
  count: number,           // Number of particles
  speed: number,           // Initial velocity magnitude
  color: [r, g, b],       // RGB color
  lifetime: number         // Duration in seconds
}
```

### 6. Audio Manager (`src/audio.js`)

**Responsibility**: Sound playback and volume control

**Features**:
- Load audio from URLs
- Play sounds with volume control
- Separate SFX and music volume levels
- Global enable/disable

**Usage Pattern**:
```javascript
audioManager.loadSound('jump', './assets/audio/sfx/jump.mp3');
audioManager.play('jump', { volume: 0.7 });
```

**Limitations**:
- No music looping (can be added)
- Clones audio element for simultaneous playback
- Browser autoplay policies may block audio

### 7. Level Builder (`src/levelBuilder.js`)

**Responsibility**: Level creation and validation

**Level Structure**:
```javascript
{
  name: string,                    // Display name
  spawn: { x, y, z },             // Player start position
  platforms: [{x, y, z, width, height, depth}, ...],
  goal: { x, y, z, radius }       // Goal area
}
```

**Builder Methods** (fluent API):
- `setSpawn(x, y, z)`: Set player start
- `addPlatform(x, y, z, w, h, d)`: Add single platform
- `setGoal(x, y, z, radius)`: Set goal
- `addStaircase(...)`: Helper for stairs
- `addPlatformRow(...)`: Helper for row patterns
- `build()`: Return level object

**Validation**:
- Checks spawn is above a platform
- Verifies goal is supported
- Returns errors array

### 8. Supporting Modules

#### Config (`src/config.js`)
Centralized configuration constants:
- Physics parameters (gravity, speeds)
- Camera settings
- Rendering parameters
- Color definitions
- Debug flags

#### Math Utilities (`src/math.js`)
Common math functions:
- Vector3 operations (add, dot, length, normalize)
- Geometric checks (distance, AABB overlap)
- Interpolation functions (lerp, easing)
- Utility functions (clamp, random ranges)

#### Performance Monitor (`src/performance.js`)
Frame timing and statistics:
- FPS calculation
- Frame time tracking
- Per-system timing (update, render)

## Data Flow

### Level Progression

```
Game Start
    ↓
Load Level[0]
    ↓
Create Player at spawn
    ↓
Game Loop:
  ├─ Input → InputManager
  ├─ Input + Player → Physics → Player
  ├─ Player + Level → Renderer
  └─ Check Goal:
      ├─ Goal Reached → Next Level
      ├─ Fell Off → Respawn
      └─ Playing → Continue
```

### Game Loop Sequence (120 FPS, ~8.3ms per frame)

1. **Input Phase**
   - Collect keyboard/gamepad input
   - Track jump signal (one-frame pulse)

2. **Fixed Timestep Updates** (1/120 second each)
   - Physics: Player movement, collision, gravity
   - Particles: Update positions, ages
   - Check: Goal or respawn conditions

3. **Rendering Phase**
   - Clear buffers
   - Update camera from player position
   - Render platforms, goal, player, particles

4. **State Persistence** (on events)
   - Level complete: Save stats, times
   - Death: Increment counter
   - Settings change: Save to localStorage

## Extension Points

### Adding a New Game Mechanic

1. **Create a new system module** (`src/mechanic.js`):
   - Export a class or singleton
   - Provide `update(dt)` method
   - Return any state changes

2. **Integrate in main loop** (`src/main.js`):
   - Import the system
   - Call `update()` in game loop
   - Handle events/results

3. **Render if visual** (`src/renderer.js`):
   - Pass data to renderer
   - Add drawing calls

### Adding a New Level

1. Use LevelBuilder in `src/levels.js`:
   ```javascript
   createLevel('Level Name')
     .setSpawn(0, 1, 0)
     .addPlatform(0, 0, 0, 6, 1, 6)
     .setGoal(0, 2, 20)
     .build()
   ```

2. Validate spawn and goal are supported
3. Test in game

### Adding Audio

1. Place audio files in `assets/audio/`
2. Load in `main.js`:
   ```javascript
   audioManager.loadSound('name', './assets/audio/file.mp3');
   ```
3. Play on events:
   ```javascript
   audioManager.play('name');
   ```

## Performance Considerations

### Optimization Strategies

1. **Physics**: Early exit on platform checks, use spatial partitioning for many platforms
2. **Rendering**: Single draw call per object type, minimal shader switching
3. **Particles**: Limit particle count, recycle when possible
4. **Memory**: Reuse objects, avoid allocations in hot paths

### Profiling

Use Chrome DevTools:
1. F12 → Performance tab
2. Record frame
3. Analyze:
   - `stepPlayer` duration (physics)
   - `particleSystem.update` duration (effects)
   - WebGL draw calls (render)

## Testing Strategy

### Unit Tests (`test/physics.test.js`)

Tests validate:
- Gravity and falling behavior
- Movement normalization
- Collision detection
- Goal/respawn triggers
- Level design validity

### Manual Testing

1. Play each level to completion
2. Test edge cases:
   - Jump at platform edge
   - Move between very close platforms
   - Quick restart
3. Verify gamepad support
4. Check mobile responsiveness

## Browser APIs Used

- **WebGL**: 3D rendering
- **requestAnimationFrame**: Smooth animation
- **localStorage**: Persistent save data
- **Gamepad API**: Controller input
- **ES6 Modules**: Code organization

## Future Enhancement Opportunities

1. **Graphics**:
   - Replace boxes with 3D models (GLTF)
   - Add textures and normal maps
   - Implement lighting system

2. **Physics**:
   - Add slopes and ramps
   - Wall jumping mechanics
   - Dynamic platform moving

3. **Audio**:
   - Background music with looping
   - Sound effects for jump, land, goal
   - Audio visualization

4. **Gameplay**:
   - Power-ups (speed boost, double jump)
   - Enemies or hazards
   - Time limits per level
   - Multiplayer (local co-op)

5. **Interface**:
   - Level select menu
   - Pause screen
   - Settings interface
   - High score leaderboard

6. **Content**:
   - More levels
   - Level editor UI
   - Difficulty progression
   - Secret levels
