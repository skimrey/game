/**
 * Touch controls — an on-screen pad for tablets and phones: a D-pad on the left, action buttons
 * on the right. Each button sends the key it stands for (as a keyboard event on the window), so
 * everything that listens for keys — the 3D levels, every mini-game, the card table, your home —
 * works with it unchanged.
 *
 *   D-pad   ← ↑ → ↓          A  Space (jump / the main action)     B  J (attack, dash)
 *   K  the class move · ground pound     E  talk / use     ⏸  Esc
 *
 * Shown on touch screens (a coarse pointer), or with ?touch=1. Spells: tap the spell bar.
 */
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

const KEYS = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Space: ' ', KeyJ: 'j', KeyK: 'k', KeyE: 'e', Escape: 'Escape', Enter: 'Enter' };

/** Send a key as the keyboard would. */
export function sendKey(code, type = 'keydown', target = window) {
  target.dispatchEvent(new KeyboardEvent(type, { code, key: KEYS[code] || code, bubbles: true, cancelable: true }));
}

export function wantsTouch(params = new URLSearchParams(globalThis.location?.search || '')) {
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  return !!globalThis.matchMedia?.('(pointer: coarse)').matches;
}

export function createTouchPad({ parent = document.body } = {}) {
  const pad = el('div', { class: 'touch-pad', 'aria-hidden': 'true' });
  const button = (code, label, cls) => {
    const b = el('button', { type: 'button', class: `touch-btn ${cls}`, text: label });
    const down = e => { e.preventDefault(); b.classList.add('on'); sendKey(code, 'keydown'); b.setPointerCapture?.(e.pointerId); };
    const up = e => { e.preventDefault(); if (!b.classList.contains('on')) return; b.classList.remove('on'); sendKey(code, 'keyup'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  };
  const dpad = el('div', { class: 'touch-dpad' }, [
    button('ArrowUp', '▲', 'up'), button('ArrowLeft', '◀', 'left'), button('ArrowRight', '▶', 'right'), button('ArrowDown', '▼', 'down'),
  ]);
  const actions = el('div', { class: 'touch-actions' }, [
    button('Space', 'A', 'a'), button('KeyJ', 'B', 'b'), button('KeyK', 'K', 'k'), button('KeyE', 'E', 'e'), button('Escape', '⏸', 'esc'),
  ]);
  pad.append(dpad, actions);
  parent.append(pad);
  document.body.classList.add('has-touch');
  return pad;
}
