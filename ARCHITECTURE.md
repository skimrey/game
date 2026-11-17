# Architecture Documentation

## System Overview

This game is built from small, dependency-free ES modules grouped by layer. The file-by-file map,
and recipes for adding a game / level / card / zone, are in [STRUCTURE.md](STRUCTURE.md).

```
                ┌───────────────────────────── src/app/ ─────────────────────────────┐
 src/main.js ─▶ │ boot.js  shared state G + the page's singletons, listeners           │
                │ loop.js  the frame loop (phases: play · hub · home · battle · cards…)│
                │ run.js · level.js · travel.js · quests.js · town.js · townCards.js   │
                └──────┬──────────────┬──────────────┬──────────────┬───────────────┘
                       │              │              │              │
   engine/ (WebGL renderer, camera,   world/ (physics, session,  levels/ (builder, generator,
   pixel renderer, palettes, quality)  enemies, zones, biomes)    audits, campaign/, run levels)
                       │              │              │              │
   games/ (28 mini-games: rules ·     characters/ (avatar, hero  progression/ (spells, story,
   draw · 3D scenes; kit/, screen.js)  sprite, NPCs, pets)        profile, encounters, bosses)
                       │              │              │              │
   cards/ (Riftcards: catalog, match,  town/ (hub, home, decor,   ui/ (HUD, panels, options,
   ai, decks, screen, panels)          embark, arcade cabinet)     test menu, touch)   audio/
```

Everything below `app/` is pure or nearly so (rules, generators, audits run in Node tests); the DOM
and WebGL live in `engine/renderer.js`, the screens (`games/screen.js`, `cards/cardScreen.js`,
`town/home.js`, panels in `ui/`) and `app/`.

## Core Systems

### 1. Physics System (`src/world/physics.js`)

**Responsibility**: All gameplay logic and collision detection

**Key Components**:
- `PLAYER` constant: Player dimensions and speed
- `createPlayer()`: Initialize player state
- `stepPlayer()`: Update player position and handle collisions

