/**
 * Options (⚙): music and effects volume, mute, reduced motion (no screen shake or flashes)
 * and assist mode (an extra heart and 30 % more time in every mini-game). Saved in the
 * profile; `onChange(settings)` applies them.
 *
 *   const options = createOptionsPanel({ get: () => profile.settings(), set: patch => profile.setSettings(patch), onChange });
 */
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

export const ASSIST = { hearts: 1, time: 1.3 };

export function createOptionsPanel({ get, set, onChange = () => {}, parent = document.querySelector('main') || document.body }) {
  const toggle = el('button', { type: 'button', class: 'options-toggle', title: 'Options: sound, motion, assist', text: '⚙' });
  const panel = el('section', { class: 'options-panel', role: 'dialog', 'aria-label': 'Options' });
  panel.hidden = true;
  parent.append(toggle, panel);
  const apply = patch => { const s = set(patch); onChange(s); render(); };
  function render() {
    const s = get();
    const slider = (key, label) => el('label', { class: 'opt-row' }, [
      el('span', { text: label }),
      el('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), oninput: e => { const v = Number(e.target.value) / 100; set({ [key]: v }); onChange(get()); e.target.nextSibling.textContent = `${Math.round(v * 100)}%`; } }),
      el('span', { class: 'opt-value', text: `${Math.round(s[key] * 100)}%` }),
    ]);
    const check = (key, label, about) => el('label', { class: 'opt-row opt-check' }, [
      el('input', { type: 'checkbox', checked: !!s[key], onchange: e => apply({ [key]: e.target.checked }) }),
      el('span', {}, [el('strong', { text: label }), el('em', { text: about })]),
    ]);
    panel.replaceChildren(
      el('h2', { text: 'Options' }),
      el('h3', { text: 'Sound' }),
      slider('music', 'Music'), slider('sfx', 'Effects'),
      check('muted', 'Mute everything', 'silence (the M key toggles it too)'),
      el('h3', { text: 'Comfort' }),
      check('reducedMotion', 'Reduced motion', 'no screen shake, no red flashes when you’re hit'),
      check('assist', 'Assist mode', `an extra heart and ${Math.round((ASSIST.time - 1) * 100)} % more time in every mini-game`),
      el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', class: 'primary', text: 'Done', onclick: () => close() })]),
    );
  }
  function open() { render(); panel.hidden = false; panel.querySelector('button.primary')?.focus(); }
  function close() { panel.hidden = true; }
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('keydown', e => { if (e.code === 'Escape') { e.stopPropagation(); close(); } });
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyM' || e.repeat || e.target instanceof HTMLInputElement || document.body.classList.contains('in-battle') || document.body.classList.contains('in-cards')) return;
    apply({ muted: !get().muted });
  });
  return { open, close, get isOpen() { return !panel.hidden; } };
}
