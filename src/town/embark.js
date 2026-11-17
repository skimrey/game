/**
 * The portal's panel: choose your class for the run (progression/spells.js) and see where the portal
 * leads this time (the run's zones — world/zones.js). Plain HTML over the town square.
 *
 *   const embark = createEmbarkPanel();
 *   embark.show({ zones: ['lagoon', …], current: 'warrior', onGo(cls), onCancel() });
 */
import { CLASSES, CLASS_IDS, SPELLBOOK, SPELLS, paintSpellIcon } from '../progression/spells.js';
import { ZONES } from '../world/zones.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

export function createEmbarkPanel({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'embark-panel', role: 'dialog', 'aria-label': 'Set off on a run', hidden: true });
  parent.append(root);
  let onEscape = null;
  root.addEventListener('keydown', e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); } });
  return {
    get open() { return !root.hidden; },
    /**
     * locked: the gentle first run (no class yet) · saved: a run in progress ({ label }) with
     * onContinue / onAbandon · king: the Rift King waits (onKing).
     */
    show({ zones, current = 'warrior', runNumber = 1, onGo, onCancel, locked = false, saved = null, onContinue = () => {}, onAbandon = () => {}, king = false, onKing = () => {} }) {
      let chosen = current;
      const journey = el('div', { class: 'embark-journey' });
      zones.forEach((z, i) => { if (i) journey.append(el('span', { class: 'embark-arrow', text: '→' })); journey.append(el('span', { class: 'embark-zone', text: ZONES[z].name, title: ZONES[z].about })); });
      const cards = CLASS_IDS.map(id => {
        const c = CLASSES[id];
        const book = el('div', { class: 'embark-book' }, SPELLBOOK[id].map(sid => { const cv = paintSpellIcon(el('canvas'), sid, { scale: 2 }); cv.title = `${SPELLS[sid].name}${sid === c.signature ? ' (you start with this one)' : ''}${SPELLS[sid].kind === 'passive' ? ' — always on' : ''}\n${SPELLS[sid].what}\nTip: ${SPELLS[sid].when}`; if (sid === c.signature) cv.classList.add('signature'); return cv; }));
        const card = el('button', { type: 'button', class: `embark-class${id === chosen ? ' chosen' : ''}`, style: `--class-color:${c.color}`, onclick: () => { chosen = id; cards.forEach(x => x.classList.toggle('chosen', x === card)); go.textContent = `Step through as a ${c.name} ▸`; } },
          [el('strong', { text: c.name }), el('em', { text: c.motto }), el('span', { text: c.about }), el('span', { text: `Starts with ${SPELLS[c.signature].name}; NPCs teach the rest:` }), book, el('span', { class: 'embark-kit', text: `In a dungeon delve: ${c.kit}` })]);
        return card;
      });
      const go = el('button', { type: 'button', class: 'primary', text: `Step through as a ${CLASSES[chosen].name} ▸`, onclick: () => { root.hidden = true; onGo(chosen); } });
      const back = el('button', { type: 'button', text: 'Not yet', onclick: () => { root.hidden = true; onCancel(); } });
      onEscape = () => { root.hidden = true; onCancel(); };
      if (saved) {                                   // a run in progress: carry on (or give it up)
        const cont = el('button', { type: 'button', class: 'primary', text: `Continue your run ▸`, onclick: () => { root.hidden = true; onContinue(); } });
        root.replaceChildren(
          el('p', { class: 'embark-kicker', text: 'The portal · a run in progress' }),
          el('h2', { text: 'Your run is waiting' }),
          el('p', { class: 'home-text', text: `${saved.label}. Step back through to carry on from the start of that level — your spells, results and quests are as you left them.` }),
          el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', text: 'Not yet', onclick: () => { root.hidden = true; onCancel(); } }), el('button', { type: 'button', text: 'Give it up (start fresh)', onclick: () => { onAbandon(); } }), cont]),
        );
        root.hidden = false;
        cont.focus();
        return;
      }
      if (locked) {                                  // the gentle first run: no class yet
        const goLight = el('button', { type: 'button', class: 'primary', text: 'Step through ▸', onclick: () => { root.hidden = true; onGo(null); } });
        root.replaceChildren(
          el('p', { class: 'embark-kicker', text: `The portal · run ${runNumber}` }),
          el('h2', { text: 'Where the portal leads this time' }),
          journey,
          el('p', { class: 'home-text', text: 'Your first trip through: travel light. Run and jump through the levels, grab the gems, beat the bosses and help the folk you meet with their rifts (they share the Riftcards they find). When you come back, you’ll choose a class — Warrior, Hunter or Sorcerer — and learn spells.' }),
          el('div', { class: 'npc-buttons' }, [back, goLight]),
        );
        root.hidden = false;
        goLight.focus();
        return;
      }
      const kingButton = king ? el('button', { type: 'button', class: 'king', text: '👑 Challenge the Rift King', onclick: () => { root.hidden = true; onKing(); } }) : null;
      root.replaceChildren(
        el('p', { class: 'embark-kicker', text: `The portal · run ${runNumber}` }),
        el('h2', { text: 'Where the portal leads this time' }),
        journey,
        el('p', { class: 'home-text', text: 'Choose your class. Spells are your edge in the mini-games (bosses, checkpoints, journeys): press 1–5 during a game to cast one (or Tab for the next one ready) — each works once per game (in a dungeon delve they recharge) — or keep a passive working all the time. You start with one; in every stage an NPC teaches you another (you pick one of two). Your class also sets how you fight in a dungeon delve. Hover an icon to read what it does and when to use it.' }),
        el('div', { class: 'embark-classes' }, cards),
        el('div', { class: 'npc-buttons' }, [back, kingButton, go]),
      );
      root.hidden = false;
      go.focus();
    },
    hide() { root.hidden = true; },
  };
}
