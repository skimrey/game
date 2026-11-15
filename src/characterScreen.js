/**
 * Character screen — shown before the game starts (and on C during play).
 *
 * Left: the roster — three default heroes, the player's saved designs and
 * "Build your own". Right (while building): the editor — body, face, hair & hat,
 * clothing and gear, each with style choices and colours. The 3D preview is the
 * game canvas behind the panels (see main.js: the showroom).
 *
 *   const screen = createCharacterScreen({ store, onPreview, onPlay });
 *   screen.open({ resume })   // resume: label the button "Resume" (opened mid-game)
 *   screen.close()
 *
 * The screen never touches the game directly: it calls onPreview(design) whenever
 * the previewed look changes and onPlay(design) when the player is ready.
 */
import {
  STYLE_OPTIONS, EDITOR_SECTIONS, COLOR_LABELS, SWATCHES, NAME_MAX, DRAFT_ID, UNLOCKABLES, RARITIES, RARITY_INFO,
  normalizeCharacter, randomCharacter, sameLook, isUnlockable,
} from './character.js';
import { createAvatar, itemParts } from './avatar.js';
import { drawPortrait } from './portrait.js';

const STYLE_LABELS = {
  build: 'Build', head: 'Head', hair: 'Hair', hat: 'Hat', eyes: 'Eyes', face: 'Mouth', extra: 'Extras',
  top: 'Top', bottom: 'Bottoms', shoes: 'Shoes', back: 'Back', trail: 'Trail',
};
const CARD_BACKGROUND = [[0.36, 0.6, 0.9], [0.72, 0.88, 0.98]];

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
};

/** Paint a still portrait of a design into a canvas (idle pose, 3/4 view). */
const portraitAvatar = createAvatar({ random: () => 0.5 });
export function paintPortrait(canvas, design, { framing = 'full', background = CARD_BACKGROUND } = {}) {
  portraitAvatar.setCharacter(design);
  portraitAvatar.reset({ x: 0, y: 0, z: 0, grounded: true }, { pop: false });
  drawPortrait(canvas, portraitAvatar.getParts({ x: 0, y: 0, z: 0 }), { framing, background });
}

/** Paint a won (or locked) item on its own: the item's boxes, seen 3/4 from the front (back items from behind). */
export function paintItem(canvas, design, unlockable, { locked = false } = {}) {
  const parts = itemParts({ ...design, [unlockable.slot]: unlockable.value }, unlockable.slot);
  const look = locked ? parts.map(p => ({ ...p, color: [0.18, 0.2, 0.28], glow: 0 })) : parts;
  drawPortrait(canvas, look, { yaw: unlockable.slot === 'back' ? Math.PI - 0.55 : 0.55, pitch: 0.25, background: locked ? [[0.1, 0.12, 0.2], [0.16, 0.18, 0.28]] : [[0.45, 0.2, 0.6], [0.95, 0.55, 0.75]] });
}

