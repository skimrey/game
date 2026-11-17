/**
 * Characters — what the player looks like.
 *
 * A character design is plain, JSON-friendly data:
 *
 *   {
 *     id, name,
 *     build:  'regular' | 'slim' | 'sturdy' | 'small'        body shape
 *     head:   'square' | 'round' | 'wide' | 'tall'            head shape
 *     hair:   'none' | 'short' | 'spiky' | 'long' | 'ponytail' | 'mohawk' | 'bob'
 *     hat:    'none' | 'cap' | 'beanie' | 'headband' | 'crown' | 'helmet'   (+ unlockables)
 *     eyes:   'dots' | 'wide' | 'sleepy' | 'glasses'
 *     face:   'smile' | 'neutral' | 'open' | 'mustache'
 *     extra:  'none'                                             (face / neck accessories: unlockables)
 *     top:    'tee' | 'jacket' | 'hoodie' | 'overalls' | 'tunic'   (+ unlockables)
 *     bottom: 'pants' | 'shorts' | 'skirt'
 *     shoes:  'sneakers' | 'boots'                               (+ unlockables)
 *     back:   'backpack' | 'jetpack' | 'cape' | 'wings' | 'none'   (+ unlockables)
 *     trail:  'none'                                             (glittery after-trails: unlockables)
 *     colors: { skin, hair, eyes, top, bottom, shoes, hat, accent }   '#rrggbb'
 *   }
 *
 * Some options are UNLOCKABLES: clothing won in boss battles (see games/screen.js).
 * They can be worn once unlocked; the store remembers what has been won. Each has a
 * RARITY (common → rare → epic → legendary): tougher bosses drop rarer things — the
 * first region mostly hands out flower crowns and light-up sneakers, the last region's
 * capstone wings, halos and glittery trails (see DROP_TABLE / store.rollReward).
 *
 * The avatar (characters/avatar.js) turns a design into posed boxes; this module only
 * describes the options, ships the default heroes, validates designs and keeps
 * saved designs in localStorage. No DOM — it runs in Node tests too.
 */

/** Clothing won in boss battles: [slot, value, name, blurb, rarity]. */
const UNLOCKABLE_LIST = [
  // common — the meadow's bosses
  ['hat', 'flowers', 'Flower Crown', 'Fresh from the meadows.', 'common'],
  ['hat', 'partyhat', 'Party Hat', 'Striped, pointy, with a pompom on top.', 'common'],
  ['extra', 'scarf', 'Racing Scarf', 'Streams behind you as you run.', 'common'],
  ['extra', 'bowtie', 'Bow Tie', 'For formal boss fights.', 'common'],
  ['shoes', 'rocketboots', 'Rocket Boots', 'Flames in the air — style only.', 'common'],
  ['shoes', 'lightup', 'Light-up Sneakers', 'Soles that glow in every colour.', 'common'],
  // rare — the canyon
  ['hat', 'tophat', 'Top Hat', 'Dapper, tall and very polite.', 'rare'],
  ['hat', 'pirate', 'Pirate Hat', 'Tricorn with a skull badge.', 'rare'],
  ['extra', 'monocle', 'Monocle', 'Indubitably.', 'rare'],
  ['extra', 'heromask', 'Hero Mask', 'Nobody will ever recognise you.', 'rare'],
  ['back', 'guitar', 'Guitar', 'For victory songs.', 'rare'],
  ['back', 'shield', 'Round Shield', 'Painted with your colours.', 'rare'],
  // epic — the mountains
  ['hat', 'wizard', 'Wizard Hat', 'Floppy, starry and slightly magical.', 'epic'],
  ['hat', 'viking', 'Viking Helmet', 'Two horns, zero fear.', 'epic'],
  ['hat', 'gemcrown', 'Gem Crown', 'Gold, with a jewel of every colour.', 'epic'],
  ['hat', 'unicorn', 'Unicorn Horn', 'A spiral of gold and a rainbow mane.', 'epic'],
  ['extra', 'starshades', 'Star Shades', 'Glowing star-shaped sunglasses.', 'epic'],
  ['back', 'sword', 'Sword', 'A trusty blade on your back.', 'epic'],
  ['back', 'rainbowcape', 'Rainbow Cape', 'Every colour, flowing behind you.', 'epic'],
  ['back', 'butterfly', 'Butterfly Wings', 'Big, bright and fluttering.', 'epic'],
  ['top', 'robe', 'Star Robe', 'A long robe with glowing stars.', 'epic'],
  // legendary — the starlit ruins
  ['hat', 'halo', 'Halo', 'It glows. You earned it.', 'legendary'],
  ['back', 'fairywings', 'Fairy Wings', 'Shimmering, glittering, see-through.', 'legendary'],
  ['back', 'dragonwings', 'Dragon Wings', 'Leathery, spiky and enormous.', 'legendary'],
  ['trail', 'glitter', 'Glitter Trail', 'Gold and pink sparkles wherever you go.', 'legendary'],
  ['trail', 'rainbow', 'Rainbow Trail', 'A ribbon of every colour behind you.', 'legendary'],
  ['trail', 'stardust', 'Stardust Trail', 'Twinkling blue stardust drifts up behind you.', 'legendary'],
  ['trail', 'hearts', 'Heart Trail', 'Little hearts float up as you go.', 'legendary'],
  ['trail', 'embers', 'Ember Trail', 'Glowing embers flicker in your wake.', 'legendary'],
];
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_INFO = {
  common: { label: 'Common', color: '#9aa5b8' },
  rare: { label: 'Rare', color: '#4fa3ff' },
  epic: { label: 'Epic', color: '#c86bff' },
  legendary: { label: 'Legendary', color: '#ffc23d' },
};
/**
 * Drop table: the chance of each rarity for a boss in a region (0 meadow … 3 starlit);
 * the region's capstone (its hardest boss) rolls one row further down. Checkpoint games
 * save your progress instead of dropping clothing.
 */
