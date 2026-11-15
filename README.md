# 3D Platformer

A robust, dependency-free browser-based 3D platformer with WebGL rendering, multiple levels, physics-based gameplay, and extensible architecture for adding features like audio, particles, and advanced input handling.

## Features

- **WebGL Rendering**: Smooth 3D graphics with a following camera system
- **Physics Engine**: Gravity, jumping, collision detection, and fall detection
- **Character creator**: pick one of three heroes or build your own (build, head, hair, hat, eyes, mouth, top, bottoms, shoes, back gear and 8 colours); designs are saved in the browser
- **Roguelite runs**: every run has new level layouts (the hand-written campaign remixed and re-generated, every level re-checked by the audits) and new, generated bosses
- **22 retro mini-games**: each level ends in a floating gem; grabbing it starts a pixel-art boss battle against a generated monster (13 boss games). Six levels have an arcade cabinet halfway with a checkpoint mini-game (7 games — win it to save your progress there), and between regions you **travel** by raft, mine cart, snowmobile or biplane (4 vehicle levels). **No game repeats within a run** (21 encounters from 22 games, a different selection and order every run), and the later in the run a game turns up, the harder its settings. Every correct move recolours the whole scene. Bosses drop clothing by rarity (29 items: common → legendary wings, halos and glittery after-trails)
- **A star rating** at the end of a run: ★ to ★★★★★ for how many of the run's games you beat
- **A new movement technique in every region**: bounce pads (meadow), the air dash (canyon), gliding (alpine), the double jump (starlit) — each needed to get through, and mixed together later on
- **Balanced for people**: every mini-game is played by human-like bots (late reactions, uneven timing, slips, shaky aim) at three skill levels; the tests hold each game to win rates that suit real players
- **Test menu** (testing mode): jump to any level, or play any mini-game in any of its roles at easy, medium or hard
- **Multiple Levels**: 12 levels (6 hand-made + 6 generated from themes), all proven completable by the level audit — and, as a campaign, checked for visibly distinct layouts, a steady difficulty ramp and use of every move (see [LEVEL_DESIGN.md](LEVEL_DESIGN.md))
- **Input Management**: Support for WASD/Arrow keys and gamepad input
- **Particle System**: Visual effects for game events
- **Audio Manager**: Framework for sound effects and music (no dependencies)
- **Game State**: Persistent player statistics and settings via localStorage
- **Performance Monitoring**: Built-in FPS and timing metrics
- **Level Builder**: Fluent API for creating new levels
- **Debug Tools**: Optional performance stats and collision visualization

## Quick Start

### Run the Game (recommended: live reload)

```sh
npm run dev                                   # play: normal resolution/quality, opens the game
npm run dev:test                              # testing mode (no GPU): crisp half resolution, 60 fps, opens the playground
node scripts/dev-server.mjs --open index.html --quality test   # any page, any preset
```

Rendering presets (URL `?quality=…`, see `src/quality.js` and `perf/README.md`):

| Preset | For | Settings |
|---|---|---|
| `normal` (default) | playing on a machine with a GPU | full resolution (up to 2× HiDPI), MSAA, full sky, all scenery, trilinear + anisotropic textures |
| `test` | testing on machines without a GPU (e.g. the VM) | **vertex shading** (lighting & fog per vertex), **baked sky** (the full sky, rendered once per biome into a texture), crisp **½ resolution** (whole 2×2 pixels — cheap to composite), nearest-texel textures one mipmap softer (calmer busy textures like alpine snow), untextured distant ground, near scenery without optional detail (every other side island, thin drips), no MSAA, FPS badge; **adaptive quality** holds 60 fps (sheds scenery, then drops to ⅓ resolution if needed, and restores them) |

