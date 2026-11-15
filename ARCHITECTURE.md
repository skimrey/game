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
- Techniques (allowed per level by `level.abilities`, set per region from `TIER_ABILITIES` in
  `levels.js`): air dash (`input.dash`), glide (`input.glide` = jump held while falling: the fall is
  capped at `ABILITIES.glideFall`), double jump (jump again in the air, once per air time,
  `doubleSpeed`); bounce pads are terrain (`platform.spring`, no ability needed): landing launches
  the player at `springSpeed` and refreshes the dash and double jump. `player.sprung` /
  `player.doubled` / `player.gliding` report them for effects
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

**Responsibility**: All visual output using WebGL, at a cost the quality preset allows (`src/quality.js`)

**Geometry**: every box is 36 vertices in one interleaved format, so whole groups draw in one call
(draw calls are expensive on software WebGL): platforms per material, scenery, one dynamic batch
for the avatar / enemies / goal and one for transparent things (shadows, particles). Faces that
can never be seen are never built (sides between touching tiles, bottoms of props resting on a
surface, tops of rock slabs under a platform); scenery is baked into spatial chunks culled against
the view frustum, and tiny surface details are skipped once they'd be under ~1.5 px.

**Two shading paths**:
- `pixel` (normal): lighting, fog, height haze, edge highlights, ambient occlusion and wavy
  grass/sand lips per pixel; procedural sky per pixel (`full` / `lite` / `flat`).
- `vertex` (test preset, software rendering): lighting, AO and fog per vertex, the fragment shader
  is one texture fetch and a multiply-add; tops and sides draw as separate ranges (one texture
  each), lips are thin strips of geometry, the distant ground is a tessellated grid. The `baked`
  sky renders the full sky once per biome into a panorama texture that a coarse screen grid samples.

**Frame**: adaptive quality check → resize (pixelated: whole device pixels per canvas pixel) →
opaque platforms, batch, scenery, ground (nearest first, for early depth rejection) → sky at the far
plane (only uncovered pixels) → transparent batch.

**Camera System** (`src/camera.js`):
- Follows player at offset: (x*0.5, y+7, z-12), looking at (x*0.5, y+1, z+5)
- Menus and tools pass their own camera (orbit, overview, the character showroom)

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

### 8. Characters (`src/character.js`, `src/avatar.js`, `src/characterScreen.js`, `src/portrait.js`)

- `character.js` — design data (build, head, hair, hat, eyes, mouth, top, bottoms, shoes, back gear,
  eight colours), the three default heroes, validation and saved designs (localStorage, with a
  draft for unsaved work). DOM-free.
- `avatar.js` — turns a design into posed, procedurally animated boxes (capes and ponytails trail,
  jet flames burn in the air, wings flap), uniformly scaled to fit the physics hitbox.
