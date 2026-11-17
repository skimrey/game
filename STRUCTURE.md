# Project structure

How the code is laid out, what each part is for, and how to add the things you're most likely to
add (a mini-game, a level, a zone, a Riftcard, a spell, a decoration, a sound). Design reasons are in
[WORLD_DESIGN.md](WORLD_DESIGN.md) and [LEVEL_DESIGN.md](LEVEL_DESIGN.md); the systems in more
depth in [ARCHITECTURE.md](ARCHITECTURE.md); context for a newcomer in [HANDOFF.md](HANDOFF.md).

Everything is plain ES modules with no dependencies and no build step: `index.html` loads
`src/main.js`, and the tests (`test/*.test.js`, Node's runner) import the same files. Modules
below `app/` are pure or nearly so — rules, generators and audits that run in Node — so most of
the game is tested without a browser.

## The layers

```
src/
├── main.js            the entry point: imports app/boot.js
├── app/               the running game — flow and glue (the only place that knows about everything)
├── engine/            rendering (3D WebGL and the 2D pixel renderer), camera, input, palettes, quality
├── world/             the 3D world's rules: physics, the session (hearts, enemies), zones, biomes, scenery
├── levels/            levels: the builder, the generator, the audits, the campaign, run levels
├── characters/        who's on screen: the avatar, hero sprites, monsters, NPCs and their faces, pets
├── games/             the 28 mini-games (one folder each) + kit/ (shared drawing, keys, 3D journeys) + screen.js
├── progression/       what a run and the profile are made of: spells, encounters, bosses, rating, story, profile
├── town/              Hearthmoor: the 3D square, your 2D home, the inn, the ranch, the tailor, decorations, the portal panel
├── cards/             Riftcards, the card game of the town square
├── ring/              the Monster Ring: befriended bosses, 3-on-3 turn-based fights, tamers, the ranch's herd
├── ui/                HTML panels and overlays: HUD, reward stage, options, test menu, touch pad
├── audio/             chiptune music and sound effects, made on the spot
└── tools/             the extra pages: avatar playground, Level Lab, texture gallery
```

Dependencies point downwards: `app/` uses everything; `games/`, `cards/`, `town/` use `engine/`,
`characters/`, `progression/`, `world/`, `levels/`; nothing imports `app/` except `main.js`.

### `app/` — the running game

| File | What it does |
|---|---|
| `boot.js` | **Shared state `G`** (what used to be main.js's top-level variables: the phase, the session, the current level, the run's seed / zones / class / spells, villagers …) and the page's **singletons** (renderer, profile, characters, battle screen, card table, dialog, panels, home, controls). Wires the event listeners and starts the loop. |
| `loop.js` | The frame loop: fixed 120 Hz steps of whatever phase is on (`play`, `hub`, `home`, `talk`, `battle`, `cards`, `portal` …), then one render. |
| `run.js` | A run: seed, zones (`planZones`), class and spells, the run worker that remakes levels, NPC planning, saving / resuming, `finishRun` (stars, decoration, pack, stray pet). |
| `level.js` | Playing a level: loading, its events (sounds, hearts), the gem → boss battle → reward stage, arcade checkpoints. |
| `travel.js` | Journeys between zones (the travel mini-game, 3D or 2D). |
| `quests.js` | NPCs on a run: talking, the talk camera, rifts, duels, delves, spells and trades as rewards. |
| `town.js` | The town square: entering it, the card battlers and the mayor, story beats, the portal, the way home. |
| `townCards.js` | Riftcards in town: faction choice, matches against battlers, the tier ladder, deck editing, the Rift King. |
| `inn.js` | The inn (challenge board, gold), the Ring (tamers, fights, experience, the ladder), befriending bosses at a stage's end, the ranch. |
| `tailor.js` | The tailor: gold out, patterns into the profile, the hero re-dressed. |
| `hero.js` | The character screen and its showroom, your pet. |
| `input.js` | The app's own keys (test menu, C for the character screen, Tab quick-cast …). |
| `testing.js` | The test menu's game launcher and its extra buttons. |
| `debug.js` | `window.game`: a handle for the console and automated checks. |

**Where state lives.** `G` (boot.js) holds what changes while you play; `profile` (progression/
profile.js, localStorage) holds what lasts between runs; each screen (`games/screen.js`,
`cards/cardScreen.js`, `town/home.js`) keeps its own state while it's open and resolves a promise
when it closes (`await battle.start(…)`, `await cardTable.start(…)`).

### `engine/`

`renderer.js` (WebGL: batched boxes, hidden-face removal, chunk culling, the avatar and the sky),
`camera.js`, `quality.js` (presets: normal / test; URL overrides), `pixel.js` (indexed-colour
software renderer for every 2D screen: shapes, sprites, a 3×5 font, `stipple` veils, `present`),
`palette.js` (256-colour ramps: UI, stage, hero, boss, minion, NPC, pet), `pixelFit.js`
(whole-number scaling of pixel canvases), `controls.js` / `input.js` (keyboard + gamepad),
`textures.js` / `materials.js` (procedural textures), `particles.js` / `effects.js`, `fpsMeter.js`,
`performance.js`, `config.js`, `math.js`, `mat4.js`, `state.js`.

### `world/`

`physics.js` (movement, collisions, dash / glide / double jump), `session.js` (hearts, enemies,
checkpoints — the rules above the physics), `enemies.js`, `gem.js`, `terrainParts.js` (bounce pads,
the glider), `arcade.js` (arcade cabinets on the route), `zones.js` (**the eight zones**: biome,
theme, capstone game, vehicles, names, which stages they may appear in; `planZones`), `biomes.js`,
`environment.js` (zone → biome → scenery for a level), `scenery.js`.

### `levels/`

`builder.js` (the fluent `createLevel()` API), `generator.js` (seeded, pattern-based levels, plus
`mulberry32` / `hashSeed` used everywhere), `audit.js` (completability: a bot in the real physics),
`funAudit.js`, `encounterAudit.js`, `campaignAudit.js`, `visualAudit.js`, `campaignSignatures.js`,
`runLevels.js` + `runWorker.js` (a run's remixed / regenerated levels, off the main thread),
`index.js` (the campaign and `TIERS`), and `campaign/` — **one file per level**: `01…06` are
hand-made (`export default createLevel(…)…build()`), `07…12` are generator recipes
(`export default { seed, difficulty, theme, tier }`).

### `characters/`

`avatar.js` (the jointed 3D hero and its animation), `character.js` (designs, the wardrobe, unlocks
and rarities), `characterScreen.js`, `heroSprite.js` (the design as 28×36 pixel art), `portrait.js`,
`trails.js`, `tailoring.js` (the tailor's patterns and trail colours: `dress(design, tailoring)`), `monsters.js`
(generated pixel monsters — bosses, minions, every Riftcard critter and every Ring monster),
`npcs.js` (generated NPCs: names, jobs, silly faces within an oddness budget, offers, quests; the mayor
and the inn's regulars; `makeGroup` for people seen together), `looks.js` (colours picked far apart for
everyone in view — skins incl. fantasy tones, clothes, boss hue triads), `npcFace.js`, `npcWorld.js`
(where an NPC stands; its 3D actor), `npcDialog.js` (the dialog box, portrait, trade screen),
`pets.js`.

### `games/` — the mini-games

```
games/
├── index.js           the registry: MODES (every game's descriptor), roles, capstones, playBoss()
├── screen.js          the battle screen: the loop (rules at 120 Hz, drawing ≤ 60 fps), input, palette
│                      steps, rules cards, spells, the 2D/3D switch for journeys
├── kit/               shared by the games
│   ├── common.js      hearts, clock, keys, events, simulate()
│   ├── humanize.js    human-like players for balancing (BALANCE_RULES)
│   ├── view.js        createView, the HUD, bursts, boss drawing, registered scenes
│   ├── art.js         parallax landscapes per zone, props
│   ├── overlay.js     the opponent (NPC or monster), the spell overlay
│   ├── keys.js        every game's keys, shown the same way
│   ├── travel3d.js    runs a journey's 3D scene with the renderer
│   └── scene3d.js     building blocks for 3D scenes
└── <id>/              one folder per game (runner, echo, quickdraw, … delve)
    ├── index.js       the descriptor: { ...rules, draw, heroAt, bossAt, keys, scene3d? }
    ├── rules.js       the rules (pure, deterministic, no DOM) and the bot that plays them
    ├── draw.js        the pixel-art scene (320×180, palette indices)
    └── scene3d.js     (journeys only) the same game drawn in 3D
```

### `progression/`

`spells.js` (classes, the spellbook, the battle runtime), `encounters.js` (which game goes where in
a run), `bosses.js` (generated bosses), `rating.js` (stars), `story.js` (story beats and what unlocks
when — pure), `profile.js` (everything saved between runs).

### `town/`

`hub.js` (the 3D square: fountain, columns, portal, four card tables with faction banners, benches, bunting, the paths to your home and to the inn),
`home.js` (the 2D house: living room, bedroom, game room; wardrobe, pets, decorations, the back door),
`place2d.js` (a walk-around 2D place: hero, camera, hotspots, panels — the inn and the ranch use it),
`inn.js` (the Tipsy Teapot: tavern, challenge board, tailor's corner, the Ring's yard), `ranch.js` (your
monsters roaming the pasture), `tailorPanel.js` (the pattern editor), `decor.js`, `embark.js` (the
portal's panel), `arcadeCabinet.js`.

### `cards/` — Riftcards

| File | |
|---|---|
| `catalog.js` | Rows, weather, abilities, the eight factions (one per zone) and their perks; every card. |
| `match.js` | The rules of a match (pure): rounds, passing, strength, abilities, perks; events for the screen. |
| `ai.js` | The computer player: `heuristicMove` (habits) and `searchMove` (look-ahead for the best). |
| `decks.js` | Deck rules, starter decks, `autoDeck`, packs by tier, the ladder, the battlers' decks. |
| `drawCards.js` | Cards, creatures on the table, icons, the generated critters — pixel art. |
| `cardScreen.js` | The table (400×225): input, animation, sound. |
| `deckPanel.js` | HTML panels: faction choice, the deck editor, packs, picks. |

### `ring/` — the Monster Ring

| File | |
|---|---|
| `monsters.js` | Types (one per zone) and the type chart, bodies, moves (a signature per mini-game), `monsterFromBoss`, stats, experience. |
| `battle.js` | The rules of a 3-on-3 fight (pure): commands, speed order, damage, statuses, cooldowns, events. |
| `ai.js` | The computer's commands (scores every move and target; sloppier at low tiers). |
| `tamers.js` | The Ring's tiers, tamers' squads, experience and gold for a fight. |
| `art.js` | Monsters on screen (each in its own palette ramp), type badges, status icons, `monsterCanvas`. |
| `screen.js` | The fight (400×225): command menus, targeting, the round played out with motion and sound. |
| `panels.js` | HTML: befriending a boss, choosing your squad, monster cards, results. |

### `ui/`, `audio/`, `tools/`

`ui/`: `hud.js`, `rewardScreen.js`, `unlockPanel.js`, `options.js`, `testMenu.js`, `touch.js`.
`audio/`: `compose.js` (pure composer), `synth.js` (the chip), `sfx.js` (effects), `music.js` (the
page's `sound`). `tools/`: `playground.js` (playground.html), `levelLab.js` (levels.html),
`textureGallery.js` (textures.html), `faceSheet.js` (faces.html: a contact sheet of NPC faces for review; `?people=N`, `?parts=1`), `castSheet3d.js`
(cast3d.html: the people drawn by the game's WebGL renderer beside their 2D portraits, with weirdness scores).

### Outside `src/`

`test/` (one file per area — see the README's table), `scripts/` (dev server, reports, previews,
campaign picking), `perf/` (performance pages), `assets/`, the HTML pages and CSS at the root.

## How to add…

### A mini-game

1. Make `src/games/<id>/` with:
   - `rules.js` — export the game: `{ id, name, roles: ['boss'] | ['checkpoint'] | both, controls,
     rules(boss) → [html lines], create(boss, { seed }) → game, bot(options) → policy }`. A game object
     has `press(code)`, `release(code)`, `step(dt)`, `drain()` (events), `result`
     (`'playing' | 'won' | 'lost'`), `hearts`, `timeLeft`, `bossHp`, `steps`, `stats`. Use
     `kit/common.js` for hearts, the clock and events. Keep it pure and deterministic (seeded).
   - `draw.js` — `draw(screen, view, game, o)` paints the 320×180 scene with palette indices
     (`engine/pixel.js`, `kit/art.js` for the backdrop).
   - `index.js` — `export default { ...rules, draw, heroAt, bossAt, keys }`.
2. Register it in `games/index.js` (import + `MODES`). Give it a music style in
   `audio/compose.js` if it needs its own.
3. Capstone of a zone? Set `capstone` in `world/zones.js`. Otherwise `progression/encounters.js`
   will start placing it by role.
4. Tests: the bots must win at every difficulty and idling must lose (see `test/zonegames.test.js`,
   `test/games.test.js`); `balance.test.js` checks human-like players; `spells.test.js` casts every
   spell in every game; `audio.test.js` checks its keys. Try it from the test menu (🧪).

### A level

- **Hand-made**: add `src/levels/campaign/NN-name.js` exporting `createLevel(…)…build()` and list it
  in `levels/index.js`. Run `npm test` — `levels.test.js` proves it's completable with the audit's
  bot, `fun.test.js` and `campaign.test.js` check it fits the ramp. Open it in the Level Lab
  (`levels.html`) to watch the bot.
- **Generated**: add a recipe file `{ seed, difficulty, theme, tier }` (pick seeds with
  `node scripts/pick-campaign.mjs`) and list it in `GENERATED_CAMPAIGN`.
- Runs don't use the campaign as-is: `levels/runLevels.js` remixes and regenerates per run.

### A zone

1. `world/zones.js`: add the zone (`id, name, biome, theme, stages, capstone, vehicles, names, about`).
2. `world/biomes.js` (sky, fog, light, materials, scenery kit) and `engine/palette.js`
   `STAGE_THEMES` + `games/kit/art.js` (the 2D backdrop) for its look.
3. Its capstone game (above), travel vehicles that make sense, and a Riftcards faction (below).
4. `visuals.test.js` checks its background is readable and distinct from the others.

### A Riftcard or a faction

- A **card**: one line in `cards/catalog.js` `LIST` — `C(id, name, faction, rarity, row, strength,
  ability?, musterGroup?)` for a creature, `S(id, name, rarity, effect, about)` for a special. Its
  picture is generated from its id. Packs and decks pick it up automatically.
- A **faction**: add it to `FACTIONS` (id = a zone id, a `perk`), give it eight cards (four commons
  for the starter deck, two rares, an epic, a legendary hero), implement the perk in `match.js`
  (`strengthOf` / `playCard` / `endRound`), add its colour to `FACTION_HUE` in `drawCards.js` and
  its starter weather to `FAVOURITE_WEATHER` in `decks.js`.
- Then run the card sims: `test/cards.test.js` keeps every starter faction between ~30 and 70 % wins
  against the others and checks the ladder.

### A Ring move or a monster body

`ring/monsters.js`: a signature move is keyed by the mini-game's id in `MOVES` (and listed in
`SIGNATURE_MODES`) — a boss fought in that game brings it; a body's move is keyed by the body. A move
is data (`target`, `power`, `cooldown`, `priority`, and effects like `burn`, `stun`, `shield`, `heal`,
`buff`, `debuff`, `taunt`); `battle.js` carries them out, `ai.js` scores them. `test/ring.test.js`
keeps every signature move between "useless" and "must-have".

### A 2D place (like the inn)

`town/place2d.js` does the walking, the camera, the hotspots and the panels: give it a width, a
palette, `hotspots(st)`, `draw(screen, cam, st)` and `use(hotspot)`. `town/inn.js` and
`town/ranch.js` are examples; the app opens it from a door (`app/town.js` `stepTown`) and gives it a
phase that `app/loop.js` treats as a 2D screen.

### A spell

`progression/spells.js`: add it to `SPELLS` (class, kind, numbers, icon) and to its class's book;
the runtime works through shared game state, so it works in every mini-game. `spells.test.js` casts
it in all of them.

### A decoration

`town/decor.js`: add it (zone, name, size, how to draw it); `home.js` places and draws decorations;
`decorReward` picks one at the end of a run.

### A sound

`audio/sfx.js`: add a recipe (a few chip voices); call `sound.fx('name')`. `audio.test.js` fails if
the game asks for a sound that doesn't exist.

## Testing while you work

```sh
npm run test:quick    # everything but the slow, bot-heavy files (~25 s)
npm test              # everything (~3.5 minutes)
npm run dev           # live-reloading server (index.html, playground.html, levels.html)
```

In the game, the test preset (`?quality=test`, or `npm run play:test`) shows the 🧪 test menu: any
level, any mini-game in any role and difficulty, Riftcards matches, tier / story shortcuts.