Single settings can be overridden in the URL, e.g. `?quality=test&resolution=0.7&pixelated=0&sky=full`,
`?shading=vertex`, `?sky=baked`, `?filtering=nearest`, `?texturedetail=soft`, `?ground=flat`, `?target=45` (adaptive frame-rate
target), `?adaptive=0`.
On machines without a GPU the dev server launches Chrome with `--disable-gpu-compositing`
(force with `--software` / `--gpu`) — this alone more than halves Chrome's per-frame cost.
On the GPU-less test VM the new `test` preset halves the CPU cost of a frame compared with the
previous one (playground ~50 → ~26 ms, a campaign level ~36 → ~19 ms at equal settings) and holds
60 fps where the old preset settled around 30 — see `perf/README.md` for the measurements and what
each technique buys.
`npm run bench` re-measures everything in a visible Chrome window and rewrites `perf/README.md`;
`python3 scripts/bench_quality.py --launch --stage compare --compare-base http://localhost:8001`
compares against another checkout served on port 8001 (interleaved rounds, steal-filtered).

The dev server reloads open pages on every file edit and reopens Chrome on the next edit if the
window was closed. Chrome is found via `CHROME_PATH`, standard install locations or Playwright's
Chromium (no dependencies).

Or start a plain static server:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser.

### Controls