- `characterScreen.js` — the character select / editor overlay; the 3D preview is the game canvas
  behind it (main.js's showroom). `portrait.js` paints 2D roster thumbnails from the same boxes.

### 9. Level quality (`src/levelAudit.js`, `src/funAudit.js`, `src/encounterAudit.js`, `src/campaignAudit.js`)

- Level audit: completability proven by a bot in the real physics (planning special moves where
  plain jumps can't make it — the gentlest one the level allows: dash, then glide, then double jump,
  plus bounce pads — and measuring their timing windows), fairness and quality rules.
  `moveReach(kind, dh)` / `movePeak(kind)` give each move's envelope.
- Fun audit: directions, travel, turns, false paths, proven shortcuts, required dashes and drops.
- Encounter audit: enemy placement and a combat bot that must win losing at most one heart.
- Campaign audit: distinct levels, a steady difficulty ramp, every move taught then used — including
  one new technique per region (`TECHNIQUES`; a region's first level must teach its technique).
  See `LEVEL_DESIGN.md`.

### 9b. Runs, gems, retro boss battles and unlockables

- **Runs** — `runLevels.js` plans a run's levels from the hand-written campaign: hand-made levels are
  remixed (mirror, nudges, resizes, re-timed enemies), generated ones re-generated from their spec with
  a run seed (then remixed if no fresh layout fits). `checkCandidate` accepts a level only if it passes
  the level / fun / encounter audits, keeps every move of its base level, sits between its neighbours
  on the challenge ramp (whether they end up remixed or not), keeps its par time and stays distinct from
  every other level — so any mix of run and hand-written levels passes the campaign audit.
  `runWorker.js` runs the planner off the main thread, one level ahead of the player; main.js swaps a
  planned level in only before the player reaches it. `campaignSignatures.js` caches the campaign's
  own signatures (regenerate with `npm run levels:signatures`; a test checks it).
- **Goal gem** — `gem.js` builds the floating gem (colour cycles cyan → violet → magenta → gold, never
  the green of the platforms) that the renderer draws at each level's goal.
- **Bosses** — `bosses.js` makes each boss from the run seed and the level's place in the campaign: a
  name and title in the region's flavour, a monster seed, colours, the mini-game (runner, or the
  region's capstone on its last level: `battle/index.js CAPSTONES`) and its numbers (`bossStats`,
  jittered per run). `checkBoss` plays it with the mode's bot: a perfect player must win within 65 %
  of the clock losing at most one heart, and an idle one must lose — otherwise the numbers are re-rolled.
- **Monsters** — `monsters.js` builds symmetric pixel-art creatures from parts (body superellipse,
  eyes, brows, mouth, horns/antennae/ears/crest, legs/arms/tentacles/wings, pattern), shades and
  outlines them; `checkMonster` rejects sprites in pieces, too sparse, too small, clipped or eyeless.
- **Mini-games** — `battle/*.js` are pure and seeded (no DOM): `press(code)`, `release(code)` / `held`
  (keys down, for steering), `step(dt)`, `drain()` events, `result`; some take `click(x, y)` /
  `aimAt(x, y)`. Each exports a `bot({ lead })` used by the tests, the boss checks and the balance
  report. 22 games with roles (`rolesOf`): boss games, checkpoint games (`checkpoint: true`, the "boss
  health" is the goal still to reach), games that can be either (`roles: ['checkpoint', 'boss']` —
  whack, fishing, maze; `bossStats(mode, d, …, kind)` gives each role its own numbers) and travel games
  (`travel: true`; the health is the distance left). `TRAVEL_ROUTES` lists the vehicles that fit each
  crossing between regions.
- **Encounters** — `encounters.js` plans a run's 21 encounters (12 bosses, 6 checkpoints, 3 journeys)
  from the 22 games with no repeats: capstones first, then a backtracking search (fewest candidates
  first, single-role games before dual ones, never the same game twice in a row) under the terrain
  rules (sled → alpine, lander → starlit, a route's vehicles, the plane at most once). Each
  encounter's `difficulty` comes from its place in the whole sequence (0.08 → 0.95, capstones +0.06),
  so a game met late is hard from the start. `encounterList` flattens a plan in play order;
  `rating.js` turns the run's results into ★–★★★★★.
- **Balance** — `battle/humanize.js` wraps a bot in a human-like player (`SKILLS` expert / average /
  novice: reaction delay ± jitter, in-order delivery, press-rate limit, slips, aim error); bots take
  `lead` (= the reaction delay) to anticipate and remember what they've pressed. `BALANCE_RULES` +
  `playHuman` are checked in `test/balance.test.js`; `scripts/balance-report.mjs` prints the table.
- **Travel** — `main.js` runs a region's journey after its last level (`runTravel`, once per
  crossing); results of every encounter go to `runResults`, and `finishRun` shows the star panel.
- **Arcade checkpoints** — `arcade.js` places a (non-solid) cabinet on the middle-most roomy route
  platform (from the level audit's verified route); `main.js` starts the checkpoint game when the hero
  walks into it and, on a win, `session.save(spot)` sets the restart point and refills the hearts.
- **Test menu** — `testMenu.js` (test preset or `?dev=1`): any level, any mini-game × role × easy /
  medium / hard (`TEST_DIFFICULTY`), skip to the gem / the arcade, new run.
- **Retro rendering** — `pixel.js` draws palette indices into a 320×180 byte buffer (shapes, sprites
  with flips / rotation / scaling, a 3×5 font) and converts it to RGBA once per frame; the canvas is
  scaled up with crisp pixels. `palette.js` lays out 256 colours in ramps (UI, stage, hero, boss,
  minions, effects); `buildScheme({ step })` moves stage, hero and boss to a new hue on every good
  move (`checkScheme` keeps it readable). `heroSprite.js` paints the character design (every editor
  option) as 28×36 sprites in side / front / back views and poses; `battle/art.js` paints parallax
  landscapes once per battle and scrolls them by copying rows; `battle/draw.js` draws each mini-game.
  `bossBattle.js` runs the loop (rules at 120 Hz, drawing at ≤ 60 fps), input, palette swaps and the
  HTML rules cards; the 3D canvas is hidden meanwhile. Cost: the whole browser uses about a quarter of
  the CPU it needs for a 3D level (see below).
- **Unlocks** — a win unlocks an item from `UNLOCKABLES` in `character.js` (saved in localStorage),
  rolled by rarity from `DROP_TABLE` for the boss's region (capstones one row better;
  `store.rollReward`). After-trails (`trails.js`) are particles emitted behind the 3D hero (capped at
  100), pixel sparkles in the battles, and a swoosh of glowing cubes as wardrobe art. `rewardScreen.js` shows it in 2D (the item is cut out of the hero sprite by painting
  the hero with and without it), with `unlockPanel.js` buttons; the wardrobe (character screen in
  wardrobe mode) can be opened before the next level.
  Flow: `play → (arcade) → gem → battle → stage → (journey, at a region's end) → next level … → stars`. `?battles=0` skips battles, `?boss=<mode>` forces one.

### 10. Supporting Modules

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
2. **Rendering**: batched meshes, hidden-face removal, chunk culling, and the `test` preset's vertex
   shading / baked sky / crisp half resolution for software WebGL — see `perf/README.md`
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
