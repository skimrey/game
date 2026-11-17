/**
 * Riftcards panels (HTML over the game): choosing your first faction, the deck editor (one
 * deck per faction), opening a pack, and "pick one of three" rewards.
 *
 *   const panels = createDeckPanel();
 *   panels.chooseFaction({ title, text, onPick(faction), onCancel })
 *   panels.edit({ collection, decks, faction, design, onDone({ faction, deck }) })
 *   panels.pack({ title, text, cards, extra, onDone })
 *   panels.pick({ title, text, cards, onPick(id) })
 */
import { CARDS, FACTIONS, FACTION_IDS, ROW_INFO, ABILITIES, ABILITY_NAMES, cardText } from './catalog.js';
import { DECK_RULES, deckProblems, autoDeck, starterDeck } from './decks.js';
import { cardCanvas } from './drawCards.js';
import { heroBaseColors } from '../engine/palette.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};
/** A card's words for a tooltip / caption. */
export function cardTip(id) {
  const c = CARDS[id];
  if (c.kind === 'special') return `${c.name} — ${c.rarity} special\n${c.about}`;
  const where = c.ability === 'agile' ? 'front or back' : `${ROW_INFO[c.row].name.toLowerCase()} row`;
  return `${c.name} — ${c.rarity}, strength ${c.str}, ${where}\n${c.ability ? ABILITIES[c.ability] : 'No ability — just strong.'}`;
}
const short = id => { const c = CARDS[id]; return c.kind === 'special' ? 'special' : `${c.str} · ${c.ability === 'agile' ? 'front/back' : ROW_INFO[c.row].name.toLowerCase()}${c.ability ? ` · ${ABILITY_NAMES[c.ability]}` : ''}`; };
/** The face of a faction (its legendary, for the chooser). */
const faceOf = f => Object.keys(CARDS).find(id => CARDS[id].faction === f && CARDS[id].rarity === 'legendary');
const order = (a, b) => (CARDS[a].kind === 'special') - (CARDS[b].kind === 'special') || ['front', 'back', 'sky'].indexOf(CARDS[a].row) - ['front', 'back', 'sky'].indexOf(CARDS[b].row) || (CARDS[a].str ?? 0) - (CARDS[b].str ?? 0) || a.localeCompare(b);

