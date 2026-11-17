/**
 * The Ring's HTML panels: befriending a boss at the end of a stage, choosing your squad, a
 * monster's card (its type, body, level, stats and moves), the results of a fight.
 *
 *   const panels = createRingPanels();
 *   panels.befriend({ title, text, monsters, onPick(mon | null) })
 *   panels.squad({ monsters, squad, onDone(ids) })
 *   panels.info({ title, text, monsters, buttons })
 */
import { TYPES, BODIES, movesOf, statsOf, xpToNext, STRONG } from './monsters.js';
import { monsterCanvas } from './art.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

/** A monster's card: picture, name, type, body, level, stats, moves. */
export function monsterCard(mon, { tag = 'div', onclick = null, chosen = false, extra = null, compact = false } = {}) {
  const T = TYPES[mon.type], s = statsOf(mon);
  const moves = movesOf(mon).filter(m => m.id !== 'guard');
  const kids = [
    monsterCanvas(mon, { scale: compact ? 1.5 : 2 }),
    el('strong', { text: mon.nick || mon.name }),
    el('span', { class: 'mon-type', style: `background:${T.color}`, text: `${T.name}` }),
    el('span', { class: 'deck-count', text: `Lv ${mon.level} · ${BODIES[mon.body]?.name || ''}${mon.xp ? ` · ${mon.xp}/${xpToNext(mon.level)} xp` : ''}` }),
  ];
  if (!compact) {
    kids.push(el('span', { class: 'mon-stats', text: `HP ${s.hp} · ATK ${s.atk} · DEF ${s.def} · SPD ${s.spd}` }));
    kids.push(el('span', { class: 'deck-words', text: moves.map(m => m.name).join(' · ') }));
    kids.push(el('span', { class: 'mon-strong', text: `Strong vs ${STRONG[mon.type].map(t => TYPES[t].name).join(' & ')}` }));
  }
  if (extra) kids.push(extra);
  const props = { class: `deck-card mon-card${chosen ? ' chosen' : ''}`, title: `${mon.name}${mon.title ? ` — ${mon.title}` : ''}\n${moves.map(m => `${m.name}: ${m.about}`).join('\n')}` };
  if (onclick) { props.type = 'button'; props.onclick = onclick; }
  return el(onclick ? 'button' : tag, props, kids);
}

export function createRingPanels({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'deck-panel ring-panel', role: 'dialog', 'aria-label': 'Monsters' });
  root.hidden = true;
  parent.append(root);
  let onKey = null;
  const close = () => { root.hidden = true; root.replaceChildren(); document.body.classList.remove('in-deck'); if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; };
  const open = (children, esc) => {
    root.replaceChildren(...children.filter(Boolean));
    root.hidden = false;
    document.body.classList.add('in-deck');
    if (onKey) window.removeEventListener('keydown', onKey, true);
    onKey = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); esc(); } };
    window.addEventListener('keydown', onKey, true);
    (root.querySelector('button.primary') || root.querySelector('button'))?.focus();
  };

  /** One of the stage's beaten bosses comes home with you. */
  function befriend({ title, text, monsters, onPick, owned = [] }) {
    // a type you don't have yet is worth knowing about: squads that cover each other win
    const have = new Set(owned.map(m => m.type));
    const row = el('div', { class: 'deck-cards pack' }, monsters.map(m => monsterCard(m, { extra: !have.has(m.type) && owned.length ? el('span', { class: 'mon-note', text: `New type: ${TYPES[m.type].name}!` }) : null, onclick: () => { close(); onPick(m); } })));
    row.querySelectorAll('.mon-card').forEach((c, i) => { c.classList.add('reveal'); c.style.animationDelay = `${i * 0.2}s`; });
    open([el('h2', { text: title }), el('p', { class: 'home-text', text }), row,
      el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', text: 'None of them', onclick: () => { close(); onPick(null); } })])], () => { close(); onPick(null); });
  }

  /** Choose the three you take into the Ring. */
  function squad({ monsters, squad: chosen = [], onDone, title = 'Your squad' }) {
    let ids = chosen.filter(id => monsters.some(m => m.id === id)).slice(0, 3);
    const render = () => {
      const list = el('div', { class: 'deck-collection' }, [...monsters].sort((a, b) => b.level - a.level).map(m => monsterCard(m, {
        compact: true, chosen: ids.includes(m.id),
        onclick: () => { ids = ids.includes(m.id) ? ids.filter(x => x !== m.id) : ids.length < 3 ? [...ids, m.id] : [...ids.slice(1), m.id]; render(); },
      })));
      open([
        el('h2', { text: `${title} — ${ids.length} / 3` }),
        el('p', { class: 'home-text', text: 'Pick the three who fight in the Ring. Mix types: each one hits two others hard — and two others hit it hard. Click again to take one out.' }),
        list,
        el('div', { class: 'npc-buttons' }, [
          el('button', { type: 'button', text: 'My three strongest', onclick: () => { ids = [...monsters].sort((a, b) => b.level - a.level).slice(0, 3).map(m => m.id); render(); } }),
          el('button', { type: 'button', class: 'primary', text: ids.length === 3 ? 'Done ▸' : 'Done (strongest fill in) ▸', onclick: () => { close(); onDone(ids); } }),
        ]),
      ], () => { close(); onDone(ids); });
    };
    render();
  }

  /** A message with monsters in it (fight results, the ranch's notes). */
  function info({ title, text, monsters = [], extras = [], buttons = [['OK ▸', () => {}, true]] }) {
    const row = monsters.length ? el('div', { class: 'deck-cards pack' }, monsters.map(({ mon, note }) => monsterCard(mon, { compact: true, extra: note ? el('span', { class: 'mon-note', text: note }) : null }))) : null;
    open([el('h2', { text: title }), text ? el('p', { class: 'home-text', text }) : null, row, ...extras,
      el('div', { class: 'npc-buttons' }, buttons.map(([label, action, primary]) => el('button', { type: 'button', class: primary ? 'primary' : '', text: label, onclick: () => { close(); action(); } })))],
    () => { close(); buttons[0]?.[1]?.(); });
  }

  return { befriend, squad, info, close, get open() { return !root.hidden; } };
}
