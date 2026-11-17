/**
 * window.game — a handle on the running game for the console and for automated checks
 * (scripts/*.py, the perf tools): the session, the battle screen, test hooks (testGame …).
 *
 * Part of the app (src/app/); see STRUCTURE.md.
 */
import { battle, campaign, cardTable, controls, G, profile, reward, ringScreen, runSources } from './boot.js';
import { befriendAtStageEnd, enterInn, enterRanch, noteBossBeaten } from './inn.js';
import { setPet } from './hero.js';
import { activeLevel, bossForCurrentLevel, loadLevel } from './level.js';
import { talkTo } from './quests.js';
import { finishRun, resumeRun, saveRun } from './run.js';
import { playTestGame } from './testing.js';
import { enterTown } from './town.js';
import { sound } from '../audio/music.js';
import { rolesOf } from '../games/index.js';
export function exposeForDebugging() {
  window.game = {
    get session() { return G.session; }, get phase() { return G.phase; }, battle, reward, get level() { return activeLevel(); }, get render() { return G.renderer; }, loadLevel, controls,
    testGame: (mode, level3 = 1, role = rolesOf(mode)[0]) => playTestGame(mode, level3, role),
    get npc() { return G.npcActor; }, get pet() { return G.petFollower; }, setPet, enterTown, get inTown() { return G.inTown; }, get villagers() { return G.villagers; }, cards: cardTable, sound, resumeRun, saveRun, profile, finishRun, get rift() { return G.rift; }, talk: () => G.npcActor && talkTo(G.npcActor),
    get run() { return { seed: G.runSeed, zones: [...G.runZones], heroClass: G.runClass, spells: [...G.runSpells], sources: [...runSources], levels: campaign.map(l => l.name) }; },
    boss: () => bossForCurrentLevel(),
    get arcade() { return G.arcade; },
    get encounters() { return G.encounterPlan; },
    ring: ringScreen, enterInn, enterRanch, noteBossBeaten, befriendAtStageEnd,
  };
}
