/**
 * The arcade cabinet at home: replay any mini-game you've met on a run, at easy, medium or
 * hard — for fun and for your best time (no rewards; profile.arcade keeps the records).
 * Games you haven't met yet are shown as ??? (meet them out on a run).
 *
 *   const arcade = createArcadePanel();
 *   arcade.open({ games: [{ id, name, role, met, record }], onPlay(id, level3, role), onClose })
 */
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};
const ICON = { boss: '👾', checkpoint: '🕹', travel: '🚂', quest: '🗡' };

export function createArcadePanel({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'deck-panel arcade-panel', role: 'dialog', 'aria-label': 'Arcade cabinet' });
  root.hidden = true;
  parent.append(root);
  let onKey = null, onClose = () => {};
  function close() {
    root.hidden = true;
    if (onKey) window.removeEventListener('keydown', onKey, true);
    onKey = null;
    document.body.classList.remove('in-deck');
    const cb = onClose; onClose = () => {}; cb();
  }
  function open({ games, onPlay, onClose: done = () => {} }) {
    onClose = done;
    const met = games.filter(g => g.met).length;
    const list = el('div', { class: 'arcade-list' }, games.map(g => {
      const r = g.record;
      const rec = r ? `${r.wins}/${r.plays} won${r.best ? ` · best ${r.best.toFixed(1)} s` : ''}` : 'not played here yet';
      return el('div', { class: `arcade-row${g.met ? '' : ' locked'}` }, [
        el('span', { class: 'arcade-name', text: g.met ? `${ICON[g.role] || '🎮'} ${g.name}` : '🔒 ???' }),
        el('span', { class: 'arcade-rec', text: g.met ? rec : 'meet it on a run' }),
        ...['Easy', 'Medium', 'Hard'].map((label, k) => el('button', { type: 'button', text: label[0], title: `${g.name} — ${label.toLowerCase()}`, disabled: g.met ? null : '', onclick: () => { onClose = () => {}; root.hidden = true; if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; document.body.classList.remove('in-deck'); onPlay(g.id, k, g.role); } })),
      ]);
    }));
    root.replaceChildren(
      el('h2', { text: '🕹 Arcade cabinet' }),
      el('p', { class: 'home-text', text: `Every mini-game you've met on a run — ${met} of ${games.length} so far. Play any of them, easy, medium or hard, and beat your best time. (Just for fun: no rewards, no hearts lost.)` }),
      list,
      el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', class: 'primary', text: 'Back', onclick: () => close() })]),
    );
    root.hidden = false;
    document.body.classList.add('in-deck');
    onKey = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    root.querySelector('button:not([disabled])')?.focus();
  }
  return { open, close, get open_() { return !root.hidden; } };
}
