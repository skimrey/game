/**
 * The tailor's table (HTML over the inn): paint an 8×8 pattern onto the clothes you're wearing
 * (your top, your back item — capes, wings, shields …) or pick new colours for your trail, see
 * it on your hero (2D and 3D) as you go, and pay in gold when you're happy.
 *
 *   const tailor = createTailorPanel();
 *   tailor.open({ design, tailoring, gold, tailorName, onSew({ key, value, price }), onClose })
 */
import { GRID, BLANK, PENS, PRESETS, cell, isBlank, tailorable, priceFor, dress } from '../characters/tailoring.js';
import { paintHero, HERO_W, HERO_H } from '../characters/heroSprite.js';
import { buildScheme, heroBaseColors } from '../engine/palette.js';
import { paintPortrait } from '../characters/characterScreen.js';
import { STYLE_OPTIONS, hexToRgb } from '../characters/character.js';
import { TRAIL_STYLES } from '../characters/trails.js';

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
const label = (slot, value) => STYLE_OPTIONS[slot]?.find(([v]) => v === value)?.[1] || value;
const css = rgb => `rgb(${rgb.map(v => Math.round(v * 255)).join(',')})`;
const toHex = rgb => `#${rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

/** The hero sprite (2D) into a canvas, ×scale. */
function spriteCanvas(design, view, scale = 5) {
  const s = paintHero(design, view, 'idle', 0, 0);
  const pal = buildScheme({ theme: 'meadow', hero: heroBaseColors(design) });
  const c = el('canvas', { width: HERO_W, height: HERO_H, class: 'tailor-sprite' });
  c.style.width = `${HERO_W * scale}px`; c.style.height = `${HERO_H * scale}px`;
  const ctx = c.getContext('2d'), img = ctx.createImageData(HERO_W, HERO_H);
  for (let i = 0; i < s.buf.length; i++) { const v = s.buf[i]; if (!v) continue; const [r, g, b] = pal[v]; img.data.set([r, g, b, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createTailorPanel({ parent = document.querySelector('main') || document.body } = {}) {
  const root = el('section', { class: 'deck-panel tailor-panel', role: 'dialog', 'aria-label': 'The tailor' });
  root.hidden = true;
  parent.append(root);
  let onKey = null, st = null;

  function close() {
    root.hidden = true; root.replaceChildren();
    document.body.classList.remove('in-deck');
    if (onKey) window.removeEventListener('keydown', onKey, true);
    onKey = null;
    const cb = st?.onClose; st = null; cb?.();
  }

  function render() {
    const { design, items } = st;
    const item = items[st.k];
    const work = st.work[item.key];
    // the design as it would look with everything on the table
    const preview = dress(design, { ...st.tailoring, ...Object.fromEntries(Object.entries(st.work).map(([k, v]) => [k, v])) });
    const portrait = el('canvas', { width: 200, height: 240, class: 'tailor-portrait' });
    paintPortrait(portrait, preview, { framing: 'full' });
    const left = el('div', { class: 'tailor-preview' }, [portrait, el('div', { class: 'tailor-sprites' }, [spriteCanvas(preview, 'front'), spriteCanvas(preview, 'back')])]);
    // which item
    const tabs = el('div', { class: 'faction-tabs' }, items.map((it, k) => el('button', { type: 'button', class: `faction-tab${k === st.k ? ' on' : ''}`, text: `${{ top: 'Top', back: 'On your back', trail: 'Trail' }[it.slot]}: ${label(it.slot, it.value)}`, onclick: () => { st.k = k; render(); } })));
    const price = priceFor(item.slot, item.value);
    const saved = st.tailoring[item.key];
    const changed = JSON.stringify(work || null) !== JSON.stringify(saved || null);
    let editor;
    if (item.kind === 'pattern') {
      const pattern = work?.pattern || BLANK;
      const grid = el('div', { class: 'tailor-grid', style: `grid-template-columns:repeat(${GRID}, 1fr)` });
      const paint = (i, v) => { const p = (st.work[item.key]?.pattern || BLANK).split(''); p[i] = String(v); st.work[item.key] = { pattern: p.join('') }; };
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x, v = cell(pattern, x, y);
        const base = item.slot === 'top' ? hexToRgb(design.colors.top) : hexToRgb(design.colors.accent);
        const color = v ? PENS[v].color(design) : base;
        grid.append(el('button', { type: 'button', class: 'tailor-cell', style: `background:${css(color)}`, title: PENS[v].name,
          onpointerdown: e => { e.preventDefault(); st.drawing = true; paint(i, st.pen); render(); },
          onpointerenter: () => { if (st.drawing) { paint(i, st.pen); render(); } } }));
      }
      const pens = el('div', { class: 'tailor-pens' }, PENS.map((p, k) => el('button', { type: 'button', class: `tailor-pen${k === st.pen ? ' on' : ''}`, title: p.name,
        style: `background:${k ? css(p.color(design)) : 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 50% / 10px 10px'}`, onclick: () => { st.pen = k; render(); } }, [el('span', { text: k ? '' : '⌫' })])));
      const presets = el('div', { class: 'tailor-presets' }, [
        ...Object.entries(PRESETS).map(([name, p]) => el('button', { type: 'button', text: name, onclick: () => { st.work[item.key] = { pattern: p.replace(/[1-7]/g, ch => (ch === '1' && st.pen > 0 ? String(st.pen) : ch)) }; render(); } })),
        el('button', { type: 'button', text: 'clear', onclick: () => { st.work[item.key] = null; render(); } }),
      ]);
      editor = el('div', { class: 'tailor-editor' }, [
        el('p', { class: 'home-text', text: 'Pick a pen (your outfit’s own colours, white, ink or gold), then click or drag on the cloth. The ⌫ pen rubs out. Presets use the pen you have picked.' }),
        el('div', { class: 'tailor-row' }, [grid, el('div', {}, [pens, presets])]),
      ]);
    } else {
      const colors = work?.colors || (TRAIL_STYLES[item.value]?.colors || [[1, 0.8, 0.3], [1, 1, 1]]).map(toHex);
      editor = el('div', { class: 'tailor-editor' }, [
        el('p', { class: 'home-text', text: 'A trail’s sparkles, in colours of your choosing.' }),
        el('div', { class: 'tailor-pens' }, colors.slice(0, 3).map((c, i) => el('input', { type: 'color', value: c, oninput: e => { const next = [...colors]; next[i] = e.target.value; st.work[item.key] = { colors: next }; render(); } }))),
        el('button', { type: 'button', text: 'Back to its own colours', onclick: () => { st.work[item.key] = null; render(); } }),
      ]);
    }
    const removing = !work || (item.kind === 'pattern' && isBlank(work.pattern));
    const cost = removing ? 0 : price;
    const sew = el('button', { type: 'button', class: 'primary', text: !changed ? 'Nothing to sew yet' : removing ? 'Unpick it (free)' : st.gold >= cost ? `Sew it — ${cost} gold ▸` : `Sew it — ${cost} gold (you have ${st.gold})`,
      onclick: () => {
        if (!changed || st.gold < cost) return;
        const value = removing ? null : work;
        st.onSew({ key: item.key, value, price: cost });
        st.gold -= cost;
        st.tailoring = { ...st.tailoring, [item.key]: value };
        if (!value) delete st.tailoring[item.key];
        render();
      } });
    if (!changed || st.gold < cost) sew.disabled = true;
    root.replaceChildren(
      el('h2', { text: `${st.tailorName}, the tailor` }),
      el('p', { class: 'home-text', text: `“Anything you’ve got, I can make it yours.” Plain clothes are cheap; rare things dear — wings and trails dearest. You have ${st.gold} gold (the inn’s challenge board and the Ring pay).` }),
      tabs,
      el('div', { class: 'tailor-body' }, [left, editor]),
      el('div', { class: 'npc-buttons' }, [el('button', { type: 'button', text: 'Done', onclick: close }), sew]),
    );
  }

  return {
    get open() { return !root.hidden; },
    open({ design, tailoring = {}, gold = 0, tailorName = 'Tess', onSew = () => {}, onClose = () => {} }) {
      const items = tailorable(design);
      st = { design, tailoring: { ...tailoring }, gold, tailorName, onSew, onClose, items, k: 0, pen: 1, drawing: false, work: Object.fromEntries(items.map(it => [it.key, tailoring[it.key] || null])) };
      root.hidden = false;
      document.body.classList.add('in-deck');
      onKey = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerup', () => { if (st) st.drawing = false; });
      render();
    },
    close,
  };
}