- **Move**: WASD or Arrow Keys
- **Jump**: Space
- **Glide** (from the Alpine region): hold Space while falling — you sink slowly, for long drops and wide gaps
- **Double jump** (from the Starlit region): press Space again in mid-air, once per jump
- **Bounce pads** (from the first region): land on one to be launched high (refreshes the dash and the double jump)
- **Air dash** (from the Canyon region): Shift or J (in the air, once per jump — refreshed by landing or stomping)
- **Ground pound**: Q or K (in the air — slam down; the landing shockwave defeats nearby enemies)
- **Restart Level**: R
- **Change hero**: C or Esc (pauses the game and opens the character screen; Esc / Resume goes back)
- **Test menu** (testing mode): ` (backquote)

### Runs

Every time you start the game you play a new **run** (the seed is shown in the status line):

- **New layouts.** The hand-made levels are remixed — mirrored left↔right half the time, every
  platform nudged and resized a little, enemies re-timed — and the generated levels are
  re-generated from their theme and difficulty with a seed from the run. Every candidate must pass
  the same checks as the hand-written campaign (completable by the bot, fair jumps, the fun and
  encounter audits), keep every move its level teaches (air dash, long drops, stomps, spikers,
  shortcuts, false paths), stay between the levels before and after it on the difficulty ramp, keep
  its length, and look distinct from every other level; otherwise the hand-written level is used.
  A worker plans one level ahead, so this never blocks the game (see `src/runLevels.js`).
- **A technique per region.** Each region adds one movement technique and keeps the earlier ones
  (`TIER_ABILITIES` in `src/levels.js`; the HUD shows the ones you have as pips): **bounce pads** in
  the Green Meadows (a first one as an optional hop-skip, then one you need to reach the goal), the
  **air dash** in the Sunbaked Canyon, **gliding** in the Alpine Dusk and the **double jump** in the
  Starlit Ruins. The first level of a region says what's new; the levels need the technique (the
  audit proves the route uses it) and later levels mix all of them — a high wall, then a long glide
  down, then a dash across.
- **New bosses.** Each boss is generated from the run seed: a pixel-art monster, a name and title in
  the flavour of its region, and numbers that ramp along the campaign (jittered per run and checked
  by bots — see below).
- Finishing the last level and pressing **R** starts a new run. `?run=1234` replays a run;
  `?run=0` plays the hand-written campaign exactly as written.

### Gems, boss battles, arcade checkpoints and the wardrobe

Every level ends in a **floating gem**. Grabbing it summons the level's **boss** for a retro 2D
battle (pixel art at 320×180, no 3D — it runs at full speed without a GPU). Six levels also have an
**arcade cabinet** halfway along the route: walk into it for a **checkpoint mini-game** — win it and
the cabinet becomes your checkpoint (hearts refilled; running out of hearts restarts you there
instead of at the start), lose or skip it and you just carry on. Between regions you **travel**: a
vehicle level takes you from one region to the next (skip it and you "walk the long way", without the
star). **Every correct move recolours the whole scene** — stage, hero and boss shift to a new palette
together. Hearts (3), a clock and the boss's health (or the goal / the trip) are shown; Esc pauses;
you can retry, or skip.

| Mini-game | Role | How to play |
|---|---|---|
| **Key Jump** | boss | the boss hurls spikes; **press the key shown above your hero to jump** (a new letter each time). The one typing game |
| **Copycat** | meadow capstone | the boss dances a sequence; **repeat it with the arrows / WASD**, one move longer each round. A **timing check**: press Space as the marker crosses the green — miss it and the boss dances a *new order* |
| **Quick Draw** | canyon capstone | a duck hunt: **aim with the mouse** (or arrows / WASD) and **click / Space** to shoot the critters the boss sends across the sky; escapees steal hearts |
| **Avalanche Run** | alpine capstone | a top-down sled chase: **steer ← →** around trees, rocks and the boss's snowballs (watch their shadows); **ride over a ramp** to launch a trick and a snowball into the boss |
| **Star Invaders** | starlit capstone | **move ← → and cast stars with Space**: the boss hides behind marching rows of minions that drop bombs |
| **Tennis Match** | boss | **move ← →**; the ball comes back off your racket (where it hits sets the angle); **Space** just before contact smashes |
| **Spellslinger** | boss | a kid-friendly run-and-gun: **move ← →, jump ↑, cast fireballs with X**; the boss is shielded except right after it attacks |
| **Star Beat** | boss | rhythm: **press D F J K (or ← ↓ ↑ →) as stars cross the line**; 10 in a row win a heart back |
| **Brick Breaker** | boss | **launch with Space**, keep the ball up with the paddle (**← → or the mouse**; where it hits sets the angle), break through the wall and hit the boss. Later bosses patch their wall and spit goo that makes the paddle sticky |
| **Cannon Duel** | boss | artillery: **↑ ↓ aim, hold Space to charge, let go to fire** (mind the wind flag); **step aside ← →** from the boss's shells |
| **Whack-a-Critter** | checkpoint or boss | critters pop out of nine holes: **click them or press the key in the same spot (Q W E / A S D / Z X C)**; don't whack the bombs. As a boss: whack the boss when it pops up |
| **Gone Fishing** | checkpoint or boss | **Space to cast, Space again the moment it bites, hold Space to reel** — keep the line's tension on the fish without snapping it. As a boss: the big one |
| **Maze Muncher** | checkpoint or boss | steer through a maze gobbling gems; ghost-critters hurt; **big gems** turn the tables. As a boss: power up and catch the boss |
| **Cloud Hop** | checkpoint | Doodle-Jump style: bounce up the clouds, **steer ← →** (the sides wrap) |
| **Flap Dash** | checkpoint | Flappy-Bird style on a balloon: **Space / ↑ / click to flap** through the gaps |
| **Block Drop** | checkpoint | falling blocks: **← → move, ↑ turn, ↓ faster, Space drop**; clear lines |
| **Road Hop** | checkpoint | Frogger style: **hop with the arrows** across a road of carts and a river of logs (ride them) |
| **Moon Lander** | checkpoint (starlit only) | **hold ↑ to burn, ← → side thrusters**; set down slowly on the lit pad, mind the fuel |
| **River Raft** | travel: meadow → canyon | **each ← → press is a paddle stroke**; the raft drifts. Rocks and logs cost hearts, whirlpools pull, the bank slows you |
| **Mine Cart** | travel: canyon → alpine | **Space jumps gaps, hold ↓ ducks beams**; bats at head height |
| **Snowmobile** | travel: alpine → starlit | **→ throttle, ← brake**; in the air **← → tilt** to land along the slope; crevasses need speed |
| **Biplane** | travel: any crossing (at most once a run) | **hold ↑ / ↓ to climb / dive**; fly through rings for fuel, around birds and storm clouds |

**Maximum variety** (`src/encounters.js`): a run has 21 encounters — 12 bosses, 6 checkpoints and 3
journeys — and 22 games, so **no game is ever played twice in a run**; each run draws a different
selection and order (the leftover game waits for the next run). Each region's last level is its
capstone; games that can be a boss or a checkpoint go wherever the run needs them; terrain fits (the
sled only in the snow, the lander only under the stars, each crossing's own vehicle or the plane).
**Difficulty follows the position in the run, not the game**: the first encounter is at the easy end
(0.08), the last at the hard end (0.95, capstones a little more) — a game you first meet near the end
of a run comes straight at its harder settings (faster, denser, more health, extra techniques such
as the Copycat's timing check, patched walls, wind, whirlpools, bats).

**The star rating.** Finishing the last level shows how many of the run's 21 games you beat (each
listed ✓ / ✗): ★★★★★ all of them, ★★★★ 80 %, ★★★ 60 %, ★★ 40 %, ★ for finishing (`src/rating.js`;
the best is remembered). Skipping a game counts as not beaten.

**Balanced for human players** (`src/battle/humanize.js`, `npm run balance`). Every game has a bot;
wrapped in `humanize()` it plays like a person — every press, release, click and held key lands a
reaction time late (± jitter, always in order), presses are only so fast, fingers slip, aim wobbles,
and the bot anticipates as much as its reaction time (it knows what it has already pressed). Three
skills: *expert* (90 ms), *average* (150 ms) and *novice* (240 ms, more slips). The rules
(`BALANCE_RULES`, checked by `test/balance.test.js` for every game in every role): an expert wins at
the hardest settings, an average player at medium settings, a novice at least sometimes at the
easiest. The games were tuned to this with "interesting before hard" in mind — techniques rather than
raw speed: forgiving hit boxes, always an escape lane, a mercy ring when the plane's fuel runs low,
banks that slow the raft rather than hurt, a sticky (not frozen) paddle, a ball you launch yourself.
Latest report (6 seeds each; win rate at easy / medium / hard):

| Player | Easy | Medium | Hard |
|---|---|---|---|
| expert | 100 % in every game | 100 % in every game | 100 % in most; ≥ 83 % everywhere (River Raft, Road Hop) |
| average | 100 % in all but one (Biplane 67 %) | ≥ 83 % everywhere | ≥ 83 % everywhere |
| novice | ≥ 67 % everywhere (most 100 %) | ≥ 33 %; most ≥ 67 % | a real challenge: Tennis, Gone Fishing (boss), Flap Dash, Road Hop, Snowmobile, Key Jump 0–17 % |

The human model covers hands and eyes (reaction, timing, aim), not thinking: in the puzzle-ish games
(Block Drop, Whack-a-Critter, Moon Lander, Cannon Duel, Quick Draw, Copycat, Star Beat) every bot
wins, and their harder settings show up as longer wins (a larger share of the clock) rather than
losses.

Bosses are **generated monsters** (`src/monsters.js`): a body shape (blob, brute, bean, orb, jelly,
ghost), 1–3 eyes, brows, a mouth (grin, fangs, beak…), horns / antennae / ears / a crest, legs, arms,
tentacles or wings, a pattern and colours — all from the seed, each checked to be one connected,
readable creature. Their numbers are checked too: a perfect bot must win with at least a third of
the clock to spare and no more than one heart lost (on two seeds; otherwise the numbers are re-rolled),
and a player who does nothing must lose.

**Rewards by rarity.** Beat a boss and you win a piece of clothing you don't have yet — rarer the
tougher the boss (`DROP_TABLE` in `src/character.js`; a region's capstone rolls one row better):

| Rarity | Mostly from | Items |
|---|---|---|
| Common | Green Meadows | flower crown, party hat, racing scarf, bow tie, rocket boots, light-up sneakers |
| Rare | Sunbaked Canyon | top hat, pirate hat, monocle, hero mask, guitar, round shield |
| Epic | Alpine Dusk | wizard hat, viking helmet, gem crown, unicorn horn, star shades, sword, rainbow cape, butterfly wings, star robe |
| Legendary | Starlit Ruins (the last capstone always) | halo, fairy wings, dragon wings, and five glittery **after-trails** — glitter, rainbow, stardust, hearts, embers — that follow your hero in 3D (and sparkle behind it in the battles) |

The reward is shown on a pedestal beside your hero (the defeated boss sees stars in the background).
From there: **Wear it**, open the **Wardrobe** (grouped by rarity; pick an item to try it on in the
editor, locked ones stay hidden) or go on. Won items are remembered; in the editor they're marked ★,
locked ones 🔒. `?battles=0` skips the battles; `?boss=<mini-game id>` forces a boss game
(any id from the table: `runner echo quickdraw sled starbeat tennis invaders fireball breakout cannon
whack fishing maze`, or a checkpoint / travel game).

### Test menu (testing mode)

With `?quality=test` (or `?dev=1` with any quality) a **🧪 Test menu** button (or the **`** key) opens
a panel to **jump to any level** (each listed with its arcade, boss and journey for this run),
**play any mini-game in any of its roles** (boss / checkpoint / travel) **at easy, medium or hard**
(the difficulty a game gets at the start, middle or end of a run; no rewards), skip to the gem or to
the arcade, or start a new run.

