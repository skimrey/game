# 3D Platformer

A robust, dependency-free browser-based 3D platformer with WebGL rendering, multiple levels, physics-based gameplay, and extensible architecture for adding features like audio, particles, and advanced input handling.

**Docs**: [HANDOFF.md](HANDOFF.md) (start here if you're new to the project) · [STRUCTURE.md](STRUCTURE.md) (code map, how to add things) · [WORLD_DESIGN.md](WORLD_DESIGN.md) (design reasoning) · [ARCHITECTURE.md](ARCHITECTURE.md) · [LEVEL_DESIGN.md](LEVEL_DESIGN.md)

## Features

- **WebGL Rendering**: Smooth 3D graphics with a following camera system
- **Physics Engine**: Gravity, jumping, collision detection, and fall detection
- **Character creator**: pick one of three heroes or build your own (build, head, hair, hat, eyes, mouth, top, bottoms, shoes, back gear and 8 colours); designs are saved in the browser
- **Roguelite runs**: every run has new level layouts (the hand-written campaign remixed and re-generated, every level re-checked by the audits) and new, generated bosses
- **8 zones, 4 per run**: every run's four stages take place in four of eight zones — Green Meadows, Sunny Lagoon, Sunbaked Canyon, Mushroom Grove, Alpine Dusk, Ember Peaks, Crystal Caverns, Starlit Ruins — each with its own sky, textures, scenery, 2D stage art and capstone mini-game (see [WORLD_DESIGN.md](WORLD_DESIGN.md))
- **NPCs with silly faces**: one per stage along a level's route (and villagers in town), generated with googly eyes, Pinocchio noses, buck teeth, unibrows and bobble-heads — silly, not unsettling: features that read as creepy were dropped after review and each face has an *oddness budget* (`faces.html` shows a contact sheet; `cast3d.html` shows people as the game's 3D renderer draws them, with a *weirdness* score per person); they **trade** clothes (equal rarity) and give **quests** — a generated *rift* level with a twist, a sword duel, or a **dungeon delve** (a side-on crawl of three rooms and a boss, fought with your class's own weapon and move) — that teach you a spell
- **Classes and a spellbook**: choose Warrior, Hunter or Sorcerer at the portal; learn one spell per stage (pick one of two) from a book of six; spells work in every mini-game — keys 1–5 (or the numpad), or **Tab** for the next spell that's ready. Every spell says what it does and when to use it — on the portal, the NPC's offer, the battle's rules card and a coach bubble in your first battles. In a dungeon delve the class is a real kit (sword + shield, bow + dodge-roll, bolts + blink) and spells recharge
- **A town square and a home**: a 3D hub with a fountain, columns and a big portal to start runs (turn the camera: drag, or hold Z / X; wheel zooms); a path to your 2D pixel-art home with a wardrobe, a pet bed and decorations you bring back from every finished run — and a **ranch** out the back where the bosses you've befriended roam
- **The Monster Ring**: at the end of each stage of a run — if you beat its last boss — one of the bosses you beat there can come home with you. Its type comes from its zone, its signature move from the game you fought it in (the Tennis boss volleys, the Quick Draw boss shoots first, the Spore Bomber poisons everyone). Three make a squad for the **Ring** behind the inn: turn-based 3-on-3 fights in speed order with types, statuses and cooldowns; monsters level up; tamers from every world climb with you through five tiers (`src/ring/`)
- **The inn (the Tipsy Teapot)**: Bertha's challenge board of mini-games that pay **gold** (new ones after every run, each won once), Pippa the barmaid's tips, and **Tess the tailor**, who paints 8×8 patterns onto the clothes you own (tops, capes, wings) and recolours trails — gold buys only looks, never cards or power
- **Pets**: eight species that follow you in 3D (hopping the gaps you jumped), sit on the battle HUD cheering you on, and live in your home
- **28 retro mini-games** (the 22 below plus Blade Duel, Bubble Pop, Spore Bomber, Lava Guard, Shard Storm and the quest-only Dungeon Delve — see [WORLD_DESIGN.md](WORLD_DESIGN.md)): each level ends in a floating gem; grabbing it starts a pixel-art boss battle against a generated monster (13 boss games). One level per stage has an arcade cabinet halfway with a checkpoint mini-game (win it to save your progress there), and between regions you **travel** by raft, mine cart, snowmobile or biplane (4 vehicle levels — **in 3D by default**, the same game drawn by the WebGL renderer with you seated in the vehicle; one click on the trip's card switches to the 2D pixel version and the choice is remembered; `?travel=2d|3d`). **No game repeats within a run** — not even through NPC quests (no Blade Duel quest in a run that already has a Blade Duel, at most one dungeon delve): you learn the games across runs, and within a run the only thing that grows is the difficulty — the later a game turns up, the harder its settings (19 encounters, a different selection and order every run). Every correct move recolours the whole scene. Bosses drop clothing by rarity (29 items: common → legendary wings, halos and glittery after-trails)
- **Chiptune music and sound, made on the spot**: a little Web Audio synth (pulse waves, triangle, noise, echo) and a composer that writes a loopable tune for every level (in its zone's style — a waltz in the Alps, a galloping spaghetti-western in the canyon, a lazy island skank in the lagoon…), every mini-game, the town, your home, rifts and the card table; sound effects for everything, and every NPC babbles in their own voice. No files, no internet (`src/audio/`)
- **Riftcards**: a card battle in the town square (best of three rounds, one card a turn or pass — after the card duels of *The Witcher 3*, with its own twists): eight factions (one per zone, each with a perk), three rows, and rounds played in **the worlds** — home ground for their faction, their own weather for everyone else; collect cards from rifts, runs and wins, build a deck per faction, climb six tiers of card battlers who arrive from every world, and face the Rift King (`src/cards/`)
- **A story and a gentle start**: the first run is light (no class yet; NPCs ask for rifts), classes and duels come on run 2, delves on run 3; story beats are told in town; the finale is a card game against the Rift King (`src/progression/story.js`)
- **Save and resume**: a run in progress is saved at every level; close the game and the portal takes you back to it
- **A home arcade**: an arcade cabinet in your house replays any mini-game you've met, at any difficulty, for your best time
- **Options (⚙)**: music and effects volume, mute (M), reduced motion, assist mode (an extra heart and more time in every mini-game)
- **Touch controls** on tablets and phones; **the same key strip** at the bottom of every mini-game (its keys, then spells and pause)
- **Local play stats**: the notice board names the mini-game that beats you most often (practise it at the home arcade)
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
npm run dev:test-hq                           # testing mode at full quality (the test menu and FPS readouts, normal rendering — for a GPU)
node scripts/dev-server.mjs --open index.html --quality test   # any page, any preset
```

Rendering presets (URL `?quality=…`, see `src/engine/quality.js` and `perf/README.md`):

| Preset | For | Settings |
|---|---|---|
| `normal` (default) | playing on a machine with a GPU | full resolution (up to 2× HiDPI), MSAA, full sky, all scenery, trilinear + anisotropic textures |
| `testhq` | testing on a machine with a GPU | everything `normal` draws, plus the test menu and the FPS readouts |
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
- **Talk to an NPC**: E when you're next to one (a "! " floats over NPCs with a quest)
- **Cast a spell** (in the mini-games): 1–5 (top row or numpad) picks one, **Tab** casts the next one that's ready (no game uses these keys — Key Jump's digits are 6–9 and 0); clicking the spell bar works too
- **Dungeon delve** (an NPC quest): ← → move, Space jump (↓ drops off a ledge), J / X attack (hold), hold ↑ to aim up (45° shots / an overhead swing — no aim help), K your class move — Warrior: hold to raise the shield · Hunter: dodge-roll · Sorcerer: blink
- **Options**: the ⚙ button (top right) — volumes, reduced motion, assist mode; **M** mutes
- **Touch screens**: an on-screen pad appears (D-pad; A = Space, B = J, K, E, ⏸ = Esc) — it sends the same keys, so everything works with it (`?touch=1` shows it anywhere); tap the spell bar for spells
- **Riftcards**: ← → choose a card · Enter play it (nimble cards: ↑ ↓ pick the row, Enter) · Space / P pass (twice to be sure) · Esc pause · H rules — or the mouse
- **The Ring**: arrows choose a move (or 1–4) · Enter · then ← → a target, Enter · Esc back a step — or click a move, then a monster
- **The inn and the ranch**: ← → walk (or click where to go), ↑ / E talk or use, Esc back outside
- **In town**: walk into the portal to set off (or to continue a saved run); follow the path east to your door, west to the inn; E talks to villagers and reads the notice board; **turn the camera** by dragging (or hold Z / X), wheel to zoom — movement follows the camera
- **At home**: ← → walk, ↑ / E use (the door, the wardrobe, the pet bed, the decorations), Esc back to town
- **Test menu** (testing mode): ` (backquote)

### Runs

The game starts in the **town square** (after the character screen): walk into the portal to choose
a class and set off; each run ends back in town with a souvenir for your home. `?hub=0` (or any of
`?level`, `?run`, `?seed`) skips the town and starts a run straight away. `?zones=lagoon,grove,volcano,crystal`
picks the run's zones, `?class=hunter` the class, `?pet=fox` lends you a pet.

Every time you start the game you play a new **run** (the seed is shown in the status line):

- **New layouts.** The hand-made levels are remixed — mirrored left↔right half the time, every
  platform nudged and resized a little, enemies re-timed — and the generated levels are
  re-generated from their theme and difficulty with a seed from the run. Every candidate must pass
  the same checks as the hand-written campaign (completable by the bot, fair jumps, the fun and
  encounter audits), keep every move its level teaches (air dash, long drops, stomps, spikers,
  shortcuts, false paths), stay between the levels before and after it on the difficulty ramp, keep
  its length, and look distinct from every other level; otherwise the hand-written level is used.
  A worker plans one level ahead, so this never blocks the game (see `src/levels/runLevels.js`).
- **A technique per region.** Each region adds one movement technique and keeps the earlier ones
  (`TIER_ABILITIES` in `src/levels/index.js`; the HUD shows the ones you have as pips): **bounce pads** in
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
battle (pixel art at 320×180, no 3D — it runs at full speed without a GPU). One level per stage also has an
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
| **Blade Duel** | checkpoint or boss (and NPC duels) | the foe strikes **high, middle or low** (its blade points there): **hold ↑ / nothing / ↓** to guard, then **Space to parry** the staggered foe; three parries win. Later: feints and combos |
| **Bubble Pop** | lagoon capstone | **aim ← → (or the mouse), Space / click to shoot**; three of a colour pop, what hangs from nothing drops; the rock creeps down |
| **Spore Bomber** | grove capstone | **one cell per arrow press, Space drops a spore-puff** that bursts in a cross; catch the boss in a burst |
| **Lava Guard** | volcano capstone | **aim with the mouse (or keys), click / Space**: water shots burst where you aim and douse the lava bombs before they hit the huts |
| **Shard Storm** | crystal capstone | **← → turn, ↑ thrust, Space shoot** in a wrapping cave; shoot a gap in the boss's ring of crystals, then shoot through |
| **Dungeon Delve** | NPC quest only | a side-on crawl: **← → move, Space jump, J attack (hold ↑ to aim up — no aim help), K class move**. Three rooms (hopping slimes, swooping bats, skeletons that lob arrows where you stand), then the **Rift Warden** (jump its shockwaves, dodge its charge, get out from under its leap; hit it when its guard is down). Warrior: sword + shield (hold K, blocks the front and above) · Hunter: bow + dodge-roll · Sorcerer: piercing bolts + blink. Spells recharge here (12 s) |

**Maximum variety** (`src/progression/encounters.js`): a run has 19 encounters — 12 bosses, 4 checkpoints (one a stage) and 3
journeys — and 27 games, so **no game is ever played twice in a run** (the capstones of the four
zones a run doesn't visit sit it out; journeys are planned so every crossing gets its own vehicle); each run draws a different
selection and order (the leftover game waits for the next run). Each region's last level is its
capstone; games that can be a boss or a checkpoint go wherever the run needs them; terrain fits (the
sled only in the snow, the lander only under the stars, each crossing's own vehicle or the plane).
**Difficulty follows the position in the run, not the game**: the first encounter is at the easy end
(0.08), the last at the hard end (0.95, capstones a little more) — a game you first meet near the end
of a run comes straight at its harder settings (faster, denser, more health, extra techniques such
as the Copycat's timing check, patched walls, wind, whirlpools, bats).

**The star rating.** Finishing the last level shows how many of the run's 19 games you beat (each
listed ✓ / ✗): ★★★★★ all of them, ★★★★ 80 %, ★★★ 60 %, ★★ 40 %, ★ for finishing (`src/progression/rating.js`;
the best is remembered). Skipping a game counts as not beaten.

**Balanced for human players** (`src/games/kit/humanize.js`, `npm run balance`). Every game has a bot;
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

The five newer games meet the same rules (latest report, 6 seeds): experts win 100 % at hard
settings (Bubble Pop 83 %), average players ≥ 83 % at medium, novices ≥ 67 % at easy; at hard
settings Spore Bomber and Shard Storm are the toughest capstones for novices (0 %), Blade Duel and
Bubble Pop a coin toss (50 %). Two of them model *thinking* as well as hands: Bubble Pop's bot looks
at the pile for 0.45 s + 4 × its reaction time before each shot, Lava Guard's picks its next target at
a human cadence. Spells (WORLD_DESIGN.md) come on top of this balance — the games don't need them.
The Dungeon Delve is balanced per class (9 seeds each, `class` = the kit; you aim yourself): experts
win 100 % with every class, average players 100 % (Warrior, Hunter) and 89 % (Sorcerer), novices at the
easy settings 78 % (Warrior), 67 % (Hunter), 56 % (Sorcerer); the perfect bot clears it in 25–45 s of a
~125 s clock.

The human model covers hands and eyes (reaction, timing, aim), not thinking: in the puzzle-ish games
(Block Drop, Whack-a-Critter, Moon Lander, Cannon Duel, Quick Draw, Copycat, Star Beat) every bot
wins, and their harder settings show up as longer wins (a larger share of the clock) rather than
losses.

Bosses are **generated monsters** (`src/characters/monsters.js`): a body shape (blob, brute, bean, orb, jelly,
ghost), 1–3 eyes, brows, a mouth (grin, fangs, beak…), horns / antennae / ears / a crest, legs, arms,
tentacles or wings, a pattern and colours — all from the seed, each checked to be one connected,
readable creature. Their numbers are checked too: a perfect bot must win with at least a third of
the clock to spare and no more than one heart lost (on two seeds; otherwise the numbers are re-rolled),
and a player who does nothing must lose.

**Rewards by rarity.** Beat a boss and you win a piece of clothing you don't have yet — rarer the
tougher the boss (`DROP_TABLE` in `src/characters/character.js`; a region's capstone rolls one row better):

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

### Riftcards (the card game in town)

Talk to a card battler in the square and pick **🃏 Play Riftcards**. The first time, choose a
**faction** and you get its starter deck. A match is a battle of **strength** over **three rows**,
best of **three rounds** (inspired by the card duels in *The Witcher 3*):

- You start with 10 cards and 2 gems. Each turn you play **one card** — or **pass** and sit the rest
  of the round out. When both have passed, the bigger total wins the round and the loser loses a
  gem. Lose both and you lose the match. **No new cards between rounds**: whatever you spend is gone,
  so the art is winning a round cheaply — or letting one go to win the other two.
- Creatures go to their row: **front** (brawlers), **back** (archers, casters), **sky** (fliers).
  Abilities: **pack** (same-named creatures in a row multiply), **swarm** (the rest of its kind
  jumps out of your deck), **rally** (+1 to its row), **cheer** (doubles its row), **sneak** (goes to
  the other side — and you draw two), **revive** (brings back your best fallen creature), **burn**
  (burns the strongest across the way), **nimble** (front or back), **legend** (immune to everything).
- Specials: **Blizzard / Sea Mist / Dust Storm** (every creature in the front / back / sky rows counts 1),
  **Sunny Day**, **Brass Band** (doubles one of your rows), **Lava Burst** (burns the strongest on the table).
- **The worlds**: each match draws three of the eight worlds, one per round, shown from the start. In
  its world a faction's creatures get **+1 (home ground)**; the Alpine, Lagoon and Canyon worlds bring
  their weather (a blizzard on the front rows, sea mist at the back, a dust storm in the sky) for
  everyone but the locals. Knowing that round two is in your home world changes how you spend round one.
- **Eight factions**, one per zone, each with a perk: Bloomkin (meadow — win ties), Tidefolk (lagoon —
  a card for every round won), Dustriders (canyon — back row ignores weather, agile +1), Sporefolk
  (grove — a creature stays after each round), Frostkin (alpine — their weather only chills you),
  Emberborn (volcano — their scorch spares their own), Prismfolk (crystal — first creature each round
  +2), Starborn (starlit — legends +1). 73 cards, each with a generated, animated critter — arms, claws,
  tentacles or wings, two colourways per faction, on a backdrop for its row (sky, field, dusk).
- **The ladder**: the square is where card battlers from every world meet, and new ones come every
  time you return to town. They play **their world's faction** at your **tier** — Novice, Apprentice,
  Adept, Expert, Master, Champion. Beat **three** at your tier to rise; the next, tougher ones arrive
  while you're off on your next journey. Higher tiers play sharper (Champions and the King look ahead)
  with rarer cards — and the cards you win get rarer too. Clearing Champion wins the Champion's Cup and
  brings the **Rift King** (the Starborn's legendary heroes, 12 cards to your 10) to the portal.
- **Where cards come from**: your starter deck; every win (pick one of three of their spares — two of
  your faction, one of theirs); rising a tier (a pack); rift quests (pick one of three of that zone's faction);
  every finished run (a pack).
- **Decks**: one per faction, 15–25 cards, at least 10 creatures, at most 3 of a common, 2 of a rare,
  1 of an epic or legendary, 2 spies — edit them at the card table in your home's game room or before
  a match (**✨ Build the best deck for me**).
- The table (400×225 pixel art): cards fly in from your hand (theirs from the portrait, musters from
  the deck, revivals from the discard pile), creatures hop as they land, strengths pop +N / −N, snow,
  fog and rain fall on their rows, burned creatures go up in flames, and at the end of a round the
  table holds still under a banner before it's swept away.
- Balance (`test/cards.test.js`, the computer playing both sides): every starter faction wins 40–55 %
  against the others; a starter deck beats the Novices most of the time; Masters are tougher; the
  Rift King beats a Champion-sized deck more often than not.

### The inn, the Ring and the ranch

West of the square is the **Tipsy Teapot**. Walk in (it's 2D, like your home):

- **The challenge board**: three mini-games (ones you've met on runs), easy / medium / hard, for
  10 / 20 / 35 **gold**. Each can be won once; Bertha pins up new ones after your next run.
  **Pippa the barmaid** wanders between the tables with a tray — talk to her for a tip. Gold also
  comes from finished runs (10 a star + 2 a game) and Ring wins. **Gold only buys looks** (the tailor)
  — never cards or monsters, so nothing in the card game or the Ring can be bought.
- **Tess the tailor**: pick a pen (your outfit's own colours, white, ink or gold) and paint an 8×8
  pattern onto your **top**, your **back item** (capes, wings, shields…) or recolour your **trail**;
  you see it on your hero in 2D and 3D as you paint, and pay when you sew it (plain clothes 20 gold,
  rare things more, legendary wings 150, trails 200). Patterns belong to the item: wear it with any design.
- **The Ring** (out the back door): **Rocco the Ring Master** keeps the ladder (Rookie → Bronze →
  Silver → Gold → Champion) and your squad; three **tamers** from other worlds wait to be
  challenged. Beat the three at your tier to rise — the next ones arrive after your next run.
- **Bertha** holds court behind the bar, tankard of foaming ale in hand.

**Where monsters come from**: every boss you beat on a run is a generated monster. At the end of
each stage — **if you beat the stage's last boss** — **one of that stage's beaten bosses can come
home with you** (pick it, or none; a type you don't have yet is marked). It keeps
its looks and name; its **type** is its zone's (Leaf, Tide, Stone, Spore, Frost, Flame, Gem, Star —
each hits two others ×1.5 and is hit hard by two), its **signature move** comes from the mini-game
you fought it in, its body (walker, brute, flyer, floater, dancer) gives another move and its stats,
and later stages bring stronger ones. They live on your **ranch** (the back door of your game room):
they roam, nap and come over when you walk up; the squad board picks who fights.

**A Ring fight**: 3 against 3. Each round, give each of your monsters a command (a move and a
target), then everything happens in speed order — Guard and quick moves first. Damage depends on
attack vs defence, level and type; burns and poison tick, frozen and stunned monsters lose a turn,
buffs last three rounds, a taunting monster draws every attack, Riposte parries and strikes back, big
moves need a round or two to come back. Everyone who fought gains experience (a loss teaches a
little too) and levels up. Balance (`test/ring.test.js`, the computer on both sides): equal squads
win about half the time; two levels up wins most fights; a type advantage tells; no signature move
is a must-have.

### Music and sound

Everything you hear is made in the browser (`src/audio/`): `synth.js` is a tiny chip — pulse waves
(12.5 / 25 / 50 %), a triangle bass, noise drums, envelopes, vibrato and an echo, scheduled ahead on the
audio clock; `compose.js` writes **8-bar loops** (A A' B A'': a two-bar motif on chord tones, answered,
repeated over the next chords, a higher B phrase, a cadence home) in a style per place — meadow pop,
island skank (lagoon), spaghetti-western gallop with an Andalusian cadence (canyon), dorian walking bass
(grove), a lydian **waltz** (alpine), harmonic-minor drive (volcano), shimmering lydian arpeggios with
no drums (crystal), dreamy minor with echo (starlit), a cozy town tune, a music-box lullaby at home,
minor-key boss fights, jazzy swing for cards, phrygian dungeons, a flamenco-ish duel… Each **level,
mini-game and place has its own seed**, so each has its own tune (the same one every time you come
back). `sfx.js` has ~50 effects (jumps, stomps, gems, parries, card plays…); NPCs **babble** as their
words type out, each in their own voice. Volumes, mute (**M**) in ⚙ Options. Browsers start audio on the
first key press or click.

### Story, saving and the home arcade

- **The story** (`src/progression/story.js`): Hearthmoor, the Great Portal, rifts tearing open, the card craze and
  the Rift King — told in short beats in town as you progress (the notice board shows the chapter).
  The **first run is gentle**: no class or spells, NPCs only ask for rifts. Run 2 brings classes, spells
  and duels; run 3 dungeon delves. (Test menu: 🔓 Unlock everything.)
- **Save and resume**: from town, your run is saved at the start of every level (seed, zones, class,
  spells, results, quests and trades). Close the game; next time the portal offers **Continue your run**
  (the level's layouts are remade from the seed, which takes a few seconds) or to give it up.
- **The arcade cabinet** (home, game room): every mini-game you've met on a run, at easy / medium /
  hard, with your wins and best times. Games you haven't met are locked (???).
- **Assist mode** (⚙): an extra heart and 30 % more time in every mini-game; **reduced motion**: no
  screen shake or red flashes.

### Test menu (testing mode)

With `?quality=test` (or `?dev=1` with any quality) a **🧪 Test menu** button (or the **`** key) opens
a panel to **jump to any level** (each listed with its arcade, boss and journey for this run),
**play any mini-game in any of its roles** (boss / checkpoint / travel / quest) **at easy, medium or hard**
(the difficulty a game gets at the start, middle or end of a run; no rewards), skip to the gem or to
the arcade, or start a new run. A **🚂 Journeys** section tests the travel levels: each vehicle
(River Raft, Mine Cart, Snowmobile, Biplane) **in 3D or 2D** at easy / medium / hard, with any zone's
scenery (the *Scenery* picker), and **⏭ Skip to this run's next journey** plays the run's real next
crossing (the levels before it are skipped; the trip leads on to the level after it).

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

The full map — every folder and file, what it's for, and how to add a mini-game, a level, a zone, a
Riftcard, a spell or a sound — is in **[STRUCTURE.md](STRUCTURE.md)**. In short:

```
src/
├── main.js        the entry point (loads app/boot.js)
├── app/           the running game: shared state G, the frame loop, runs, levels, journeys, NPC quests,
│                  the town and its card battlers, the test menu, window.game
├── engine/        WebGL renderer, camera, quality presets, the pixel renderer and palettes, input
├── world/         physics, the session (hearts, enemies), zones, biomes, scenery, arcade cabinets
├── levels/        builder, generator, audits, campaign/ (one file per level), run levels + worker
├── characters/    avatar, character designs, hero sprites, monsters, NPCs and faces, pets, trails
├── games/         the 28 mini-games (games/<id>/: rules.js · draw.js · index.js · scene3d.js),
│                  kit/ (shared drawing, keys, humanize, 3D journeys), screen.js (the battle screen)
├── progression/   spells, encounters, bosses, star rating, story, the profile
├── town/          the 3D square, your 2D home, the inn, the ranch, the tailor, decorations, the portal panel
├── cards/         Riftcards: catalog, match rules, AI, decks, pixel art, the table, panels
├── ring/          the Monster Ring: monsters from bosses, battle rules, AI, tamers, the screen, panels
├── ui/            HUD, reward stage, options, test menu, touch pad
├── audio/         chiptune composer, synth, sound effects, music direction
└── tools/         playground, Level Lab, texture gallery
```

## Player Avatar & Playground

The player is drawn as a jointed, box-built character (`src/characters/avatar.js`) instead of a plain box.
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

**Physics System** (`world/physics.js`)
- Handles player movement with acceleration
- Gravity and jumping mechanics
- Box-based collision detection
- Platform-based grounding detection
- Fall/respawn logic

**Renderer** (`engine/renderer.js`)
- WebGL-based 3D graphics
- Box-shaped geometry (platforms, player, goal)
- Following camera with smooth positioning
- Lighting simulation via vertex shading
- Responsive canvas scaling

**Input Manager** (`engine/input.js`)
- Unified keyboard and gamepad handling
- Configurable control schemes
- Deadzone support for gamepads
- Input state tracking

**Game State** (`engine/state.js`)
- Level completion tracking
- Time tracking per level
- Death counter
- Settings persistence via localStorage
- Best time recording

**Level System** (`levels/index.js`, `levels/builder.js`)
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

Each campaign level is its own file in `src/levels/campaign/` (listed in `src/levels/index.js`).
A hand-made one uses the `createLevel` fluent API (`src/levels/builder.js`):

```javascript
// src/levels/campaign/13-my-level.js
import { createLevel } from '../builder.js';

export default createLevel('My Level')
  .setSpawn(0, 1, 0)                       // Player start position
  .addPlatform(0, 0, 0, 6, 1, 6)           // x, y, z, width, height, depth
  .addPlatform(0, 0.5, 6, 4, 1, 3)
  .addStaircase(0, 1, 10, 5, 2, 0.5, 2)    // Helper for stairs
  .addPlatformRow(-5, 0, 0, 4, 3, 2, 1, 2) // Helper for rows
  .setGoal(0, 3, 20, 1)                    // Goal x, y, z, radius
  .build();
```

A generated one is just a recipe: `export default { seed, difficulty, theme, tier }`. See
[STRUCTURE.md](STRUCTURE.md) (*How to add… a level*) and [LEVEL_DESIGN.md](LEVEL_DESIGN.md).

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

Edit `src/engine/config.js` to adjust game parameters:

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

Sounds are made on the spot by the chiptune synth — add a recipe to `src/audio/sfx.js`, then:

```javascript
import { sound } from './audio/music.js';

sound.fx('jump');                 // a sound effect
sound.place('town', seed);        // a place's tune
sound.jingle('victory');          // a one-shot jingle over the music
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
npm test              # everything (~3 minutes)
npm run test:quick    # all but the slow, bot-heavy files (~20 s) — while you work
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
| `visuals.test.js`, `state.test.js` | biome readability and scenery safety (all 8 zones), every zone's background distinct; saved stats surviving a reload |
| `zonegames.test.js` | zone capstones, and the rules of Blade Duel, Bubble Pop, Spore Bomber, Lava Guard, Shard Storm; their mechanical checks at every capstone difficulty |
| `cards.test.js` | Riftcards: every card and faction (and its picture), strength rules (weather, bond, rally, horn, heroes), perks, abilities (spy, muster, medic, scorch), rounds and gems, the computer player (legal, beats beginners and reckless players, the look-ahead), faction balance, the ladder and the King, deck rules, packs by tier, the tier ladder in the profile |
| `ring.test.js` | the Ring: types (each strong vs two, weak vs two), monsters from bosses (type, body, signature move, level), the battle rules (speed order, type damage, guard, cooldowns, taunts, knock-outs), the computer player, balance (levels, types, every signature move), tamers and the ladder, experience, gold and the inn's board, the tailor's patterns in 2D and 3D |
| `audio.test.js` | the composer: every style, 8-bar loops, strong beats on chord tones, mostly stepwise melodies, no clashing scales; jingles, voices; every sound effect the game asks for exists; every game's key guide |
| `story.test.js` | the gentle first run and what unlocks when (the King after the Champions), story beats in order, the profile (cards, decks per faction, arcade records, games met, settings, a saved run; old profiles — and Riftcards 1 profiles — still load) |
| `delve.test.js` | the Dungeon Delve: rooms and the Warden, doors, each class's kit (shield, roll, blink, piercing bolts), the Warden's guard, bots of every class win (idle loses), spells landing on foes and recharging, drawing |
| `travel3d.test.js` | the 3D journeys: every vehicle builds a world and hands the renderer a camera and finite geometry every frame, start to finish, in four zones |
| `spells.test.js` | the classes and books, spell offers, and every spell cast in every one of the 27 games |
| `npcs.test.js` | NPC generation (deterministic, silly faces never alike in a run, none over the oddness budget, none of the dropped features; the mayor's fixed face), trade offers, quests, placement on the route, the faces in 3D / sprite / portrait |
| `town.test.js` | the town square (walk to the portal and the door in the real physics, no falling off), pets (the follower never walks on air), decorations, the profile |

`npm run levels:report` runs the audits at scale (campaign + hundreds of generated levels);
`npm run balance` prints the full balance table (every game × role × easy/medium/hard × expert/average/novice);
`node scripts/cast-sheet.mjs out.png [runSeed …]` draws everyone you'd meet together (the square, the inn,
each stage's NPC and bosses on its zone's backdrop) to review looks by eye.
`node scripts/pixel-preview.mjs heroes|monsters|scenes out.png [seed]` renders pixel-art contact sheets
(hero sprites, generated monsters, every battle scene) without a browser;
see [LEVEL_DESIGN.md](LEVEL_DESIGN.md) for the level-design rules and why they exist.

## Performance Monitoring

Enable performance stats in `src/engine/config.js`:

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

Modify `levels/builder.js` to add helper methods:

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
4. Integrate in `app/boot.js` game loop

### Add Custom Rendering

Extend `engine/renderer.js`:
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