**Physics Behavior**:
- Gravity: 20 m/s² downward
- Jump: Instantaneous velocity boost to 8 m/s upward
- Techniques (allowed per level by `level.abilities`, set per region from `TIER_ABILITIES` in
  `levels/index.js`): air dash (`input.dash`), glide (`input.glide` = jump held while falling: the fall is
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

### 2. Renderer (`src/engine/renderer.js`)

**Responsibility**: All visual output using WebGL, at a cost the quality preset allows (`src/engine/quality.js`)

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

**Camera System** (`src/engine/camera.js`):
- Follows player at offset: (x*0.5, y+7, z-12), looking at (x*0.5, y+1, z+5)
- Menus and tools pass their own camera (orbit, overview, the character showroom)

### 3. Input System (`src/engine/input.js`)

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

### 4. Game State (`src/engine/state.js`)

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

### 5. Particle System (`src/engine/particles.js`)

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

### 6. Sound (`src/audio/`)

**Responsibility**: chiptune music and sound effects, made on the spot (no audio files).

- `compose.js` (pure): a song per style + seed (zones, places, games), jingles, NPC voices
- `synth.js`: the chip — pulse / triangle / noise voices, envelopes, echo, a look-ahead player
- `sfx.js`: every effect as a tiny recipe (`SFX_NAMES`; `test/audio.test.js` checks every name the
  game asks for exists)
- `music.js`: the page's `sound` — `sound.fx('jump')`, `sound.place('town', seed)`,
  `sound.level(zone)`, `sound.battle(mode)`, `sound.jingle('victory')`, `sound.talk(npc, n)`

### 7. Level Builder (`src/levels/builder.js`)

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

### 8. Characters (`src/characters/character.js`, `src/characters/avatar.js`, `src/characters/characterScreen.js`, `src/characters/portrait.js`)

- `characters/character.js` — design data (build, head, hair, hat, eyes, mouth, top, bottoms, shoes, back gear,
  eight colours), the three default heroes, validation and saved designs (localStorage, with a
  draft for unsaved work). DOM-free.
- `characters/avatar.js` — turns a design into posed, procedurally animated boxes (capes and ponytails trail,
  jet flames burn in the air, wings flap), uniformly scaled to fit the physics hitbox.
- `characters/characterScreen.js` — the character select / editor overlay; the 3D preview is the game canvas
  behind it (`app/hero.js`'s showroom). `characters/portrait.js` paints 2D roster thumbnails from the same boxes.

### 9. Level quality (`src/levels/audit.js`, `src/levels/funAudit.js`, `src/levels/encounterAudit.js`, `src/levels/campaignAudit.js`)

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

- **Runs** — `levels/runLevels.js` plans a run's levels from the hand-written campaign: hand-made levels are
  remixed (mirror, nudges, resizes, re-timed enemies), generated ones re-generated from their spec with
  a run seed (then remixed if no fresh layout fits). `checkCandidate` accepts a level only if it passes
  the level / fun / encounter audits, keeps every move of its base level, sits between its neighbours
  on the challenge ramp (whether they end up remixed or not), keeps its par time and stays distinct from
  every other level — so any mix of run and hand-written levels passes the campaign audit.
  `levels/runWorker.js` runs the planner off the main thread, one level ahead of the player; `app/run.js` swaps a
  planned level in only before the player reaches it. `levels/campaignSignatures.js` caches the campaign's
  own signatures (regenerate with `npm run levels:signatures`; a test checks it).
- **Goal gem** — `world/gem.js` builds the floating gem (colour cycles cyan → violet → magenta → gold, never
  the green of the platforms) that the renderer draws at each level's goal.
- **Bosses** — `progression/bosses.js` makes each boss from the run seed and the level's place in the campaign: a
  name and title in the region's flavour, a monster seed, colours, the mini-game (runner, or the
  region's capstone on its last level: `battle/index.js CAPSTONES`) and its numbers (`bossStats`,
  jittered per run). `checkBoss` plays it with the mode's bot: a perfect player must win within 65 %
  of the clock losing at most one heart, and an idle one must lose — otherwise the numbers are re-rolled.
- **Monsters** — `characters/monsters.js` builds symmetric pixel-art creatures from parts (body superellipse,
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
- **Encounters** — `progression/encounters.js` plans a run's 21 encounters (12 bosses, 6 checkpoints, 3 journeys)
  from the 22 games with no repeats: capstones first, then a backtracking search (fewest candidates
  first, single-role games before dual ones, never the same game twice in a row) under the terrain
  rules (sled → alpine, lander → starlit, a route's vehicles, the plane at most once). Each
  encounter's `difficulty` comes from its place in the whole sequence (0.08 → 0.95, capstones +0.06),
  so a game met late is hard from the start. `encounterList` flattens a plan in play order;
  `progression/rating.js` turns the run's results into ★–★★★★★.
- **Balance** — `games/kit/humanize.js` wraps a bot in a human-like player (`SKILLS` expert / average /
  novice: reaction delay ± jitter, in-order delivery, press-rate limit, slips, aim error); bots take
  `lead` (= the reaction delay) to anticipate and remember what they've pressed. `BALANCE_RULES` +
  `playHuman` are checked in `test/balance.test.js`; `scripts/balance-report.mjs` prints the table.
- **Travel** — `app/travel.js` runs a region's journey after its last level (`runTravel`, once per
  crossing); results of every encounter go to `runResults`, and `finishRun` shows the star panel.
- **Arcade checkpoints** — `world/arcade.js` places a (non-solid) cabinet on the middle-most roomy route
  platform (from the level audit's verified route); `app/level.js` starts the checkpoint game when the hero
  walks into it and, on a win, `session.save(spot)` sets the restart point and refills the hearts.
- **Test menu** — `ui/testMenu.js` (test preset or `?dev=1`): any level, any mini-game × role × easy /
  medium / hard (`TEST_DIFFICULTY`), skip to the gem / the arcade, new run.
- **Retro rendering** — `engine/pixel.js` draws palette indices into a 320×180 byte buffer (shapes, sprites
  with flips / rotation / scaling, a 3×5 font) and converts it to RGBA once per frame; the canvas is
  scaled up with crisp pixels. `engine/palette.js` lays out 256 colours in ramps (UI, stage, hero, boss,
  minions, effects); `buildScheme({ step })` moves stage, hero and boss to a new hue on every good
  move (`checkScheme` keeps it readable). `characters/heroSprite.js` paints the character design (every editor
  option) as 28×36 sprites in side / front / back views and poses; `games/kit/art.js` paints parallax
  landscapes once per battle and scrolls them by copying rows; `games/kit/view.js` draws each mini-game.
  `games/screen.js` runs the loop (rules at 120 Hz, drawing at ≤ 60 fps), input, palette swaps and the
  HTML rules cards; the 3D canvas is hidden meanwhile. Cost: the whole browser uses about a quarter of
  the CPU it needs for a 3D level (see below). The pixel canvases are shown at a **whole-number
  scale** (`engine/pixelFit.js`: 320×180 × 4 = 1280×720 in a 1400×850 window, letterboxed) — nearest-neighbour
  at a fractional scale cost Chrome's compositor ~10 ms a frame on the GPU-less VM; whole numbers
  halve it (DrawAndSwap ~9.8 → 5.5 ms, no dropped frames). `battle.perf` reports `{ fps, drawMs }`,
  `window.__autoplay = true` lets the current game's bot play (perf runs), and
  `window.game.testGame(mode, 0|1|2, role)` starts any game.
- **Journeys in 3D** (`games/kit/travel3d.js`): `createTravelScene({ render, design, pet, biome, zone })` →
  `{ supports(mode), attach(game), draw(game, dt, time), effect(event, game) }`. `bossBattle.start`
  takes `scene3d` / `use3d` / `onViewChange`; in 3D the battle screen goes transparent, the pixel
  canvas is hidden and `drawBattleHud` draws just the HUD into a see-through overlay canvas; the
  game object, its rules and its bot are unchanged (`app/travel.js` `travelView()` builds the scene; the
  choice lives in `profile.travelView`).
- **Unlocks** — a win unlocks an item from `UNLOCKABLES` in `characters/character.js` (saved in localStorage),
  rolled by rarity from `DROP_TABLE` for the boss's region (capstones one row better;
  `store.rollReward`). After-trails (`characters/trails.js`) are particles emitted behind the 3D hero (capped at
  100), pixel sparkles in the battles, and a swoosh of glowing cubes as wardrobe art. `ui/rewardScreen.js` shows it in 2D (the item is cut out of the hero sprite by painting
  the hero with and without it), with `ui/unlockPanel.js` buttons; the wardrobe (character screen in
  wardrobe mode) can be opened before the next level.
  Flow: `town → portal (class) → play → (arcade) → (NPC: talk → rift level / duel / delve → spell) → gem → battle → stage → (journey, at a stage's end) → next level … → stars → town (decoration, maybe a stray pet)`. `?battles=0` skips battles, `?boss=<mode>` forces one, `?hub=0` skips the town.

### 10b. Zones, NPCs, spells, the town, home and pets

The layer around the runs — see [WORLD_DESIGN.md](WORLD_DESIGN.md) for the design and the
reasoning. Module by module:

- **Zones** (`world/zones.js`): a run's four stages (`TIERS`) each take place in one of eight zones;
  `planZones(runSeed)` draws the journey (allowed stages per zone, no repeats, a vehicle for every
  crossing). `level.zone` carries it; `world/environment.js` resolves zone → biome (audits cached per
  layout, so a run's copies of a level don't re-audit); `progression/encounters.js` takes each slot's zone
  (capstones, terrain, travel vehicles); `progression/bosses.js` names bosses and picks the 2D stage art by zone.
- **Spells** (`progression/spells.js`): `createSpellRuntime(known)` sits in `games/screen.js`'s loop — `begin`
  (passives), `cast` (keys 1–5 / the spell bar), `afterStep` after every game step (guards restore a
  lost heart, Thorns, Predator, Last Stand, volleys — read from the step's new events),
  `timeScale` (slow motion: fewer fixed steps per frame). Only shared game state is touched, so it
  works in every mini-game — except two hooks a game may offer: `spellHit(n)` (the delve: a
  spell's hit lands on the nearest foe instead of the boss bar) and `MODES[mode].spellRecharge`
  (spent spells come back; the runtime's `version` tells the spell bar to redraw). `games/kit/overlay.js` `drawSpellOverlay` draws the shield and the slow-motion border.
- **NPCs** (`characters/npcs.js` data, `characters/npcFace.js` faces, `characters/npcWorld.js` 3D actor + placement, `characters/npcDialog.js`
  UI): `app/run.js` plans one per stage, `app/quests.js` places it on load (`setUpNpc`), talks on E
  (`talkTo`, with a talk camera), runs quests (`startRift` — a level generated by the run worker,
  played in place of the level until won / lost — `startDuel` — a `parry` boss with
  `boss.npc`, drawn through the NPC palette ramp 80–95 — and `startDelve` — a `delve` game
  (role `quest`, `boss.cls` = the run's class picks the kit), then `rewardSpell`; trades via
  `characters.relinquish` / `unlock`.
- **Town and home** (`town/hub.js` — a level like any other, `town/home.js` — a 2D screen with its own canvas
  and palette): `app/town.js` phases `hub` (walk the square; the portal and the door are walk-in),
  `portal` (`town/embark.js`), `home`; `finishRun` rewards a decoration (`town/decor.js`) and maybe a stray
  pet, then `enterTown`.
- **Pets** (`characters/pets.js`): the follower walks your grounded footsteps; parts are added to the avatar
  list in levels, rifts, town and the showroom; battles and the reward stage draw `paintPet` with
  the pet palette ramp (96–103); home uses extra ramps for several pets.
- **Profile** (`progression/profile.js`): class, runs, stars, pets, decorations — what lasts between runs; also
  Riftcards (collection, a deck per faction, your faction, tier and who you've beaten), the arcade's records and met games, story beats, settings and
  the run in progress.

### 10c. Sound, Riftcards, story, saving

- **Audio** (`audio/`): `compose.js` is pure (tested in Node): `composeSong(style, seed)` → notes on a
  16-step grid. `synth.js` plays them with Web Audio (one oscillator + gain per note, noise buffers
  for drums; a look-ahead scheduler on the audio clock, 40 ms ticks, 180 ms ahead) and renders offline
  for checks. `music.js` exports the page's `sound`: `level()`, `battle()`, `place()`, `fx()`,
  `jingle()`, `talk()` — songs cached by style + seed; the context unlocks on the first key / click and
  suspends while the tab is hidden. Hooks: `app/` (levels, town, home, rifts, the 3D events and the
  avatar's jumps and landings), `games/screen.js` (each game's events, countdown, result jingles; the
  previous tune is restored on close), `characters/npcDialog.js` (babble), `cardScreen.js`.
- **Riftcards** (`cards/`, a Gwent-like battle of strength over three rows, best of three rounds):
  `catalog.js` — rows, weather, abilities, the eight factions (one per zone) and their perks, 74
  cards; `match.js` — the pure rules (`createMatch`, `playCard`, `pass`, `strengthOf`, `legalMoves`,
  `cloneMatch`; events for the screen; the round-end event carries the table as it stood);
  `ai.js` — `heuristicMove` (habits: get ahead cheaply, pass, let a round go) and `searchMove`
  (Champions and the King: determinized roll-outs); `decks.js` — deck rules, starters, `autoDeck`,
  packs by tier, the ladder (`LADDER`, `KING`), `opponentDeck`; `drawCards.js` — cards, units,
  icons, generated critters per card; `cardScreen.js` — the 400×225 table: the rules change the state
  at once, the screen turns events into motion (fly-ins from hand / portrait / deck / discard,
  landing hops, ±N pops, burns, weather particles, round banners, gem cracks); `deckPanel.js` —
  HTML: faction choice, a deck per faction, packs, picks. `app/townCards.js`: `pitchCards` /
  `startCardMatch` (battlers from every zone play their zone's faction at the tier you were when they
  arrived; beat three at your tier to rise), `editDecks`, `startKingMatch`, `testCardMatch`.
- **The Ring** (`ring/`): `monsters.js` (types, moves, `monsterFromBoss`, stats, experience — pure),
  `battle.js` (the rules of a 3-on-3 round: commands resolved in priority / speed order, damage =
  power × atk/(atk+def) × level × type × luck, statuses, cooldowns; events for the screen), `ai.js`
  (scores every move and target), `tamers.js` (tiers, squads, experience, gold), `art.js` (each
  monster drawn from its boss's generated sprite, remapped into its own 16-colour ramp), `screen.js`
  (400×225: command menus, then the round's events played out one by one — lunges, shots in the
  attacker's type colour, hit flashes, tweened HP bars, pops), `panels.js` (HTML). App side:
  `app/inn.js` (`noteBossBeaten` in `runBattle`, `befriendAtStageEnd` in `nextLevel` at a stage's
  capstone, tamers and fights, the board, the ranch).
- **2D places** (`town/place2d.js`): the walk-around engine of the inn (`town/inn.js`) and the ranch
  (`town/ranch.js`); phases `inn` / `ranch` are 2D screens for `app/loop.js`. The inn draws its
  regulars and tamers from their character designs (hero sprites remapped into per-NPC ramps).
  The ranch gives palette ramps only to the monsters on screen (six at a time), so the herd can grow
  without running out of colours.
- **Tailoring** (`characters/tailoring.js`): patterns are 8×8 pens keyed by item in
  `profile.tailoring`; `dress(design, tailoring)` adds `patterns` / `trailColors` to the player's
  design (app `dressed()` wherever `G.currentDesign` is set); `heroSprite.js` paints them over the
  torso's cloth and whatever the back item painted, `avatar.js` adds thin plates on the torso and
  capes (fancy wings take the pattern's main colour), `trails.js` takes the colours.
- **Story** (`progression/story.js`, pure): `unlocks(profile)`, `questKinds`, `nextBeat`, `chapter`; `app/town.js`
  `tellStory()` shows a beat in town when nothing else is open; `setOff(null)` starts the gentle run.
- **Save / resume**: `saveRun()` (at `loadLevel`, `recordResult`, `closeTalk`) writes a snapshot to
  the profile; `resumeRun(saved)` → `startRun(seed, { zones, gentle })`, restores spells, results,
  trips and quest states, waits (phase `resuming`) for the run worker to remake the level, then
  `loadLevel`. The worker swaps in a level it has finished for the current index while resuming.
- **Home arcade** (`town/arcadeCabinet.js` + `town/home.js` game room): `playArcade(mode, level, role)` runs
  `battle.start` with no spells and records wins / best time (`battle` resolves `{ won, stats, time }`).
- **Options** (`ui/options.js`): settings in the profile; `createBossBattle({ settings })` reads assist
  (an extra heart, 30 % more time) and reduced motion (no shake / flash).

### 10. Supporting Modules

#### Config (`src/engine/config.js`)
Centralized configuration constants:
- Physics parameters (gravity, speeds)
- Camera settings
- Rendering parameters
- Color definitions
- Debug flags

#### Math Utilities (`src/engine/math.js`)
Common math functions:
- Vector3 operations (add, dot, length, normalize)
- Geometric checks (distance, AABB overlap)
- Interpolation functions (lerp, easing)
- Utility functions (clamp, random ranges)

#### Performance Monitor (`src/engine/performance.js`)
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

See [STRUCTURE.md](STRUCTURE.md) — *How to add…*: a mini-game (a folder under `games/` with
`rules.js`, `draw.js`, `index.js`), a level (a file in `levels/campaign/` or a generator recipe), a
zone, a Riftcard or a faction, a spell, a decoration, a sound.

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