### Characters

Opening the game shows the **character screen**: three default heroes — *Pip* (trail explorer),
*Nova* (sky pilot with a jetpack) and *Bruno* (gentle knight with a cape) — plus **Build your own**.
The editor offers body build (regular / slim / sturdy / small), head shape, hair (7 styles) and hat
(6), eyes and mouth, top (t-shirt, jacket, hoodie, overalls, tunic), bottoms (pants, shorts, skirt),
shoes, back gear (backpack, jetpack, cape, wings — capes and ponytails trail behind you, jet flames
burn in the air), face & neck extras (won in boss battles) and eight colours (curated swatches or any colour), with a live 3D preview (drag to
turn it) and *Randomize*. **Save design** keeps it in the roster (up to 12; edit or delete them
later); unsaved work is kept as a draft, and your last choice is remembered. Every look is scaled to
fit the player's hitbox. URL options: `?character=nova` (or `random`) skips the screen with that hero,
`?menu=0` skips it with the remembered one. The playground's *Outfit* panel offers the same heroes
and saved designs.

### Gamepad Support

The game detects and supports standard gamepads:
- **Left Stick**: Movement
- **Button 0 (A/Cross)**: Jump
- **Button 2 (X/Square)**: Air dash
- **Button 1 (B/Circle)**: Ground pound

