/**
 * The player's profile — what lasts between runs (everything else is the roguelite run):
 *
 *   heroClass    the class chosen at the portal last time (progression/spells.js)
 *   runs         runs finished; bestStars
 *   pets         adopted pets (characters/pets.js designs) and which one comes along (activePet)
 *   decor        home decorations won by finishing runs (town/decor.js), and where they stand
 *   villagers    the seed for the town square's villagers (new faces after every run)
 *   homeVisited  the first visit to the home (the adoption basket)
 *   cards, decks, cardFaction, cardTier, tierBeaten, cardWins, kingBeaten
 *                Riftcards: your collection, a deck per faction, the faction you play, the ladder
 *                tier (0 Novice … 5 Champion, 6 = all cleared) and who you've beaten at it
 *   monsters, squad   the bosses you've befriended (ring/monsters.js) and the three you take to the Ring
 *   ringTier, ringBeaten, ringWins   the Ring's ladder (0 Rookie … 4 Champion, 5 = all cleared)
 *   gold         earned on runs, at the inn's challenge board (innPaid: won since the last run) and
 *                in the Ring; spent at the tailor
 *   tailoring    the tailor's work: patterns on clothes you own, trail colours (characters/tailoring.js)
 *   arcade       the home arcade's records per mini-game
 *   story        story beats already told (progression/story.js); tutorialDone: the gentle first run is over
 *   settings     music / effects volume, mute, reduced motion, assist mode
 *   run          the run in progress (runSave.js): resume it from the portal
 *
 * Plain JSON in localStorage (memory when it's unavailable), like the character store.
 * No DOM — tests run it in Node with a fake storage.
 */
export const PROFILE_KEY = 'platformer.profile.v1';

const DEFAULTS = () => ({
  heroClass: null, runs: 0, bestStars: 0, pets: [], activePet: null, decor: [], villagers: 1, homeVisited: false, trades: 0, questsDone: 0,
  cards: {}, decks: {}, cardFaction: null, cardTier: 0, tierBeaten: [], cardWins: 0, kingBeaten: false, cardsVersion: 2,   // Riftcards (cards/)
  monsters: [], squad: null, ringTier: 0, ringBeaten: [], ringWins: 0,     // the ranch and the Ring (ring/)
  gold: 0, innRun: -1, innPaid: [], tailoring: {},                                      // gold; the inn's board (challenges paid out this visit)
  arcade: {},                                                              // the home arcade: mode → { plays, wins, best }
  met: [],                                                                 // mini-games met on runs (the arcade can play them)
  games: {},                                                               // how each mini-game went on runs: mode → { won, lost } (local play stats)
  story: { seen: [] },                                                     // story beats already told (progression/story.js)
  settings: { music: 0.6, sfx: 0.8, muted: false, reducedMotion: false, assist: false },
  townVisits: 0,                                                           // each return to town brings new card battlers
  tutorialDone: false,                                                     // the first run is a gentle one (progression/story.js)
  run: null,                                                               // a run in progress (runSave.js) — resume it from town
});

const defaultStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function createProfile(storage = defaultStorage()) {
  /** A ladder: three different opponents beaten at your tier → the next tier (up to `top`). */
  const climb = (tierKey, beatenKey, winsKey, top, key, tier) => {
    let tierUp = false;
    const d = update(x => {
      x[winsKey] = (x[winsKey] || 0) + 1;
      if (tier !== x[tierKey] || x[tierKey] >= top) return;
      if (!x[beatenKey].includes(key)) x[beatenKey].push(key);
      if (x[beatenKey].length >= 3) { x[tierKey]++; x[beatenKey] = []; tierUp = true; }
    });
    return { tier: d[tierKey], tierUp, beaten: d[beatenKey].length };
  };
  let memory = null;
  const read = () => {
    try {
      const raw = storage ? storage.getItem(PROFILE_KEY) : memory;
      const data = raw ? JSON.parse(raw) : {};
      const out = { ...DEFAULTS(), ...(data && typeof data === 'object' ? data : {}) };
      if (!Array.isArray(out.pets)) out.pets = [];
      if (!Array.isArray(out.met)) out.met = [];
      if (!Array.isArray(out.decor)) out.decor = [];
      if (data && data.cardsVersion !== 2 && Object.keys(data).length) {
        // Riftcards 1 (lanes and hearts) → 2 (rows and rounds): a fresh collection, the same standing
        out.cardTier = Math.min(5, data.cardRank || 0);
        out.cards = {}; out.decks = {}; out.cardFaction = null; out.tierBeaten = []; out.cardsVersion = 2;
        delete out.deck; delete out.cardRank;
      }
      if (!Array.isArray(out.tierBeaten)) out.tierBeaten = [];
      for (const key of ['monsters', 'ringBeaten', 'innPaid']) if (!Array.isArray(out[key])) out[key] = [];
      out.gold = Math.max(0, Number(out.gold) || 0);
      for (const key of ['cards', 'decks', 'arcade', 'story', 'settings', 'games', 'tailoring']) if (!out[key] || typeof out[key] !== 'object' || Array.isArray(out[key])) out[key] = DEFAULTS()[key];
      out.settings = { ...DEFAULTS().settings, ...out.settings };
      if (!Array.isArray(out.story.seen)) out.story.seen = [];
      return out;
    } catch {
      return DEFAULTS();
    }
  };
  const write = data => {
    const raw = JSON.stringify(data);
    try { if (storage) storage.setItem(PROFILE_KEY, raw); else memory = raw; } catch { memory = raw; }
  };
  const update = fn => { const data = read(); fn(data); write(data); return data; };
  return {
    get: read,
    update,
    get heroClass() { return read().heroClass; },
    setClass(id) { update(d => { d.heroClass = id; }); },
    // pets
    pets: () => read().pets,
    activePet() { const d = read(); return d.pets.find(p => p.id === d.activePet) || null; },
    adopt(pet) { update(d => { if (!d.pets.some(p => p.id === pet.id)) d.pets.push(pet); if (!d.activePet) d.activePet = pet.id; }); },
    setActivePet(id) { update(d => { d.activePet = d.pets.some(p => p.id === id) ? id : null; }); },
    renamePet(id, name) { update(d => { const p = d.pets.find(q => q.id === id); if (p && name) p.name = String(name).slice(0, 16); }); },
    // decor
    decor: () => read().decor,
    addDecor(id) { let added = false; update(d => { if (!d.decor.some(x => x.id === id)) { d.decor.push({ id, shown: true }); added = true; } }); return added; },
    toggleDecor(id) { update(d => { const x = d.decor.find(q => q.id === id); if (x) x.shown = !x.shown; }); },
    // runs
    finishRun(stars) { return update(d => { d.runs++; d.bestStars = Math.max(d.bestStars, stars); d.villagers++; }); },
    markHomeVisited() { update(d => { d.homeVisited = true; }); },
    count(key) { update(d => { d[key] = (d[key] || 0) + 1; }); },
    reset() { write(DEFAULTS()); },
    // Riftcards: the collection ({ id: count }), a deck per faction (null: build one), the faction you
    // play, and the ladder: beat three card battlers at your tier to rise (0 Novice … 5 Champion; 6: the King)
    cards: () => read().cards,
    addCards(ids) { update(d => { for (const id of ids) d.cards[id] = (d.cards[id] || 0) + 1; }); },
    faction: () => read().cardFaction,
    setFaction(f) { update(d => { d.cardFaction = f; }); },
    deckFor: f => read().decks[f] || null,
    setDeck(f, ids) { update(d => { d.decks[f] = ids ? [...ids] : null; }); },
    /** A win over card battler `key` who plays at `tier`: { tier, tierUp, beaten } (three at your tier: up you go). */
    beatBattler(key, tier) { return climb('cardTier', 'tierBeaten', 'cardWins', 6, key, tier); },
    beatKing() { update(d => { d.kingBeaten = true; }); },
    // the ranch and the Ring
    monsters: () => read().monsters,
    addMonster(mon) { let added = false; update(d => { if (!d.monsters.some(m => m.id === mon.id)) { d.monsters.push(mon); added = true; } }); return added; },
    updateMonster(mon) { update(d => { const i = d.monsters.findIndex(m => m.id === mon.id); if (i >= 0) d.monsters[i] = mon; }); },
    renameMonster(id, name) { update(d => { const m = d.monsters.find(q => q.id === id); if (m && name) m.nick = String(name).slice(0, 14); }); },
    /** The squad for the Ring: the three you picked (if you still have them) — or your three strongest. */
    squad() {
      const d = read();
      const picked = (d.squad || []).map(id => d.monsters.find(m => m.id === id)).filter(Boolean);
      if (picked.length >= 3) return picked.slice(0, 3);
      const rest = [...d.monsters].filter(m => !picked.includes(m)).sort((a, b) => b.level - a.level);
      return [...picked, ...rest].slice(0, 3);
    },
    setSquad(ids) { update(d => { d.squad = ids ? [...ids].slice(0, 3) : null; }); },
    /** A win over tamer `key` at `tier`: three different ones at your tier to rise (0 Rookie … 4 Champion; 5: all cleared). */
    beatTamer(key, tier) { return climb('ringTier', 'ringBeaten', 'ringWins', 5, key, tier); },
    // gold (cosmetics only: the tailor)
    gold: () => read().gold,
    addGold(n) { return update(d => { d.gold = Math.max(0, (d.gold || 0) + Math.round(n)); }).gold; },
    tailoring: () => read().tailoring,
    setTailoring(key, value) { update(d => { if (value) d.tailoring[key] = value; else delete d.tailoring[key]; }); },
    spendGold(n) { let ok = false; update(d => { if ((d.gold || 0) >= n) { d.gold -= n; ok = true; } }); return ok; },
    /** The inn's board: has this challenge been won since the last run? (Each pays once; new ones after a run.) */
    innPaid(key) { const d = read(); return d.innRun === d.runs && d.innPaid.includes(key); },
    payInn(key, n) { return update(d => { if (d.innRun !== d.runs) { d.innRun = d.runs; d.innPaid = []; } if (!d.innPaid.includes(key)) { d.innPaid.push(key); d.gold = (d.gold || 0) + n; } }).gold; },
    // the home arcade's records, and the games you've met
    meet(mode) { update(d => { if (!d.met.includes(mode)) d.met.push(mode); }); },
    /** How a mini-game went on a run (local play stats: which games people find hardest). */
    logGame(mode, won) { update(d => { const r = d.games[mode] || { won: 0, lost: 0 }; r[won ? 'won' : 'lost']++; d.games[mode] = r; }); },
    recordArcade(mode, { won, time }) { update(d => { const r = d.arcade[mode] || { plays: 0, wins: 0, best: null }; r.plays++; if (won) { r.wins++; r.best = r.best === null ? time : Math.min(r.best, time); } d.arcade[mode] = r; }); },
    // story beats, settings, the tutorial run
    seeStory(id) { update(d => { if (!d.story.seen.includes(id)) d.story.seen.push(id); }); },
    settings: () => read().settings,
    setSettings(patch) { return update(d => { d.settings = { ...d.settings, ...patch }; }).settings; },
    finishTutorial() { update(d => { d.tutorialDone = true; }); },
    visitTown() { return update(d => { d.townVisits = (d.townVisits || 0) + 1; }).townVisits; },
    // a run in progress (runSave.js)
    saveRun(run) { update(d => { d.run = run; }); },
    savedRun: () => read().run,
    clearRun() { update(d => { d.run = null; }); },
  };
}
