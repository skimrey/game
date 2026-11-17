/**
 * The app's own keys (the 3D game's movement keys are in engine/controls.js; the mini-games,
 * cards, home and dialogs take their keys while they're open): E talks, R restarts, C / Esc
 * opens the character screen, in town and in a level.
 *
 * Part of the app (src/app/); see STRUCTURE.md.
 */
import { avatar, G, screen } from './boot.js';
import { openCharacterScreen } from './hero.js';
import { say } from './level.js';
import { talkTo } from './quests.js';
import { restart } from './run.js';
import { nearBoard, showBoard } from './town.js';
import { isTypingTarget } from '../engine/controls.js';
export function listenForKeys() {
  window.addEventListener('keydown', event => {
    if (!screen.isOpen && G.phase === 'hub' && !event.defaultPrevented && !event.repeat && !isTypingTarget(event.target)) {
      const p = G.session.player;
      const near = G.villagers.find(v => v.near(p));
      if (event.code === 'KeyE' && near) { event.preventDefault(); talkTo(near); return; }
      if (event.code === 'KeyE' && nearBoard(p)) { event.preventDefault(); showBoard(); return; }
      if (event.code === 'KeyC' || event.code === 'Escape') { event.preventDefault(); openCharacterScreen(); }
      return;
    }
    if (screen.isOpen || G.phase !== 'play' || event.defaultPrevented || event.repeat || isTypingTarget(event.target)) return;
    if (event.code === 'KeyE' && !G.rift && G.npcActor?.near(G.session.player)) { event.preventDefault(); talkTo(G.npcActor); return; }
    if (event.code === 'KeyR' && G.rift) { G.session.reset(); avatar.reset(G.session.player); say('Back to the start of the rift.'); return; }
    if (event.code === 'KeyR') restart();
    if (event.code === 'KeyC' || event.code === 'Escape') { event.preventDefault(); openCharacterScreen(); }
  });
}