## Project Structure

```
src/
├── main.js              # Game loop, input handling, level progression
├── physics.js           # Player movement, collision, gravity
├── renderer.js          # WebGL rendering and camera system
├── levels.js            # Level definitions using LevelBuilder
├── config.js            # Global configuration constants
├── input.js             # Input manager for keyboard and gamepad
├── audio.js             # Audio manager for sounds and music
├── particles.js         # Particle system for visual effects
├── state.js             # Game state and persistent data
├── levelBuilder.js      # Level creation utilities and validation
├── math.js              # 3D math utilities and helpers
├── performance.js       # Performance monitoring tools
├── avatar.js            # Player avatar: model, procedural animation, shadow
├── levelAudit.js        # Completability proof (bot in real physics) + quality rules
├── levelGenerator.js    # Seeded, pattern-based level generator with audit gate
├── levelLab.js          # Level Lab page (levels.html)
├── campaignAudit.js     # The campaign as a whole: distinct levels, difficulty ramp, movement vocabulary
├── character.js         # Character designs: options, default heroes, validation, saved designs
├── characterScreen.js   # Character select / build-your-own screen (index.html)
├── portrait.js          # 2D portraits of the avatar for menus (no extra WebGL context)
├── gem.js               # The goal: a floating, spinning, colour-cycling gem
├── bosses.js            # Generated bosses per run: names, mini-game, numbers + the bot checks
├── monsters.js          # Seeded pixel-art monsters (parts, shading, outline) + sprite checks
├── battle/              # The mini-games (DOM-free, deterministic, tested, each with a bot) and their drawing
│   ├── common.js        #   hearts, clock, keys / held keys, palette steps, events, simulate()
│   ├── runner.js        #   Key Jump                  echo.js       Copycat (+ timing gauge)
│   ├── quickdraw.js     #   Quick Draw (aim & shoot)  sled.js       Avalanche Run (steering)
│   ├── starbeat.js      #   Star Beat (rhythm)        tennis.js     Tennis Match
│   ├── invaders.js      #   Star Invaders             fireball.js   Spellslinger (run & gun)
│   ├── doodle.js        #   Cloud Hop (checkpoint)    flappy.js     Flap Dash (checkpoint)
│   ├── tetris.js        #   Block Drop (checkpoint)   index.js      modes, roles, routes, capstones, playBoss()
│   ├── breakout.js      #   Brick Breaker             cannon.js     Cannon Duel
│   ├── whack.js         #   Whack-a-Critter (either)  fishing.js    Gone Fishing (either)
│   ├── maze.js          #   Maze Muncher (either)     frogger.js    Road Hop (checkpoint)
│   ├── lander.js        #   Moon Lander (checkpoint)  raft.js       River Raft (travel)
│   ├── minecart.js      #   Mine Cart (travel)        snowmobile.js Snowmobile (travel)
│   ├── plane.js         #   Biplane (travel)          humanize.js   human-like players + BALANCE_RULES
│   ├── art.js           #   parallax landscapes, snow field, props (spikes, stars, ramps, key caps)
│   └── draw.js          #   one scene per mini-game + HUD + pixel particles
├── pixel.js             # Indexed-colour software renderer (320×180): shapes, sprites, text, present()
├── palette.js           # Palette ramps (UI / stage / hero / boss), recolour steps, readability check
├── heroSprite.js        # The character design as pixel art: side / front / back views, poses
├── bossBattle.js        # Boss battle screen: the loop, input, palette swaps, rules cards
├── rewardScreen.js      # The 2D reward stage (hero + won item on pedestals)
├── unlockPanel.js       # The between-levels card (reward / level complete)
├── encounters.js        # Which mini-game goes where in a run (no repeats, capstones, terrain, difficulty by position)
├── rating.js            # The end-of-run star rating
├── terrainParts.js      # 3D bounce pads (squash on landing) and the glider
├── arcade.js            # Arcade checkpoints: placement on the route, trigger, the 3D cabinet
├── trails.js            # Glittery after-trails (3D particles; pixel colours for the battles)
├── testMenu.js          # Testing mode: jump to any level / play any mini-game
├── runLevels.js         # Runs: remixed / re-generated levels and the checks that keep them fair
├── runWorker.js         # Plans a run's levels off the main thread, one level ahead
├── campaignSignatures.js# Saved signatures of the hand-written campaign (npm run levels:signatures)
├── biomes.js            # Per-tier environments: sky, fog, light, materials, scenery kit
├── materials.js         # Material → texture mapping (+ swatches for colour checks)
├── textures.js          # Procedural canvas textures (browser)
├── scenery.js           # Decoration kits, safe placement and the scenery audit
├── visualAudit.js       # Readability / unique-background checks (CIE ΔE)
├── environment.js       # Resolves tier → biome → scenery for a level (cached)
├── camera.js            # Chase camera shared by renderer and checks
├── quality.js           # Rendering presets (normal / test) + URL overrides
├── fpsMeter.js          # FPS badge + benchmark recorder
├── controls.js          # Keyboard/gamepad with edge-triggered jump/dash/pound
├── session.js           # Game rules: health, enemies, stomps, dash hits, shockwave, checkpoints
├── enemies.js           # Crawler / spiker / wisp: deterministic motion + looks
├── encounterAudit.js    # Enemy placement rules + combat bot fairness check
├── effects.js           # Particle effects for gameplay events
├── hud.js               # Hearts + technique pips (dash / glide / double jump)
├── mat4.js              # Column-major 4x4 matrix helpers
├── playground.js        # Avatar playground sandbox (playground.html)
```

