# Handoff — context for the next person (or model) working on this game

This file is written for whoever picks this project up next, with no memory of earlier sessions.
It says what the game is, how it is built and tested, what the owner asked for and decided,
and what is open. Read it together with [STRUCTURE.md](STRUCTURE.md) (the code map and "how to
add…" recipes), [WORLD_DESIGN.md](WORLD_DESIGN.md) (design reasoning) and [README.md](README.md)
(features, controls, tests).

## What it is

A dependency-free browser game (plain ES modules, no build step, no npm dependencies): a 3D
box-built platformer with roguelite runs, and around it a ring of 2D pixel-art games and places.

- **Runs**: 12 levels in 4 stages; each stage is played in one of 8 zones (drawn per run). Every
  level ends in a boss mini-game (28 retro mini-games in all: bosses, arcade checkpoints, vehicle
  journeys between zones, quest games). NPCs on the route give quests (rift levels, sword duels,
  dungeon delves) that teach class spells (Warrior / Hunter / Sorcerer). Stars at the end.
- **Town (Hearthmoor)**: a 3D square with the portal, the mayor (Marigold, an eccentric old wizard),
  Riftcards battlers, a notice board; paths east to your **home** (2D: wardrobe, pets,
  decorations, arcade cabinet, card table, back door to the **ranch**) and west to the **inn**
  (2D: Bertha's challenge board for gold, Pippa the barmaid's tips, Tess the tailor, and the
  monster **Ring** in the yard).
- **Riftcards** (`src/cards/`): a round-based card battle (one card a turn or pass, best of three
  rounds, three rows, eight factions = the zones, rounds played in "worlds" with home-ground +1 and
  weather). Cards come from rift quests (pick 1 of 3), wins (pick 1 of 3), tier-ups and finished
  runs (packs). Six-tier ladder in the square; the Rift King is the story's finale.
- **The Ring** (`src/ring/`): bosses you beat can come home (one per stage, only if you beat the
  stage's last boss) and fight 3-on-3 turn-based battles (types from zones, signature moves from
  the mini-game you fought them in, levels and experience). Five-tier ladder at the inn.
- **Gold** buys cosmetics only (the tailor paints patterns on owned clothes, recolours trails).

## Running it

```sh
npm run dev            # normal play: opens http://localhost:8000/index.html (live reload)
npm run dev:test-hq    # testing mode, full quality: test menu (backquote ` or 🧪), FPS readouts
npm run play:test      # testing mode, "test" quality (cheap rendering for machines without a GPU)
npm run dev:test       # the same preset, opening the avatar playground page instead
python3 -m http.server 8000   # or any static server; then add ?quality=test | testhq | normal, ?dev=1
```

`?dev=1` turns the test menu on with any quality. Other pages: `playground.html` (avatar
sandbox), `levels.html` (Level Lab), `textures.html`, `faces.html` (NPC face contact sheet), `cast3d.html` (people in the real 3D renderer —
`?people=N`, `?seed=N`, `?parts=1`, `&big=1`, `&only=Name`, `&tones=1`; review 3D here, the faces sheet's 3D is a rough projection).

## Testing

```sh
npm run test:quick     # ~25 s: everything but the slow bot-heavy files (use while working)
npm test               # ~3–4 minutes: everything (259 tests at the time of writing, all passing)
```

Tests are Node's built-in runner (`test/*.test.js`). Most game logic is pure and tested headless:
level audits (a bot proves every level completable in the real physics), mini-game bots and
human-like balance bots, card and Ring simulations (faction and move balance), palettes, sprites,
the profile and story. When running the full suite from a tool with a time limit, run it in the
background and poll (`(npm test > /tmp/full.log 2>&1; echo EXIT $? >> /tmp/full.log) &`).

Visual checks used throughout: Playwright's Chromium headless with
`--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist --enable-unsafe-swiftshader`, a static
server, `window.game` (see `src/app/debug.js`: session, phase, profile, `testGame(mode)`,
`cards` / `ring` screens with `autoPlay(true)`, `enterInn()`, `enterRanch()`,
`noteBossBeaten()` / `befriendAtStageEnd()`), then screenshots. Tip: the test menu's extras buttons
(befriend bosses, +gold, tier ups, go to the inn, play a card match) set up most states.

## Working agreements with the owner

- Don't commit to git; the owner reviews changes. (A baseline commit exists.)
- At the end of each working session the owner wanted the game launched in a visible Chrome on the
  "playground" page in low-quality test mode (`node scripts/dev-server.mjs --open playground.html
  --quality test --port 8000`, plus a tab on `index.html?quality=test`).
- Be honest about design trade-offs; the owner explicitly invites pushback and revisions to
  their ideas, and prefers "trim the fat" to piling on systems.
- Keep documentation current: README (features/controls/tests), STRUCTURE.md (layout/recipes),
  WORLD_DESIGN.md (reasons), ARCHITECTURE.md (systems), this file (handoff).

## Decisions already made (and why)

- **More zones than stages** (8 vs 4) so every run differs; each zone has a capstone mini-game,
  a faction in Riftcards and a type in the Ring.
- **Quests are separate activities**, not edits to levels — levels are audited for fairness.
- **No mini-game twice in a run** (the encounter plan, and NPC quest games — duels, delves — too).
  Players learn the games across runs; within a run only the difficulty rises (by position).
- **Bosses → monsters (Ring); rift critters → cards (Riftcards).** Two collections, two sources,
  so the side games don't compete for the same thing. One boss per stage, only after beating the
  stage's capstone.
- **Gold never buys cards, monsters or power** — only the tailor. The board's challenges are won
  once each and refresh after a run, so it can't be farmed.
- **Riftcards rules from simulation**: no new cards between rounds; at most 2 "sneak" (spy) cards
  per deck; revive cards are weak creatures; worlds per round. Starter factions win 40–55 % against
  each other.
- **Faces**: clown noses, pointy ears, cyclops/spiral eyes, red lips, fangs and warts were removed
  for reading as unsettling; an oddness budget caps quirks per face; key characters are hand-made.
- **Looks** (`characters/looks.js`): everyone in view gets colours picked far apart (OKLab) —
  skins light to dark plus ~1 in 6 fantasy tones (green/blue/purple, mid-dark, never
  lavender-light or greyish), clothes, hair, hats; contrast within a person; off the backdrop. The
  hero and hand-made regulars are context (not copied, don't steer). Bosses: a hue triad per stage,
  off the zone's backdrop. Review with `node scripts/cast-sheet.mjs out.png 1 2 3`. No mohawk under a
  hat (read as a headdress). Bertha: 3× scale behind the bar with a small foaming stein (`toast` pose).
- **Groups differ in shape too** (`lookDifference`, `makeGroup`): build, hat shape, back item,
  hair, top — best of 32 outfits per person; no shared build / hat shape / back item / name / special
  item. Context = only who's in view (yard: Rocco + hero). Clothes compared by hue (`clothDistance`).
- **Weirdness budget** (`npcs.js` `weirdness`): face quirks weighted for 3D + fantasy skin 3; fantasy
  folk have plain, friendly faces and outfits that suit their tone (teal was dropped). Review people
  in `cast3d.html` (the real renderer), not only the faces sheet. Regulars are human; Rocco winks.
- **The square has four card tables; any three wins rise a tier** (pace unchanged — battlers only
  arrive between runs). A battler's card prize is once per visit: rematches are for fun, so the
  rifts stay the place cards come from.
- **2D overalls**: the shirt is the top colour, as in 3D (it used to be the accent colour in 2D).
- **Watch for DOM-global shadowing** after moving code between modules: `screen`, `status`,
  `name`, `top`… resolve to `window` properties when an import is missing, with no error. That
  bug once made the character select show Pip instead of the picked hero (app/loop.js and
  app/input.js had lost their `screen` import). Grep for bare uses when splitting files.
- **Pixel screens** are indexed-colour surfaces (`src/engine/pixel.js`) with per-screen palettes
  (256 entries): many things on one screen need their own ramp ranges — see the palette notes in
  `ring/art.js`, `cards/drawCards.js`, `town/inn.js`, `town/ranch.js`.

## Open questions the owner hasn't answered

1. Should the Rift King stay a Riftcards finale or become the Ring's final opponent?
2. Releasing / renaming monsters at the ranch (rename exists in the profile, no button yet).
3. Tailored patterns on NPCs?

## Ideas not built (judged worthwhile)

- A favourite ranch monster following you in town like a pet (3D parts would be needed).
- Ring: a "switch" command with a 4th reserve monster; held items.
- The inn: a nightly tavern tournament (three Ring or card fights in a row for a decoration).
- Riftcards: a per-faction quest line of story cards.
