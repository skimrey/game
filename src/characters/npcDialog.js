/**
 * The NPC dialog box: the NPC's big pixel-art portrait (it blinks, its googly eyes wander,
 * its mouth flaps while the words type out), their name and job, what they say, and the
 * choices — talk, quest, trade, pick a spell.
 *
 *   const dialog = createNpcDialog();
 *   dialog.say(npc, text, [[label, action, primary?], …]);
 *   dialog.spells(npc, text, spellIds, onPick)         // spell cards to choose from
 *   dialog.trade(npc, { theirs, mine: [items], onSwap, onBack })
 *   dialog.close()
 *
 * Plain HTML over the game (like the unlock panel); the portrait is a 64×64 canvas scaled
 * up with crisp pixels. Keyboard: Tab / Enter / Space on the buttons, Esc closes.
 */
import { sound } from '../audio/music.js';
import { paintNpcPortrait, portraitPalette, PORTRAIT_SIZE } from './npcFace.js';
import { paintSpellIcon, SPELLS, CLASSES } from '../progression/spells.js';
import { RARITY_INFO } from './character.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

export function createNpcDialog({ parent = document.querySelector('main') || document.body, paintItem = null } = {}) {
  const root = el('section', { class: 'npc-dialog', role: 'dialog', 'aria-live': 'polite', hidden: true });
  const canvas = el('canvas', { class: 'npc-portrait', width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, 'aria-hidden': 'true' });
  const nameEl = el('h2', { class: 'npc-name' });
  const jobEl = el('p', { class: 'npc-job' });
  const textEl = el('p', { class: 'npc-text' });
  const extra = el('div', { class: 'npc-extra' });
  const buttons = el('div', { class: 'npc-buttons' });
  root.append(el('div', { class: 'npc-head' }, [canvas, el('div', {}, [nameEl, jobEl])]), textEl, extra, buttons);
  parent.append(root);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(PORTRAIT_SIZE, PORTRAIT_SIZE);
  let state = null;
  let onEscape = null;

  function paint(now) {
    if (!state) return;
    state.raf = requestAnimationFrame(paint);
    const t = (now - state.start) / 1000;
    // type the text out, a few letters a frame; the mouth flaps while it does
    const typing = state.shown < state.text.length;
    if (typing) {
      const was = Math.floor(state.shown);
      state.shown = Math.min(state.text.length, Math.max(state.shown, (now - state.typed) / 1000 * 60));
      textEl.textContent = state.text.slice(0, Math.floor(state.shown));
      // their voice: a babble blip every few letters (pitch from the letter), in their own voice
      const at = Math.floor(state.shown);
      if (Math.floor(at / 3) !== Math.floor(was / 3) && /[a-z]/i.test(state.text[at - 1] || '')) sound.talk(state.npc.seed, state.text.charCodeAt(at - 1));
    }
    const blink = (t % 3.4) > 3.25;
    const talk = typing ? (Math.floor(t * 10) % 2 ? 1 : 0.3) : 0;
    const key = `${blink}|${talk}|${Math.floor(t * 8)}`;
    if (key === state.key) return;
    state.key = key;
    const s = paintNpcPortrait(state.npc, { blink, talk, t });
    const pal = state.pal;
    for (let i = 0; i < s.buf.length; i++) {
      const [r, g, b] = pal[s.buf[i]] || pal[16];
      image.data[i * 4] = r; image.data[i * 4 + 1] = g; image.data[i * 4 + 2] = b; image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  function open(npc, text) {
    if (!state || state.npc !== npc) {
      if (state) cancelAnimationFrame(state.raf);
      state = { npc, pal: portraitPalette(npc), start: performance.now(), raf: 0, key: null, text: '', shown: 0 };
      state.raf = requestAnimationFrame(paint);
    }
    state.text = text; state.shown = 0; state.typed = performance.now();
    textEl.textContent = '';
    nameEl.textContent = npc.name;
    jobEl.textContent = npc.job;
    extra.replaceChildren();
    buttons.replaceChildren();
    root.hidden = false;
    document.body.classList.add('in-dialog');
  }

  function setButtons(list) {
    buttons.replaceChildren();
    for (const [label, action, primary, disabled] of list) {
      const b = el('button', { type: 'button', class: primary ? 'primary' : '', text: label, onclick: () => action(b) });
      if (disabled) b.disabled = true;
      buttons.append(b);
    }
    (buttons.querySelector('button.primary:not(:disabled)') || buttons.querySelector('button:not(:disabled)'))?.focus();
  }

  window.addEventListener('keydown', e => {
    if (!state || root.hidden) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); }
    else if ((e.code === 'Space' || e.code === 'Enter') && state.shown < state.text.length) { e.preventDefault(); state.shown = state.text.length; textEl.textContent = state.text; }
  }, true);

  return {
    get open() { return !!state && !root.hidden; },
    /** Say something, with buttons [[label, action, primary?, disabled?]]; Esc runs `escape`. */
    say(npc, text, list, { escape = null } = {}) {
      open(npc, text);
      setButtons(list);
      onEscape = escape || list.at(-1)?.[1] || null;
    },
    /** Spell cards: pick one (or none, if the book is empty). */
    spells(npc, text, ids, onPick, cls) {
      open(npc, text);
      const row = el('div', { class: 'npc-cards' });
      for (const id of ids) {
        const sp = SPELLS[id];
        const card = el('button', { type: 'button', class: 'npc-card spell-card', onclick: () => onPick(id) }, [
          paintSpellIcon(el('canvas'), id, { scale: 3 }),
          el('strong', { text: sp.name }),
          el('span', { class: 'npc-card-kind', text: sp.kind === 'passive' ? 'Passive — always on' : 'Active — press its key in a mini-game' }),
          el('span', { text: sp.what }),
          el('em', { class: 'npc-card-when', text: `Tip: ${sp.when}` }),
        ]);
        row.append(card);
      }
      if (!ids.length) row.append(el('p', { class: 'npc-note', text: `You already know every ${CLASSES[cls]?.name || ''} spell there is!` }));
      extra.append(row);
      setButtons(ids.length ? [] : [['Thanks anyway', () => onPick(null), true]]);
      row.querySelector('button')?.focus();
      onEscape = null;
    },
    /**
     * The trade screen: their item on the left, yours (same rarity) to choose from.
     *   theirs  unlockable; mine  [unlockable]; design  for item art; onSwap(item); onBack()
     */
    trade(npc, { theirs, mine, design, onSwap, onBack, text }) {
      open(npc, text);
      const rarity = RARITY_INFO[theirs.rarity];
      const art = item => {
        const c = el('canvas', { class: 'npc-item-art', width: 64, height: 64 });
        if (paintItem) paintItem(c, design, item);
        return c;
      };
      const theirsCard = el('div', { class: 'npc-card trade-theirs', style: `border-color:${rarity.color}` }, [art(theirs), el('strong', { text: theirs.name }), el('span', { class: 'npc-rarity', style: `color:${rarity.color}`, text: rarity.label }), el('span', { text: theirs.about })]);
      const list = el('div', { class: 'npc-cards mine' });
      for (const item of mine) {
        list.append(el('button', { type: 'button', class: 'npc-card', title: `Give your ${item.name}`, onclick: () => onSwap(item) }, [art(item), el('strong', { text: item.name }), el('span', { class: 'npc-rarity', style: `color:${rarity.color}`, text: item.slot === theirs.slot ? `${rarity.label} · same slot!` : rarity.label })]));
      }
      if (!mine.length) list.append(el('p', { class: 'npc-note', text: `You have nothing ${rarity.label.toLowerCase()} to trade yet — win some ${rarity.label.toLowerCase()} clothing from bosses and come back.` }));
      extra.append(el('div', { class: 'npc-trade' }, [el('div', {}, [el('p', { class: 'npc-note', text: 'They offer' }), theirsCard]), el('span', { class: 'npc-swap', text: '⇄' }), el('div', {}, [el('p', { class: 'npc-note', text: 'You give (same rarity)' }), list])]));
      setButtons([['Back', () => onBack(), !mine.length]]);
      list.querySelector('button')?.focus();
      onEscape = onBack;
    },
    close() {
      if (state) cancelAnimationFrame(state.raf);
      state = null;
      onEscape = null;
      root.hidden = true;
      document.body.classList.remove('in-dialog');
    },
  };
}