## Player Avatar & Playground

The player is drawn as a jointed, box-built character (`src/avatar.js`) instead of a plain box.
It is purely visual — the physics body is unchanged — and is fully procedurally animated:

- **Idle**: breathing, arm sway, blinking, looks around after standing still
- **Run**: distance-driven stride with knees/elbows, torso twist, forward lean, banking into turns;
  feet are auto-planted on the ground (no sliding/sinking)
- **Air**: separate rising (tucked) and falling (arms out) poses blended by vertical velocity
- **Jump / land**: squash & stretch spring + landing crouch scaled by impact speed
- **Respawn**: pop-in with overshoot
- Smooth turning toward the movement direction, blob drop shadow, dust puffs on steps/jumps/landings

### Playground

Open <http://localhost:8000/playground.html> to evaluate the avatar in a sandbox arena
(stairs + high ledge, wall, hurdle, head-bonk block, pit and island). The side panel offers:

- live animation state readout (state, speed, vy, facing, blend weights, squash)
- forced animation previews (idle / run / rise / fall) played in place
- game camera or orbit camera (drag to rotate, wheel to zoom, *Face avatar* / *Side view* presets)
- slow motion, pause (P) and frame step (N)
- outfits: the three heroes and your saved designs from the character screen (plus the legacy palettes),
  physics hitbox overlay (H), shadow/dust toggles, and a legacy red-box comparison


