/**
 * Test menu — for testing mode (?quality=test, or ?dev=1 with any quality): jump to any
 * level, play any mini-game at any of its three difficulty rounds, skip to the gem or
 * the arcade checkpoint, or start a new run — and (extras) walk to the level's NPC, learn
 * a spell, borrow a pet, finish the run or go back to town; test every journey (each vehicle in
 * 3D or 2D, in any zone's scenery) or skip to the run's next one. Toggle with the ` key or 🧪.
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
 * games:  [{ id, name, role: 'boss' | 'checkpoint' | 'travel' | 'quest' }]
 * levels: () → { run, current, list: [{ name, tier, boss, checkpoint, travel }] } (each { mode, difficulty } or null)
 */
export function createTestMenu({ games, levels, onLevel, onGame, onGem, onArcade, onNewRun, extras = () => [], journeys = null, onJourney = () => {}, onNextJourney = () => {}, parent = document.querySelector('main') || document.body }) {
  const toggle = el('button', { type: 'button', class: 'test-toggle', title: 'Test menu (`)', text: '🧪 Test menu' });
  const panel = el('section', { class: 'test-menu', 'aria-label': 'Test menu' });
  panel.hidden = true;
  parent.append(toggle, panel);
  const nameOf = id => games.find(g => g.id === id)?.name || id;

  let journeyZone = '';                 // the scenery picked for test journeys ('' = the current level's zone)
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
    // NPCs, spells, pets, the town (extras: [{ label, action }])
    const more = extras();
    if (more.length) panel.append(el('div', { class: 'test-row' }, more.map(({ label, action }) => el('button', { type: 'button', text: label, onclick: () => { close(); action(); } }))));
    // the journeys (travel levels): each vehicle in 3D or 2D, in any zone's scenery — or the run's next one
    if (journeys) {
      const j = journeys();
      const zone = el('select', { class: 'test-zone', title: 'Where the journey goes (its scenery)' }, [el('option', { value: '', text: 'this level’s zone' }), ...j.zones.map(z => el('option', { value: z.id, text: z.name }))]);
      zone.value = journeyZone;
      zone.addEventListener('change', () => { journeyZone = zone.value; });
      const next = j.next
        ? el('button', { type: 'button', text: `⏭ Skip to this run’s next journey — after level ${j.next.index + 1}: ${j.next.from} → ${j.next.to} by ${j.next.name}`, onclick: () => { close(); onNextJourney(); } })
        : el('span', { class: 'test-note', text: 'No journeys left on this run (🎲 New run for more).' });
      panel.append(el('h3', { text: '🚂 Journeys — test each vehicle (3D or 2D)' }), el('div', { class: 'test-row' }, [next]),
        el('div', { class: 'test-row' }, [el('label', { class: 'test-label', text: 'Scenery:' }), zone]));
      const list = el('div', { class: 'test-journeys' });
      for (const v of j.vehicles) {
        const row = el('div', { class: 'test-game test-journey' }, [el('span', { text: `🚂 ${v.name}` })]);
        for (const [view, label] of [['3d', '🎥 3D'], ['2d', '▦ 2D']]) {
          row.append(el('span', { class: 'test-view', text: label }));
          ['E', 'M', 'H'].forEach((l, k) => row.append(el('button', { type: 'button', text: l, title: `${v.name} in ${view.toUpperCase()} — ${['easy', 'medium', 'hard'][k]}`, onclick: () => { close(); onJourney({ mode: v.id, level3: k, view, zone: journeyZone || null }); } })));
        }
        list.append(row);
      }
      panel.append(list);
    }
    // any mini-game, any round
    const grid = el('div', { class: 'test-games' });
    const icon = { boss: '👾', checkpoint: '🕹', travel: '🚂', quest: '🗡' };
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