export function createDeckPanel({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'deck-panel', role: 'dialog', 'aria-label': 'Riftcards' });
  root.hidden = true;
  parent.append(root);
  let onKey = null;
  const close = () => { root.hidden = true; root.replaceChildren(); document.body.classList.remove('in-deck'); if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; };
  const open = (children, esc) => {
    root.replaceChildren(...children);
    root.hidden = false;
    document.body.classList.add('in-deck');
    if (onKey) window.removeEventListener('keydown', onKey, true);
    onKey = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); esc(); } };
    window.addEventListener('keydown', onKey, true);
    (root.querySelector('button.primary') || root.querySelector('button'))?.focus();
  };

  /** Your first faction: eight tiles, one per zone. */
  function chooseFaction({ title = 'Choose your faction', text = '', onPick, onCancel = null }) {
    const tiles = FACTION_IDS.map(f => {
      const F = FACTIONS[f];
      return el('button', { type: 'button', class: `faction-tile f-${f}`, title: `${F.name} — ${F.about}\nPerk: ${F.perkText}`, onclick: () => { close(); onPick(f); } }, [
        cardCanvas(faceOf(f), { scale: 1.5 }),
        el('strong', { text: F.name }),
        el('span', { class: 'faction-zone', text: F.zone }),
        el('span', { class: 'faction-about', text: F.about }),
        el('span', { class: 'faction-perk', text: `Perk: ${F.perkText}` }),
      ]);
    });
    open([el('h2', { text: title }), text ? el('p', { class: 'home-text', text }) : null, el('div', { class: 'faction-grid' }, tiles),
      onCancel ? el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', text: 'Not now', onclick: () => { close(); onCancel(); } })]) : null].filter(Boolean),
    () => { close(); onCancel?.(); });
  }

  /** The deck editor: one deck per faction you have cards for. */
  function edit({ collection, decks = {}, faction = null, design = null, onDone }) {
    const hero = design ? heroBaseColors(design) : null;
    const owned = f => Object.keys(collection).filter(id => CARDS[id]?.faction === f && collection[id] > 0).length;
    const tabs = FACTION_IDS.filter(f => owned(f) > 0);
    let f = faction && tabs.includes(faction) ? faction : tabs[0] || 'meadow';
    const working = Object.fromEntries(tabs.map(x => [x, [...(decks[x] && !deckProblems(decks[x], collection).length ? decks[x] : autoDeck(collection, x))]]));
    const finish = () => {
      const deck = working[f] && !deckProblems(working[f], collection).length ? working[f] : autoDeck(collection, f);
      close();
      onDone({ faction: f, deck, decks: working });
    };
    const render = () => {
      const current = working[f] || [];
      const problems = deckProblems(current, collection);
      const count = id => current.filter(x => x === id).length;
      const canAdd = id => count(id) < Math.min(collection[id] || 0, DECK_RULES.copies[CARDS[id].rarity]) && current.length < DECK_RULES.max
        && !(CARDS[id].ability === 'spy' && current.filter(x => CARDS[x].ability === 'spy').length >= DECK_RULES.spies);
      const creatures = current.filter(id => CARDS[id].kind === 'creature');
      const strength = creatures.reduce((a, id) => a + (CARDS[id].ability === 'spy' ? 0 : CARDS[id].str), 0);
      // the deck, one tile per different card (×n)
      const unique = [...new Set(current)].sort(order);
      const deckRow = el('div', { class: 'deck-cards' }, unique.map(id => el('button', { type: 'button', class: `deck-card r-${CARDS[id].rarity}`, title: `${cardTip(id)}\n(click to take one out)`, onclick: () => { current.splice(current.lastIndexOf(id), 1); render(); } }, [
        cardCanvas(id, { scale: 1, hero, count: count(id) }),
      ])));
      const pool = Object.keys(collection).filter(id => CARDS[id] && collection[id] > 0 && (CARDS[id].faction === f || CARDS[id].faction === 'neutral')).sort(order);
      const coll = el('div', { class: 'deck-collection' }, pool.map(id => {
        const ok = canAdd(id);
        return el('button', { type: 'button', class: `deck-card r-${CARDS[id].rarity}${ok ? '' : ' full'}`, title: `${cardTip(id)}\nYou have ${collection[id]} · in this deck ${count(id)}${ok ? ' (click to add)' : ''}`, onclick: () => { if (ok) { current.push(id); render(); } } }, [
          cardCanvas(id, { scale: 1, hero }),
          el('span', { class: 'deck-count', text: `${count(id)} / ${Math.min(collection[id], DECK_RULES.copies[CARDS[id].rarity])} · ${short(id)}` }),
        ]);
      }));
      const F = FACTIONS[f];
      open([
        el('h2', { text: 'Riftcards — your decks' }),
        el('div', { class: 'faction-tabs' }, tabs.map(x => el('button', { type: 'button', class: `faction-tab${x === f ? ' on' : ''}`, text: `${FACTIONS[x].name} (${owned(x)})`, onclick: () => { f = x; render(); } }))),
        el('p', { class: 'home-text', text: `${F.name} of ${F.zone}: ${F.about} Perk: ${F.perkText}` }),
        el('h3', { text: `This deck — ${current.length} cards · ${creatures.length} creatures · strength ${strength}` }),
        el('p', { class: `deck-status ${problems.length ? 'bad' : 'ok'}`, text: problems.length ? `Not ready: ${problems.join('; ')}.` : `Ready to play. Click a card to take it out, or one below to put it in. (${DECK_RULES.min}–${DECK_RULES.max} cards, ${DECK_RULES.minCreatures}+ creatures, ${DECK_RULES.spies} spies at most.)` }),
        deckRow,
        el('h3', { text: `Your ${F.name} and neutral cards` }),
        coll,
        el('div', { class: 'npc-buttons' }, [
          el('button', { type: 'button', text: '✨ Build the best deck for me', onclick: () => { working[f] = autoDeck(collection, f); render(); } }),
          el('button', { type: 'button', class: 'primary', text: problems.length ? `Play ${F.name} (best deck) ▸` : `Play ${F.name} ▸`, onclick: finish }),
        ]),
      ], finish);
    };
    render();
  }

  function pack({ title, text, cards, extra = null, onDone }) {
    const row = el('div', { class: 'deck-cards pack' }, cards.map((id, i) => el('div', { class: `deck-card reveal r-${CARDS[id].rarity}`, style: `animation-delay:${i * 0.25}s`, title: cardTip(id) }, [cardCanvas(id, { scale: 2 }), el('strong', { text: CARDS[id].name }), el('span', { class: 'deck-count', text: `${CARDS[id].rarity} · ${short(id)}` })])));
    open([el('h2', { text: title }), el('p', { class: 'home-text', text }), row, extra, el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', class: 'primary', text: 'Nice! ▸', onclick: () => { close(); onDone?.(); } })])].filter(Boolean), () => { close(); onDone?.(); });
  }

  function pick({ title, text, cards, extra = null, onPick }) {
    const row = el('div', { class: 'deck-cards pack' }, cards.map((id, i) => el('button', { type: 'button', class: `deck-card pickable reveal r-${CARDS[id].rarity}`, style: `animation-delay:${i * 0.2}s`, title: cardTip(id), onclick: () => { close(); onPick(id); } }, [
      cardCanvas(id, { scale: 2 }), el('strong', { text: CARDS[id].name }),
      el('span', { class: 'deck-count', text: `${CARDS[id].rarity} · ${CARDS[id].faction === 'neutral' ? 'neutral' : FACTIONS[CARDS[id].faction].name} · ${short(id)}` }),
      el('span', { class: 'deck-words', text: cardText(id) }),
    ])));
    open([el('h2', { text: title }), el('p', { class: 'home-text', text }), row, extra].filter(Boolean), () => { close(); onPick(cards[0]); });
  }

  return { chooseFaction, edit, pack, pick, close, get open() { return !root.hidden; } };
}

export { starterDeck };