### Core Systems

**Physics System** (`physics.js`)
- Handles player movement with acceleration
- Gravity and jumping mechanics
- Box-based collision detection
- Platform-based grounding detection
- Fall/respawn logic

**Renderer** (`renderer.js`)
- WebGL-based 3D graphics
- Box-shaped geometry (platforms, player, goal)
- Following camera with smooth positioning
- Lighting simulation via vertex shading
- Responsive canvas scaling

**Input Manager** (`input.js`)
- Unified keyboard and gamepad handling
- Configurable control schemes
- Deadzone support for gamepads
- Input state tracking

**Game State** (`state.js`)
- Level completion tracking
- Time tracking per level
- Death counter
- Settings persistence via localStorage
- Best time recording

**Level System** (`levels.js`, `levelBuilder.js`)
- Fluent API for defining levels
- Platform placement and sizing
- Spawn and goal positioning
- Level validation utilities
- Helper methods for common patterns (staircases, rows)

### Supporting Systems

- **Audio Manager**: Sound loading and playback framework
- **Particle System**: Emission and lifecycle management
- **Performance Monitor**: Frame rate and timing statistics
- **Math Utilities**: Vector operations, interpolation, geometry checks
- **Config**: Centralized game constants and tuning parameters

## Level Design Guide

### Creating a New Level

Use the `LevelBuilder` fluent API in `src/levels.js`:

```javascript
import { createLevel } from './levelBuilder.js';

export const levels = [
  createLevel('My Level')
    .setSpawn(0, 1, 0)                    // Player start position
    .addPlatform(0, 0, 0, 6, 1, 6)       // x, y, z, width, height, depth
    .addPlatform(0, 0.5, 6, 4, 1, 3)
    .addStaircase(0, 1, 10, 5, 2, 0.5, 2) // Helper for stairs
    .addPlatformRow(-5, 0, 0, 4, 3, 2, 1, 2) // Helper for rows
    .setGoal(0, 3, 20, 1)                // Goal x, y, z, radius
    .build(),
];
```

### Coordinate System

- **X-axis**: Left (-) to Right (+)
- **Y-axis**: Down (-) to Up (+) — vertical
- **Z-axis**: Back (-) to Forward (+)

### Platform Positioning

- Platform positions define their **centers**
- `width`: X-axis extent
- `depth`: Z-axis extent (forward/back)
- `height`: Y-axis extent
- Platform top surface is at `y + height / 2`

### Spawn and Goal

- **Spawn Y**: Player's feet position (should be above a platform)
- **Goal Y**: Top surface of the goal platform
- Place spawn and goal on or above platforms for proper functionality

## Configuration

Edit `src/config.js` to adjust game parameters:

```javascript
PLAYER_SPEED: 5              // Movement speed
PLAYER_JUMP_SPEED: 8         // Jump velocity
GRAVITY: 20                  // Gravity acceleration
CAMERA_FOV: Math.PI / 3      // Field of view
CLEAR_COLOR: [0.57, 0.79, 0.91, 1]  // Sky color
```

## Adding Features

### Add Particle Effects

```javascript
import { particleSystem } from './particles.js';

// Emit particles
particleSystem.emit(x, y, z, {
  count: 10,
  speed: 5,
  color: [1, 0.83, 0.15],
  lifetime: 1
});

// Update in game loop
particleSystem.update(dt);
```

### Add Sound Effects