export function createCharacterScreen({ store, onPreview = () => {}, onPlay = () => {}, parent = document.querySelector('main') || document.body }) {
  let current = null;        // the design being previewed
  let editing = null;        // editor draft (null when the editor is closed)
  let editingSavedId = null; // id of the saved design being edited (null: a new design)
  let resumeMode = false;
  let wardrobeMode = false;
  let playLabel = null;     // e.g. 'Continue to level 5' (between levels)
  let message = null;

  // ---------------------------------------------------------------- layout
  const root = el('section', { class: 'char-screen', 'aria-label': 'Choose your character', hidden: true });
  const roster = el('div', { class: 'char-panel char-roster' });
  const editor = el('div', { class: 'char-panel char-editor', hidden: true, 'aria-label': 'Character editor' });
  const stage = el('div', { class: 'char-stage' });
  root.append(roster, stage, editor);
  parent.append(root);

  const title = el('h1', { class: 'char-title', text: 'Choose your hero' });
  const list = el('div', { class: 'char-list', role: 'listbox', 'aria-label': 'Characters' });
  const note = el('p', { class: 'char-note', 'aria-live': 'polite' });
  roster.append(title, list, note);

  const nameplate = el('div', { class: 'char-nameplate' });
  const playButton = el('button', { class: 'char-play', type: 'button', onclick: () => play() }, 'Play');
  const hint = el('p', { class: 'char-hint', text: 'Enter to play · drag the preview to turn your hero' });
  stage.append(nameplate, playButton, hint);

  const say = text => {
    note.textContent = text || '';
    clearTimeout(message);
    if (text) message = setTimeout(() => { note.textContent = ''; }, 4000);
  };

  // ---------------------------------------------------------------- roster
  function cardFor(design, { saved = false, draft = false } = {}) {
    const selected = current && !editing && current.id === design.id;
    const canvas = el('canvas', { class: 'char-portrait', width: 96, height: 112, 'aria-hidden': 'true' });
    paintPortrait(canvas, design);
    const card = el('div', {
      class: `char-card${selected ? ' selected' : ''}`,
      role: 'option',
      'aria-selected': selected ? 'true' : 'false',
      tabindex: '0',
      title: `Preview ${design.name}`,
      onclick: () => select(design),
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (current?.id === design.id && !editing) play(); else select(design); }
      },
    }, [
      canvas,
      el('span', { class: 'char-name', text: design.name }),
      el('span', { class: 'char-tag', text: draft ? 'Unsaved design' : design.tagline || (saved ? 'Your design' : '') }),
    ]);
    if (saved || draft) {
      const actions = el('div', { class: 'char-card-actions' });
      actions.append(el('button', {
        type: 'button', class: 'mini', title: `Edit ${design.name}`, text: 'Edit',
        onclick: e => { e.stopPropagation(); openEditor(design, saved ? design.id : null); },
      }));
      if (draft) {
        actions.append(el('button', {
          type: 'button', class: 'mini', title: 'Save this design', text: 'Save',
          onclick: e => { e.stopPropagation(); const copy = saveDesign({ ...design, id: DRAFT_ID }, null); if (copy) select(copy); },
        }));
      } else {
        actions.append(el('button', {
          type: 'button', class: 'mini danger', title: `Delete ${design.name}`, 'aria-label': `Delete ${design.name}`, text: '✕',
          onclick: e => { e.stopPropagation(); remove(design); },
        }));
      }
      card.append(actions);
    }
    return card;
  }

  /** Wardrobe: the clothing won in boss battles, by rarity. Picking an item puts it on the current hero (in the editor). */
  function renderWardrobe() {
    const won = store.unlocked();
    const box = el('div', { class: 'char-wardrobe' });
    box.append(el('h2', { class: 'char-group', text: `Wardrobe · ${won.length}/${UNLOCKABLES.length} won` }));
    if (!won.length) box.append(el('p', { class: 'char-tag', text: 'Grab a gem and beat its boss to win clothing — tougher bosses drop rarer things.' }));
    for (const rarity of RARITIES) {
      const items = UNLOCKABLES.filter(u => u.rarity === rarity);
      const info = RARITY_INFO[rarity];
      box.append(el('h3', { class: 'char-rarity', style: `color:${info.color}`, text: `${info.label} · ${items.filter(u => won.includes(u.id)).length}/${items.length}` }));
      const grid = el('div', { class: 'char-items' });
      for (const u of items) {
        const have = won.includes(u.id);
        const wearing = current && current[u.slot] === u.value;
        const canvas = el('canvas', { width: 64, height: 64, class: 'char-item-art', 'aria-hidden': 'true' });
        paintItem(canvas, current || store.selected(), u, { locked: !have });
        grid.append(el('button', {
          type: 'button', class: `char-item rarity-${rarity}${have ? '' : ' locked'}${wearing ? ' wearing' : ''}`,
          style: have ? `border-color:${info.color}` : '',
          title: have ? `${u.name} (${info.label}) — ${u.about}${wearing ? ' (wearing)' : ' Click to try it on.'}` : `Locked ${info.label.toLowerCase()} item — beat a boss to win it`,
          'aria-label': have ? `${u.name}, ${info.label}${wearing ? ', wearing' : ''}` : `Locked ${info.label} item`,
          disabled: !have,
          onclick: () => openEditor({ ...current, [u.slot]: u.value, name: current.name }, current.id !== DRAFT_ID && store.get(current.id) && !store.isDefault(current.id) ? current.id : null),
        }, [canvas, el('span', { text: have ? u.name : '?' })]));
      }
      box.append(grid);
    }
    return box;
  }

  function renderRoster() {
    list.replaceChildren();
    if (store.unlocked().length || wardrobeMode) list.append(renderWardrobe());
    list.append(el('h2', { class: 'char-group', text: 'Heroes' }));
    for (const design of store.defaults) list.append(cardFor(design));
    const saved = store.saved();
    const draft = store.draft();
    if (saved.length || draft) list.append(el('h2', { class: 'char-group', text: 'Your designs' }));
    for (const design of saved) list.append(cardFor(design, { saved: true }));
    if (draft) list.append(cardFor(draft, { draft: true }));
    list.append(el('button', {
      type: 'button', class: `char-card build${editing ? ' selected' : ''}`,
      onclick: () => openEditor({ ...current, name: current.id === DRAFT_ID ? current.name : `${current.name} II` }, null),
      title: 'Design your own hero: colours, shapes, clothing',
    }, [el('span', { class: 'plus', text: '+', 'aria-hidden': 'true' }), el('span', { class: 'char-name', text: 'Build your own' })]));
  }

  function showName() {
    nameplate.replaceChildren(
      el('span', { class: 'big', text: current.name }),
      el('span', { class: 'small', text: editing ? 'Building…' : current.tagline || 'Your design' }),
    );
    playButton.textContent = playLabel ? `${playLabel} as ${current.name}` : resumeMode ? `Resume as ${current.name}` : `Play as ${current.name}`;
  }

  function select(design) {
    current = normalizeCharacter(design);
    if (editing) closeEditor();
    renderRoster();
    showName();
    onPreview(current);
  }

  function remove(design) {
    if (!confirm(`Delete "${design.name}"?`)) return;
    store.remove(design.id);
    if (current.id === design.id) select(store.selected());
    else renderRoster();
    say(`Deleted ${design.name}.`);
  }

  function saveDesign(design, savedId) {
    try {
      const copy = store.save({ ...design, id: savedId || design.id });
      if (design.id === DRAFT_ID) store.setDraft(null);
      editingSavedId = copy.id;
      say(`Saved "${copy.name}".`);
      return copy;
    } catch (error) {
      say(error.message);
      return null;
    }
  }

  // ---------------------------------------------------------------- editor
  const nameInput = el('input', { type: 'text', maxlength: String(NAME_MAX), 'aria-label': 'Name', spellcheck: 'false' });
  nameInput.addEventListener('input', () => { editing.name = nameInput.value; current = normalizeCharacter(editing); showName(); });
  const controls = {};   // key → refresh()
  const editorBody = el('div', { class: 'char-editor-body' });
  const saveButton = el('button', { type: 'button', class: 'primary', text: 'Save design', onclick: () => {
    const copy = saveDesign(editing, editingSavedId);
    if (copy) { editing = { ...copy }; current = copy; renderRoster(); }
  } });
  editor.append(
    el('div', { class: 'char-editor-head' }, [
      el('h2', { text: 'Build your own' }),
      el('label', { class: 'char-field' }, [el('span', { text: 'Name' }), nameInput]),
    ]),
    editorBody,
    el('div', { class: 'char-editor-actions' }, [
      el('button', { type: 'button', text: 'Randomize', title: 'Random look (keeps the name)', onclick: () => {
        const name = editing.name;
        editing = { ...randomCharacter(Math.random, name, store.unlocked()), id: editing.id };
        refreshEditor();
      } }),
      saveButton,
      el('button', { type: 'button', text: 'Done', title: 'Back to the roster (Esc)', onclick: () => { closeEditor(); renderRoster(); showName(); } }),
    ]),
  );

  for (const section of EDITOR_SECTIONS) {
    const box = el('fieldset', { class: 'char-section' }, [el('legend', { text: section.title })]);
    for (const key of section.styles) {
      const group = el('div', { class: 'char-options', role: 'radiogroup', 'aria-label': STYLE_LABELS[key] });
      const buttons = STYLE_OPTIONS[key].map(([value, label]) => el('button', {
        type: 'button', role: 'radio', text: label,
        onclick: () => { if (store.isUnlocked(key, value)) { editing[key] = value; refreshEditor(); } },
      }));
      group.append(...buttons);
      controls[key] = () => buttons.forEach((b, i) => {
        const [value, label] = STYLE_OPTIONS[key][i];
        const on = value === editing[key];
        const locked = !store.isUnlocked(key, value);
        b.classList.toggle('active', on);
        b.classList.toggle('locked', locked);
        b.classList.toggle('won', isUnlockable(key, value) && !locked);
        b.disabled = locked;
        b.textContent = locked ? `🔒 ${label}` : isUnlockable(key, value) ? `★ ${label}` : label;
        b.title = locked ? 'Locked — beat a boss to win it' : '';
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      box.append(el('div', { class: 'char-row' }, [el('span', { class: 'char-label', text: STYLE_LABELS[key] }), group]));
    }
    for (const slot of section.colors) {
      const swatches = el('div', { class: 'char-swatches', role: 'radiogroup', 'aria-label': `${COLOR_LABELS[slot]} colour` });
      const buttons = SWATCHES[slot].map(hex => el('button', {
        type: 'button', role: 'radio', class: 'swatch', title: hex, 'aria-label': hex, style: `background:${hex}`,
        onclick: () => { editing.colors = { ...editing.colors, [slot]: hex }; refreshEditor(); },
      }));
      const picker = el('input', { type: 'color', class: 'swatch-picker', title: 'Any colour', 'aria-label': `Custom ${COLOR_LABELS[slot]} colour` });
      picker.addEventListener('input', () => { editing.colors = { ...editing.colors, [slot]: picker.value }; refreshEditor(); });
      swatches.append(...buttons, picker);
      controls[`color:${slot}`] = () => {
        const value = editing.colors[slot];
        buttons.forEach(b => { const on = b.title === value; b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        picker.value = value;
        picker.classList.toggle('active', !SWATCHES[slot].includes(value));
      };
      box.append(el('div', { class: 'char-row' }, [el('span', { class: 'char-label', text: COLOR_LABELS[slot] }), swatches]));
    }
    editorBody.append(box);
  }

  function refreshEditor() {
    editing = normalizeCharacter(editing);
    nameInput.value = editing.name;
    for (const refresh of Object.values(controls)) refresh();
    current = { ...editing };
    const saved = editingSavedId && store.get(editingSavedId);
    saveButton.textContent = saved ? (sameLook(saved, editing) && saved.name === editing.name ? 'Saved ✓' : 'Save changes') : 'Save design';
    showName();
    onPreview(current);
  }

  function openEditor(design, savedId) {
    editingSavedId = savedId;
    editing = normalizeCharacter({ ...design, id: savedId || DRAFT_ID });
    editor.hidden = false;
    root.classList.add('editing');
    renderRoster();
    refreshEditor();
    nameInput.focus();
    nameInput.select();
  }

  function closeEditor() {
    if (!editing) return;
    // keep unsaved work as a draft so it isn't lost
    const saved = editingSavedId && store.get(editingSavedId);
    if (!saved) store.setDraft({ ...editing, id: DRAFT_ID });
    else if (!sameLook(saved, editing) || saved.name !== editing.name) store.setDraft({ ...editing, id: DRAFT_ID });
    current = saved && sameLook(saved, editing) && saved.name === editing.name ? saved : store.draft() || current;
    editing = null;
    editor.hidden = true;
    root.classList.remove('editing');
  }

  // ---------------------------------------------------------------- flow
  function play() {
    let design = editing ? { ...editing } : current;
    if (editing) {
      const saved = editingSavedId && store.get(editingSavedId);
      const unchanged = saved && sameLook(saved, design) && saved.name === design.name;
      closeEditor();
      design = unchanged ? saved : { ...design, id: DRAFT_ID };
    }
    if (design.id === DRAFT_ID || !store.get(design.id)) {
      design = { ...design, id: DRAFT_ID };
      store.setDraft(design);
      store.select(DRAFT_ID);
    } else {
      store.select(design.id);
    }
    onPlay(normalizeCharacter(design));
  }

  // Keys: Enter plays (unless a button / field has focus — they handle Enter themselves);
  // Esc leaves the editor, or resumes the game when opened mid-game.
  window.addEventListener('keydown', e => {
    if (root.hidden || e.defaultPrevented || e.repeat) return;
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) { closeEditor(); renderRoster(); showName(); list.querySelector('.char-card.selected')?.focus(); }
      else if (resumeMode || wardrobeMode) play();
    } else if (e.key === 'Enter' && !typing && !(t instanceof HTMLButtonElement) && !t.closest?.('.char-card')) {
      e.preventDefault();
      play();
    }
  });

  return {
    get isOpen() { return !root.hidden; },
    get design() { return current; },
    play,
    /**
     * resume:   opened mid-game (the button says "Resume")
     * wardrobe: show the wardrobe of won clothing first (between levels)
     * label:    text for the play button, e.g. 'Continue to level 5'
     */
    open({ resume = false, wardrobe = false, label = null } = {}) {
      resumeMode = resume;
      wardrobeMode = wardrobe;
      playLabel = label;
      current = store.selected();
      title.textContent = wardrobe ? 'Wardrobe' : 'Choose your hero';
      renderRoster();
      showName();
      root.hidden = false;
      onPreview(current);
      requestAnimationFrame(() => (list.querySelector(wardrobe ? '.char-item:not(.locked)' : '.char-card.selected') || list.querySelector('.char-card.selected') || playButton).focus());
    },
    close() {
      if (editing) closeEditor();
      root.hidden = true;
    },
    /** CSS-pixel insets of the panels, so the preview can centre the hero in the free space. */
    insets() {
      const r = root.getBoundingClientRect();
      const left = roster.getBoundingClientRect();
      const right = editor.hidden ? null : editor.getBoundingClientRect();
      return { left: left.right - r.left, right: right ? r.right - right.left : 0, width: r.width, height: r.height };
    },
  };
}
