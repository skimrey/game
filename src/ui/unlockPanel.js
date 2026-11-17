/**
 * The card shown between levels, over the 3D "stage" (app/): a won item being
 * admired, or a level completed without a reward. Buttons are [label, action, primary].
 *
 *   const panel = createUnlockPanel();
 *   panel.show({ kicker, title, text, buttons });
 *   panel.hide();
 */
export function createUnlockPanel(parent = document.querySelector('main') || document.body) {
  const root = document.createElement('section');
  root.className = 'unlock-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  parent.append(root);

  return {
    get open() { return !root.hidden; },
    show({ kicker = '', title = '', text = '', buttons = [], accent = null, list = null, art = null }) {
      root.replaceChildren();
      const add = (tag, cls, content) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = content; root.append(n); return n; };
      root.style.boxShadow = accent ? `0 0 0 3px ${accent}, 0 12px 40px rgba(0, 0, 0, 0.4)` : '';
      if (kicker) { const k = add('p', 'unlock-kicker', kicker); if (accent) k.style.color = accent; }
      add('h2', '', title);
      if (art) { art.classList.add('unlock-art'); root.append(art); }   // a picture (e.g. a pet that followed you home)
      if (text) add('p', 'unlock-text', text);
      if (list?.length) {                         // [{ label, ok }] — e.g. the games of a run, beaten or not
        const ul = document.createElement('ul');
        ul.className = 'unlock-list';
        for (const { label, ok } of list) {
          const li = document.createElement('li');
          li.className = ok ? 'ok' : 'missed';
          li.textContent = `${ok ? '✓' : '✗'} ${label}`;
          ul.append(li);
        }
        root.append(ul);
      }
      const row = document.createElement('div');
      row.className = 'unlock-buttons';
      const made = buttons.map(([label, action, primary]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (primary) b.className = 'primary';
        b.addEventListener('click', () => action(b));
        row.append(b);
        return b;
      });
      root.append(row);
      root.hidden = false;
      (made.find(b => b.classList.contains('primary')) || made[0])?.focus();
    },
    hide() { root.hidden = true; },
  };
}