```javascript
import { audioManager } from './audio.js';

// Load a sound
audioManager.loadSound('jump', './sounds/jump.mp3');

// Play it
audioManager.play('jump', { volume: 0.7 });
```

### Extend Game State

```javascript
import { gameState } from './state.js';

// Track custom stat
gameState.stats.customValue = 0;
gameState.saveToLocalStorage();

// Retrieve setting
const quality = gameState.getSetting('graphicsQuality');
```

## Testing

Run the test suite:

```sh
npm test
```

Tests are in `test/` (Node's built-in runner, no dependencies):

| File | Covers |
|---|---|
| `physics.test.js`, `avatar.test.js` | movement, collisions, the animated avatar |
| `levels.test.js` | the level audit (incl. air-dash routes and their timing window), every campaign level, the generator |
| `fun.test.js`, `encounters.test.js` | fun requirements (false paths, shortcuts, dashes, drops), enemy placement and fairness |
| `campaign.test.js` | the campaign as a whole: distinct levels, difficulty ramp, movement vocabulary, themes |
| `character.test.js` | character designs, saved designs, every look fitting the hitbox, portraits |
| `boss.test.js` | generated bosses per run, the encounter plan (no game twice in a run, capstones, terrain, travel routes, difficulty by position), the star rating, the bot checks for 3 runs (bosses, checkpoints, journeys), the first mini-games' rules, rarity & drops, trails, unlocks, the gem |
| `games.test.js` | the rules of the newer games: brick breaker, cannon, whack, fishing, maze, road hop, lander and the four travel levels |
| `balance.test.js` | human-like players (late, in order, rate-limited) and `BALANCE_RULES` for every game in every role |
| `techniques.test.js` | glide, double jump and bounce pads in the physics, one new technique per region, the audit's special moves, generated levels using only the techniques they're given |
| `retro.test.js` | the pixel renderer, palettes readable at every recolour step, hero sprites for every editor option, pedestal art, monster checks, every scene drawing in every region |
| `run.test.js` | runs: mirrored levels, a full run passing the campaign audit (also mixed with hand-written levels), reproducibility, the checks |
| `rendering.test.js` | quality presets, hidden-face removal, scenery chunks, frustum culling, detail distance |
| `visuals.test.js`, `state.test.js` | biome readability and scenery safety; saved stats surviving a reload |

`npm run levels:report` runs the audits at scale (campaign + hundreds of generated levels);
`npm run balance` prints the full balance table (every game × role × easy/medium/hard × expert/average/novice);
`node scripts/pixel-preview.mjs heroes|monsters|scenes out.png [seed]` renders pixel-art contact sheets
(hero sprites, generated monsters, every battle scene) without a browser;
see [LEVEL_DESIGN.md](LEVEL_DESIGN.md) for the level-design rules and why they exist.

## Performance Monitoring

Enable performance stats in `src/config.js`:

```javascript
SHOW_PERFORMANCE_STATS: true
```

The `performanceMonitor` tracks:
- Frame rate (FPS)
- Frame time
- Update time
- Render time

Access via:
```javascript
import { performanceMonitor } from './performance.js';
console.log(performanceMonitor.toString());
```

## Browser Compatibility

- Requires WebGL support (modern browsers: Chrome, Firefox, Safari, Edge)
- No external dependencies
- Works with ES6 modules

## Extending the Game

### Add a New Level Type

Modify `levelBuilder.js` to add helper methods:

```javascript
addChallengePattern(x, y, z) {
  // Custom pattern
  return this;
}
```

### Add a New Game Feature

Create a new module in `src/` following the established patterns:
1. Export a class or singleton instance
2. Provide simple public API
3. Handle initialization and cleanup
4. Integrate in `main.js` game loop

### Add Custom Rendering

Extend `renderer.js`:
- Use the existing WebGL context
- Add new geometry types beyond boxes
- Implement new shaders for effects

## License

MIT

## Development Notes

- All modules are dependency-free and framework-agnostic
- Game loop runs at 120 FPS with fixed timestep physics
- Camera smoothly follows player with offset
- Collision detection uses box-box intersection with simplified shapes
- Platform heights and spawn positions must be carefully designed