export const DROP_TABLE = [
  { common: 0.85, rare: 0.15 },
  { common: 0.35, rare: 0.5, epic: 0.15 },
  { rare: 0.35, epic: 0.5, legendary: 0.15 },
  { epic: 0.45, legendary: 0.55 },
  { legendary: 1 },
];
export const UNLOCKABLES = UNLOCKABLE_LIST.map(([slot, value, name, about, rarity]) => ({ id: `${slot}:${value}`, slot, value, name, about, rarity }));
const LOCKED_VALUES = new Set(UNLOCKABLES.map(u => u.id));
/** Is this style option an unlockable (as opposed to always available)? */
export const isUnlockable = (slot, value) => LOCKED_VALUES.has(`${slot}:${value}`);
export const unlockableFor = (slot, value) => UNLOCKABLES.find(u => u.slot === slot && u.value === value) || null;

/** Style options, in display order: [value, label]. */
export const STYLE_OPTIONS = {
  build: [['regular', 'Regular'], ['slim', 'Slim'], ['sturdy', 'Sturdy'], ['small', 'Small']],
  head: [['square', 'Square'], ['round', 'Round'], ['wide', 'Wide'], ['tall', 'Tall']],
  hair: [['none', 'None'], ['short', 'Short'], ['spiky', 'Spiky'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['mohawk', 'Mohawk'], ['bob', 'Bob']],
  hat: [['none', 'None'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['headband', 'Headband'], ['crown', 'Crown'], ['helmet', 'Helmet']],
  eyes: [['dots', 'Dots'], ['wide', 'Wide'], ['sleepy', 'Sleepy'], ['glasses', 'Glasses']],
  face: [['smile', 'Smile'], ['neutral', 'Neutral'], ['open', 'Open'], ['mustache', 'Mustache']],
  extra: [['none', 'None']],
  top: [['tee', 'T-shirt'], ['jacket', 'Jacket'], ['hoodie', 'Hoodie'], ['overalls', 'Overalls'], ['tunic', 'Tunic']],
  bottom: [['pants', 'Pants'], ['shorts', 'Shorts'], ['skirt', 'Skirt']],
  shoes: [['sneakers', 'Sneakers'], ['boots', 'Boots']],
  back: [['backpack', 'Backpack'], ['jetpack', 'Jetpack'], ['cape', 'Cape'], ['wings', 'Wings'], ['none', 'None']],
  trail: [['none', 'None']],
};
// unlockables join their slot's options (the editor shows them locked until won)
for (const u of UNLOCKABLES) STYLE_OPTIONS[u.slot].push([u.value, u.name]);

/** Editor sections: which options and colours belong together. */
export const EDITOR_SECTIONS = [
  { title: 'Body', styles: ['build', 'head'], colors: ['skin'] },
  { title: 'Face', styles: ['eyes', 'face', 'extra'], colors: ['eyes'] },
  { title: 'Hair & hat', styles: ['hair', 'hat'], colors: ['hair', 'hat'] },
  { title: 'Clothing', styles: ['top', 'bottom', 'shoes'], colors: ['top', 'bottom', 'shoes'] },
  { title: 'Gear', styles: ['back', 'trail'], colors: ['accent'] },
];

export const COLOR_LABELS = {
  skin: 'Skin', hair: 'Hair colour', eyes: 'Eye colour', top: 'Top colour', bottom: 'Bottoms colour', shoes: 'Shoe colour', hat: 'Hat colour', accent: 'Gear & trim',
};

/** Curated swatches per colour slot (any colour is allowed; these are suggestions). */
export const SWATCHES = {
  skin: ['#ffe0c4', '#f9cda5', '#e8b48c', '#c98e62', '#a86b45', '#8a5236', '#5e3a26', '#9ad27a'],
  hair: ['#2a1c14', '#5a3a22', '#8c5a2b', '#d9a441', '#f1e3b0', '#b8432f', '#e8e8ee', '#6b4fd8', '#25b3a8', '#ff7eb6'],
  eyes: ['#14141f', '#3a2414', '#1f4e8c', '#2f7a3a', '#6b3fa0', '#8a1f1f'],
  top: ['#e64d40', '#3385e6', '#4d9e4d', '#8c4dcc', '#f2b32e', '#24a69a', '#ef6fa8', '#f4f4f0', '#33373f', '#e07a2e'],
  bottom: ['#334780', '#eeeee6', '#735233', '#2b2e36', '#5c8a3a', '#8c2f39', '#6f7a8c', '#c9b48a'],
  shoes: ['#38302a', '#d9d9e0', '#e64d40', '#2b5fb3', '#6b4a2b', '#14141a'],
  hat: ['#f2f2f5', '#fa7333', '#d93838', '#ffd426', '#2e8cd9', '#3d3d47', '#9c9ca8', '#3aa35a'],
  accent: ['#f5b333', '#40ccb3', '#e5e5ea', '#f2738c', '#8c59e6', '#59a6ff', '#e64040', '#3a3a40'],
};

/** The three default heroes offered on the character screen. */
export const DEFAULT_CHARACTERS = [
  {
    id: 'pip', name: 'Pip', tagline: 'Trail explorer',
    build: 'regular', head: 'square', hair: 'short', hat: 'cap', eyes: 'dots', face: 'smile', extra: 'none',
    top: 'tee', bottom: 'pants', shoes: 'sneakers', back: 'backpack', trail: 'none',
    colors: { skin: '#f9cda5', hair: '#5a3a22', eyes: '#14141f', top: '#e64d40', bottom: '#334780', shoes: '#38302a', hat: '#f2f2f5', accent: '#f5b333' },
  },
  {
    id: 'nova', name: 'Nova', tagline: 'Sky pilot',
    build: 'slim', head: 'round', hair: 'ponytail', hat: 'headband', eyes: 'wide', face: 'open', extra: 'none',
    top: 'jacket', bottom: 'shorts', shoes: 'boots', back: 'jetpack', trail: 'none',
    colors: { skin: '#a86b45', hair: '#6b4fd8', eyes: '#1f4e8c', top: '#24a69a', bottom: '#2b2e36', shoes: '#d9d9e0', hat: '#ffd426', accent: '#e5e5ea' },
  },
  {
    id: 'bruno', name: 'Bruno', tagline: 'Gentle knight',
    build: 'sturdy', head: 'wide', hair: 'short', hat: 'helmet', eyes: 'sleepy', face: 'mustache', extra: 'none',
    top: 'tunic', bottom: 'pants', shoes: 'boots', back: 'cape', trail: 'none',
    colors: { skin: '#e8b48c', hair: '#b8432f', eyes: '#3a2414', top: '#4d9e4d', bottom: '#735233', shoes: '#6b4a2b', hat: '#9c9ca8', accent: '#d93838' },
  },
];

const HEX = /^#[0-9a-f]{6}$/i;
export const COLOR_SLOTS = Object.keys(COLOR_LABELS);
export const NAME_MAX = 20;

/** '#rrggbb' → [r, g, b] in 0..1. */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** [r, g, b] in 0..1 → '#rrggbb'. */
export function rgbToHex(rgb) {
  return `#${rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A complete, valid design from anything (saved data may be old, partial or edited
 * by hand): unknown options fall back to `base` (Pip), bad colours likewise.
 */
export function normalizeCharacter(design, base = DEFAULT_CHARACTERS[0]) {
  const d = design && typeof design === 'object' ? design : {};
  const out = {
    id: typeof d.id === 'string' && d.id ? d.id.slice(0, 40) : base.id,
    name: (typeof d.name === 'string' ? d.name.trim() : '').slice(0, NAME_MAX) || base.name,
  };
  if (typeof d.tagline === 'string') out.tagline = d.tagline.slice(0, 40);
  for (const [key, options] of Object.entries(STYLE_OPTIONS)) {
    out[key] = options.some(([value]) => value === d[key]) ? d[key] : base[key];
  }
  out.colors = {};
  for (const slot of COLOR_SLOTS) {
    const c = d.colors?.[slot];
    out.colors[slot] = typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : base.colors[slot];
  }
  return out;
}

/**
 * A random (but tasteful: swatch colours only) design. `random` returns 0..1.
 * Unlockables are only used if listed in `unlocked` (ids like 'hat:viking').
 */
export function randomCharacter(random = Math.random, name = 'Wanderer', unlocked = []) {
  const pick = list => list[Math.floor(random() * list.length)];
  const design = { id: 'random', name };
  for (const [key, options] of Object.entries(STYLE_OPTIONS)) {
    design[key] = pick(options.filter(([value]) => !isUnlockable(key, value) || unlocked.includes(`${key}:${value}`)))[0];
  }
  design.colors = Object.fromEntries(COLOR_SLOTS.map(slot => [slot, pick(SWATCHES[slot])]));
  return normalizeCharacter(design);
}

/** Are two designs the same look (ignoring id / name)? */
export function sameLook(a, b) {
  return Object.keys(STYLE_OPTIONS).every(k => a[k] === b[k]) && COLOR_SLOTS.every(s => a.colors[s] === b.colors[s]);
}

// ---------------------------------------------------------------------------
// Saved designs (localStorage)
// ---------------------------------------------------------------------------
export const STORAGE_KEY = 'platformer.characters.v1';
export const MAX_SAVED = 12;

const defaultStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

/**
 * Character storage: the player's saved designs, an unsaved draft (work in progress
 * from the editor is never lost) and which character is selected.
 *   const store = createCharacterStore();          // localStorage (or memory when unavailable)
 *   store.all()            → [...DEFAULT_CHARACTERS, ...saved]
 *   store.save(design)     → saved copy (new id if it is not one of ours yet)
 *   store.remove(id), store.select(id), store.selected()
 *   store.draft(), store.setDraft(design | null)   — the draft has id 'draft'
 */
export const DRAFT_ID = 'draft';
export function createCharacterStore(storage = defaultStorage()) {
  let memory = null;
  const read = () => {
    try {
      const raw = storage ? storage.getItem(STORAGE_KEY) : memory;
      const data = raw ? JSON.parse(raw) : null;
      const saved = Array.isArray(data?.saved) ? data.saved.slice(0, MAX_SAVED).map(d => normalizeCharacter(d)).filter(d => d.id !== DRAFT_ID) : [];
      const draft = data?.draft ? { ...normalizeCharacter(data.draft), id: DRAFT_ID } : null;
      const unlocked = Array.isArray(data?.unlocked) ? data.unlocked.filter(id => LOCKED_VALUES.has(id)) : [];
      return { saved, draft, unlocked, selected: typeof data?.selected === 'string' ? data.selected : DEFAULT_CHARACTERS[0].id };
    } catch {
      return { saved: [], draft: null, unlocked: [], selected: DEFAULT_CHARACTERS[0].id };
    }
  };
  const write = data => {
    const raw = JSON.stringify(data);
    try {
      if (storage) storage.setItem(STORAGE_KEY, raw);
      else memory = raw;
    } catch (error) {
      memory = raw; // storage full / blocked: keep it for this session
      console.warn?.('Could not save characters:', error);
    }
  };
  const isDefault = id => DEFAULT_CHARACTERS.some(c => c.id === id);

  return {
    defaults: DEFAULT_CHARACTERS,
    saved: () => read().saved,
    all: () => [...DEFAULT_CHARACTERS, ...read().saved],
    get(id) { return this.all().find(c => c.id === id) || null; },
    isDefault,
    /** Save a design. Designs that aren't saved yet (or are defaults) get a fresh id. */
    save(design) {
      const data = read();
      const copy = normalizeCharacter(design);
      const index = data.saved.findIndex(c => c.id === copy.id);
      if (index === -1 || isDefault(copy.id)) {
        if (data.saved.length >= MAX_SAVED) throw new Error(`You can keep up to ${MAX_SAVED} designs — delete one first.`);
        copy.id = `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
        delete copy.tagline;
        data.saved.push(copy);
      } else {
        data.saved[index] = copy;
      }
      write(data);
      return copy;
    },
    remove(id) {
      const data = read();
      data.saved = data.saved.filter(c => c.id !== id);
      if (data.selected === id) data.selected = DEFAULT_CHARACTERS[0].id;
      write(data);
    },
    select(id) {
      const data = read();
      data.selected = id;
      write(data);
    },
    /** The selected character (falls back to Pip if it was deleted). */
    selected() {
      const { selected, draft } = read();
      if (selected === DRAFT_ID && draft) return draft;
      return this.get(selected) || DEFAULT_CHARACTERS[0];
    },
    draft: () => read().draft,
    /** Ids of the unlockables won so far, in the order they were won. */
    unlocked: () => read().unlocked,
    isUnlocked(slot, value) { return !isUnlockable(slot, value) || read().unlocked.includes(`${slot}:${value}`); },
    unlock(id) {
      const data = read();
      if (!LOCKED_VALUES.has(id) || data.unlocked.includes(id)) return false;
      data.unlocked.push(id);
      write(data);
      return true;
    },
    /** Give an unlockable away (a trade): it's locked again. */
    relinquish(id) {
      const data = read();
      if (!data.unlocked.includes(id)) return false;
      data.unlocked = data.unlocked.filter(x => x !== id);
      write(data);
      return true;
    },
    /** A random unlockable not won yet (null once everything is won). */
    nextUnlock(random = Math.random) {
      const won = new Set(read().unlocked);
      const left = UNLOCKABLES.filter(u => !won.has(u.id));
      return left.length ? left[Math.floor(random() * left.length)] : null;
    },
    /**
     * The reward for beating a boss: a rarity rolled from the region's row of DROP_TABLE
     * (a capstone rolls the next row), then an item of that rarity not won yet. If every
     * item of that rarity is won, the next rarer one is tried, then the next commoner one.
     */
    rollReward(random = Math.random, { region = 0, capstone = false } = {}) {
      const row = DROP_TABLE[Math.max(0, Math.min(DROP_TABLE.length - 1, region + (capstone ? 1 : 0)))];
      let roll = random(), rarity = Object.keys(row).at(-1);
      for (const [r, p] of Object.entries(row)) { if ((roll -= p) <= 0) { rarity = r; break; } }
      const won = new Set(read().unlocked);
      const start = RARITIES.indexOf(rarity);
      const order = [start, ...RARITIES.map((_, i) => i).filter(i => i > start), ...RARITIES.map((_, i) => i).filter(i => i < start).reverse()];
      for (const i of order) {
        const left = UNLOCKABLES.filter(u => u.rarity === RARITIES[i] && !won.has(u.id));
        if (left.length) return left[Math.floor(random() * left.length)];
      }
      return null;
    },
    setDraft(design) {
      const data = read();
      data.draft = design ? { ...normalizeCharacter(design), id: DRAFT_ID } : null;
      if (!data.draft && data.selected === DRAFT_ID) data.selected = DEFAULT_CHARACTERS[0].id;
      write(data);
    },
  };
}
