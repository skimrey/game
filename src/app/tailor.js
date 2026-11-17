/**
 * The tailor at the inn — the app's side of town/tailorPanel.js: gold out, the tailor's work
 * into the profile (characters/tailoring.js), and your hero re-dressed in it.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { G, avatar, dressed, profile, tailorPanel } from './boot.js';
import { sound } from '../audio/music.js';

export function openTailor({ onDone = () => {} } = {}) {
  tailorPanel.open({
    design: G.currentDesign, tailoring: profile.tailoring(), gold: profile.gold(), tailorName: 'Tess',
    onSew: ({ key, value, price }) => {
      if (price && !profile.spendGold(price)) return;
      profile.setTailoring(key, value);
      G.currentDesign = dressed(G.currentDesign);
      avatar.setCharacter(G.currentDesign);
      sound.jingle(price ? 'card' : 'close');
    },
    onClose: () => onDone(),
  });
}
