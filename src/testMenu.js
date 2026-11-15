/**
 * Test menu — for testing mode (?quality=test, or ?dev=1 with any quality): jump to any
 * level, play any mini-game at any of its three difficulty rounds, skip to the gem or
 * the arcade checkpoint, or start a new run. Toggle with the ` key or the 🧪 button.
 *
 *   const menu = createTestMenu({ games, levels: () => [...], onLevel, onGame, onGem, onArcade, onNewRun });
 *   menu.refresh();   // after the run or the level changed
 */
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

/**
 * games:  [{ id, name, role: 'boss' | 'checkpoint' | 'travel' }]
 * levels: () → { run, current, list: [{ name, tier, boss, checkpoint, travel }] } (each { mode, difficulty } or null)
 */
export function createTestMenu({ games, levels, onLevel, onGame, onGem, onArcade, onNewRun, parent = document.querySelector('main') || document.body }) {
  const toggle = el('button', { type: 'button', class: 'test-toggle', title: 'Test menu (`)', text: '🧪 Test menu' });
  const panel = el('section', { class: 'test-menu', 'aria-label': 'Test menu' });
  panel.hidden = true;
  parent.append(toggle, panel);
  const nameOf = id => games.find(g => g.id === id)?.name || id;

  function close() { panel.hidden = true; }
  function open() { render(); panel.hidden = false; }
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
  window.addEventListener('keydown', e => {
    if (e.code !== 'Backquote' || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    panel.hidden ? open() : close();
  });

  function render() {
    const info = levels();
    panel.replaceChildren();
    panel.append(el('header', {}, [
      el('h2', { text: 'Test menu' }),
      el('span', { class: 'test-run', text: info.run ? `Run ${info.run}` : 'Hand-written run' }),
      el('button', { type: 'button', class: 'test-close', text: '✕', 'aria-label': 'Close', onclick: close }),
    ]));
    // levels
    const list = el('div', { class: 'test-levels' });
    info.list.forEach((level, i) => {
      const chips = [];
      const pct = x => ` ${Math.round(x.difficulty * 100)}%`;
      if (level.checkpoint) chips.push(el('span', { class: 'test-chip checkpoint', title: 'arcade checkpoint · difficulty', text: `🕹 ${nameOf(level.checkpoint.mode)}${pct(level.checkpoint)}` }));
      if (level.boss) chips.push(el('span', { class: 'test-chip', title: 'boss · difficulty', text: `👾 ${nameOf(level.boss.mode)}${pct(level.boss)}` }));
      if (level.travel) chips.push(el('span', { class: 'test-chip travel', title: 'travel after this level · difficulty', text: `🚂 ${nameOf(level.travel.mode)}${pct(level.travel)}` }));
      list.append(el('button', {
        type: 'button', class: `test-level${i === info.current ? ' current' : ''}`,
        onclick: () => { close(); onLevel(i); },
      }, [el('strong', { text: `${i + 1}. ${level.name}` }), el('span', { class: 'test-tier', text: level.tier }), ...chips]));
    });
    panel.append(el('h3', { text: 'Go to level' }), list);
    // shortcuts in the current level
    panel.append(el('div', { class: 'test-row' }, [
      el('button', { type: 'button', text: '💎 Skip to the gem (boss)', onclick: () => { close(); onGem(); } }),
      el('button', { type: 'button', text: '🕹 Go to the arcade', onclick: () => { close(); onArcade(); } }),
      el('button', { type: 'button', text: '🎲 New run', onclick: () => { close(); onNewRun(); } }),
    ]));
    // any mini-game, any round
    const grid = el('div', { class: 'test-games' });
    const icon = { boss: '👾', checkpoint: '🕹', travel: '🚂' };
    for (const game of games) {
      grid.append(el('div', { class: 'test-game' }, [
        el('span', { text: `${icon[game.role]} ${game.name}` }),
        ...['E', 'M', 'H'].map((label, k) => el('button', { type: 'button', text: label, title: `${game.name} as ${game.role} — ${['easy', 'medium', 'hard'][k]}`, onclick: () => { close(); onGame(game.id, k, game.role); } })),
      ]));
    }
    panel.append(el('h3', { text: 'Play any mini-game — easy · medium · hard (👾 boss · 🕹 checkpoint · 🚂 travel)' }), grid);
    panel.append(el('p', { class: 'test-note', text: 'Mini-games from this menu give no rewards. Toggle the menu with `.' }));
  }

  return {
    refresh() { if (!panel.hidden) render(); },
    close,
    get open() { return !panel.hidden; },
  };
}
