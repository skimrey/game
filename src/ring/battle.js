/**
 * The Ring — a turn-based battle of two squads of three monsters (pure, deterministic; no DOM).
 *
 * Like a party fight in an old RPG: each round every monster gets one command (a move and, if
 * it needs one, a target). Both sides choose, then everything happens in speed order — moves
 * with priority first (Guard, Riposte, Quick Draw), then the fastest. A monster at 0 HP is out;
 * the side with monsters standing at the end wins.
 *
 *   damage   power × attack / (attack + defence) × a level factor × type effectiveness
 *            (×1.5 super effective, ×0.67 not very) × a little luck; Guard halves it, a
 *            shield soaks it
 *   status   burn and poison hurt at the end of each round; frozen or stunned monsters lose a
 *            turn; buffs and debuffs (attack, defence, speed) last three rounds; a taunting
 *            monster draws every single-target attack; Riposte parries a hit and strikes back
 *   moves    monsters.js: a basic attack, a signature move from the game it was fought in, a
 *            move from its body, Guard — the bigger ones need a few rounds to come back
 *
 *   const b = createBattle({ squads: [myMonsters, theirMonsters], seed });
 *   commandsFor(b, unit) · targetsFor(b, unit, move) · resolveRound(b, commands) → events
 *   b.result: null (on) · 0 / 1 (that side won) · 'draw'
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { statsOf, movesOf, effectiveness } from './monsters.js';

export const BATTLE_RULES = { maxRounds: 30, miss: 0.05, crit: 0.1, burn: 0.07, poison: 0.09, guard: 0.5, buff: 1.3, debuff: 0.72, buffRounds: 3, poisonRounds: 3, burnRounds: 3, thornsBurn: 2 };

export function createBattle({ squads, seed = 1 }) {
  const rng = mulberry32(hashSeed('ring', seed));
  const units = squads.map((squad, side) => squad.slice(0, 3).map((mon, slot) => {
    const stats = statsOf(mon);
    return {
      side, slot, mon, type: mon.type, level: mon.level, stats, moves: movesOf(mon), hp: stats.hp, maxHp: stats.hp, cd: {},
      st: { burn: 0, poison: 0, freeze: 0, stun: false, shield: 0, taunt: 0, thorns: 0, counter: false, guard: false, rest: false, crescendo: 0, mods: {} },
    };
  }));
  return { rng, round: 1, units, result: null, events: [], lastMove: [null, null], log: [] };
}

export const alive = (b, side) => b.units[side].filter(u => u.hp > 0);
export const unitAt = (b, side, slot) => b.units[side][slot];
const mod = (u, stat) => { const m = u.st.mods[stat]; return m && m.t > 0 ? m.k : 1; };
export const speedOf = u => u.stats.spd * mod(u, 'spd');

/** The moves a monster can use this round. */
export function commandsFor(b, u) {
  if (u.hp <= 0) return [];
  return u.moves.filter(m => !(u.cd[m.id] > 0));
}
/** Who a move can be aimed at ([] if it picks its own targets). */
export function targetsFor(b, u, move) {
  if (move.target === 'foe') {
    const foes = alive(b, 1 - u.side);
    const taunting = foes.filter(f => f.st.taunt > 0);
    return taunting.length ? taunting : foes;
  }
  if (move.target === 'ally') return alive(b, u.side);
  return [];
}

/** The damage of a hit (no luck): for the screen's hints and the computer player. */
export function damageOf(attacker, target, power, type = attacker.type) {
  const atk = attacker.stats.atk * mod(attacker, 'atk'), def = target.stats.def * mod(target, 'def');
  return power * (atk / (atk + def)) * (24 + attacker.level * 1.8) * effectiveness(type, target.type);
}

function hit(b, u, t, power, move) {
  if (t.hp <= 0) return 0;
  const eff = effectiveness(u.type, t.type);
  // faster monsters are harder to hit
  const dodge = BATTLE_RULES.miss + 0.1 * Math.max(0, Math.min(1, speedOf(t) / Math.max(1, speedOf(u)) - 1));
  if (b.rng() < dodge) { b.events.push({ type: 'miss', side: u.side, slot: u.slot, tside: t.side, tslot: t.slot }); return 0; }
  const crit = b.rng() < BATTLE_RULES.crit;
  let dmg = damageOf(u, t, power) * (0.85 + b.rng() * 0.3) * (crit ? 1.5 : 1);
  if (crit) b.events.push({ type: 'crit', side: t.side, slot: t.slot });
  if (t.st.guard) dmg *= BATTLE_RULES.guard;
  if (t.st.counter) {                                         // Riposte: half the hit, all of it back
    dmg *= 0.5;
    t.st.counter = false;
    const back = Math.max(1, Math.round(damageOf(t, u, 1.5)));
    b.events.push({ type: 'parry', side: t.side, slot: t.slot });
    applyDamage(b, u, back, { from: t, counter: true });
  }
  dmg = Math.max(1, Math.round(dmg));
  b.events.push({ type: 'hit', side: u.side, slot: u.slot, tside: t.side, tslot: t.slot, move: move.id, eff });
  applyDamage(b, t, dmg, { from: u, eff });
  if (t.st.thorns > 0 && u.hp > 0 && !u.st.burn) { u.st.burn = BATTLE_RULES.thornsBurn; b.events.push({ type: 'status', side: u.side, slot: u.slot, status: 'burn' }); }
  return dmg;
}
function applyDamage(b, t, dmg, { from = null, eff = 1, counter = false } = {}) {
  if (t.hp <= 0) return;
  if (t.st.shield > 0) {
    const soak = Math.min(t.st.shield, dmg);
    t.st.shield -= soak; dmg -= soak;
    if (soak) b.events.push({ type: 'shieldHit', side: t.side, slot: t.slot, n: soak });
  }
  t.hp = Math.max(0, t.hp - dmg);
  b.events.push({ type: 'damage', side: t.side, slot: t.slot, n: dmg, eff, counter, hp: t.hp });
  if (t.hp <= 0) b.events.push({ type: 'ko', side: t.side, slot: t.slot });
}
function heal(b, t, n) {
  if (t.hp <= 0) return;
  const before = t.hp;
  t.hp = Math.min(t.maxHp, t.hp + Math.round(n));
  if (t.hp > before) b.events.push({ type: 'heal', side: t.side, slot: t.slot, n: t.hp - before, hp: t.hp });
}
function setMod(b, t, stat, k) {
  t.st.mods[stat] = { k, t: BATTLE_RULES.buffRounds };
  b.events.push({ type: k > 1 ? 'buff' : 'debuff', side: t.side, slot: t.slot, stat });
}
function status(b, t, name, chance = 1) {
  if (t.hp <= 0 || b.rng() >= chance) return;
  if (name === 'burn') t.st.burn = BATTLE_RULES.burnRounds;
  else if (name === 'poison') t.st.poison = BATTLE_RULES.poisonRounds;
  else if (name === 'freeze') t.st.freeze = 1;
  else if (name === 'stun') t.st.stun = true;
  b.events.push({ type: 'status', side: t.side, slot: t.slot, status: name });
}

/** Carry out one command. */
function act(b, u, cmd) {
  let move = u.moves.find(m => m.id === cmd.move) || u.moves[0];
  if (u.cd[move.id] > 0) move = u.moves[0];
  if (move.cooldown) u.cd[move.id] = move.cooldown + 1;
  const foes = () => alive(b, 1 - u.side);
  const pickFoe = () => { const list = targetsFor(b, u, { target: 'foe' }); return list[Math.floor(b.rng() * list.length)] || null; };
  b.events.push({ type: 'move', side: u.side, slot: u.slot, move: move.id, name: move.name });
  // Mimic: the last move the other side used (if it was an attack)
  if (move.mimic) {
    const last = b.lastMove[1 - u.side];
    if (last && last.power > 0 && !last.mimic) { b.events.push({ type: 'mimic', side: u.side, slot: u.slot, name: last.name }); move = { ...last, cooldown: 0, priority: 0, mimicked: true }; }
  }
  let power = move.power;
  if (move.crescendo) { power += move.crescendo * u.st.crescendo; u.st.crescendo++; }
  const t0 = cmd.target !== null && cmd.target !== undefined ? unitAt(b, move.target === 'ally' ? u.side : 1 - u.side, cmd.target) : null;
  switch (move.target) {
    case 'foe': {
      let t = t0 && t0.hp > 0 && targetsFor(b, u, move).includes(t0) ? t0 : pickFoe();
      if (!t) break;
      const dmg = hit(b, u, t, power, move);
      if (move.drain && dmg) heal(b, u, dmg * move.drain);
      if (move.burn) status(b, t, 'burn', move.burn);
      if (move.stun) status(b, t, 'stun', move.stun);
      if (move.debuff) setMod(b, t, move.debuff, BATTLE_RULES.debuff);
      if (move.bounce && t.hp <= 0) { const next = pickFoe(); if (next) { b.events.push({ type: 'bounce', side: u.side, slot: u.slot }); hit(b, u, next, move.bounce, move); } }
      if (move.rest) u.st.rest = true;
      break;
    }
    case 'randomFoes':
      for (let k = 0; k < (move.hits || 1); k++) { const t = pickFoe(); if (!t) break; hit(b, u, t, power, move); }
      break;
    case 'allFoes':
      for (const t of foes()) {
        if (power > 0) hit(b, u, t, power, move);
        if (move.freeze) status(b, t, 'freeze', move.freeze);
        if (move.poison) status(b, t, 'poison', move.poison);
        if (move.debuff) setMod(b, t, move.debuff, BATTLE_RULES.debuff);
      }
      break;
    case 'ally': {
      const t = t0 && t0.hp > 0 ? t0 : alive(b, u.side).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (!t) break;
      if (move.heal) heal(b, t, t.maxHp * move.heal);
      if (move.shield) { t.st.shield += Math.round(t.maxHp * move.shield); b.events.push({ type: 'shield', side: t.side, slot: t.slot }); }
      if (move.cleanse && (t.st.burn || t.st.poison)) { t.st.burn = 0; t.st.poison = 0; b.events.push({ type: 'cleanse', side: t.side, slot: t.slot }); }
      break;
    }
    case 'allAllies':
      for (const t of alive(b, u.side)) {
        if (move.shield) { t.st.shield += Math.round(t.maxHp * move.shield); b.events.push({ type: 'shield', side: t.side, slot: t.slot }); }
        if (move.buff) setMod(b, t, move.buff, BATTLE_RULES.buff);
      }
      break;
    case 'self':
      if (move.guard) { u.st.guard = true; b.events.push({ type: 'guard', side: u.side, slot: u.slot }); }
      if (move.counter) { u.st.counter = true; b.events.push({ type: 'riposte', side: u.side, slot: u.slot }); }
      if (move.buff) setMod(b, u, move.buff, BATTLE_RULES.buff);
      if (move.thorns) u.st.thorns = BATTLE_RULES.buffRounds;
      if (move.taunt) { u.st.taunt = 2; b.events.push({ type: 'taunt', side: u.side, slot: u.slot }); }
      if (move.heal) heal(b, u, u.maxHp * move.heal);
      if (move.shield) { u.st.shield += Math.round(u.maxHp * move.shield); b.events.push({ type: 'shield', side: u.side, slot: u.slot }); }
      break;
    default: break;
  }
  if (move.allyBuff) for (const t of alive(b, u.side)) setMod(b, t, move.allyBuff, BATTLE_RULES.buff);
  if (move.allyHeal) for (const t of alive(b, u.side)) heal(b, t, t.maxHp * move.allyHeal);
  if (move.power > 0 && !move.mimicked) b.lastMove[u.side] = move;
}

/**
 * Play a round: `commands` is a list of { side, slot, move, target } — one for every monster
 * still standing (missing ones Guard). Returns the round's events (also left in b.events).
 */
export function resolveRound(b, commands) {
  if (b.result !== null) return [];
  b.events = [{ type: 'round', round: b.round }];
  const all = [0, 1].flatMap(side => alive(b, side).map(u => {
    const c = commands.find(x => x.side === side && x.slot === u.slot) || { side, slot: u.slot, move: 'guard', target: null };
    const move = u.moves.find(m => m.id === c.move) || u.moves[0];
    return { u, cmd: c, priority: move.priority || 0, speed: speedOf(u), tie: b.rng() };
  }));
  all.sort((a, c) => c.priority - a.priority || c.speed - a.speed || a.tie - c.tie);
  for (const { u, cmd } of all) {
    if (b.result !== null) break;
    if (u.hp <= 0) continue;
    if (u.st.rest) { u.st.rest = false; b.events.push({ type: 'rest', side: u.side, slot: u.slot }); continue; }
    if (u.st.freeze > 0) { u.st.freeze--; b.events.push({ type: 'frozen', side: u.side, slot: u.slot }); continue; }
    if (u.st.stun) { u.st.stun = false; b.events.push({ type: 'stunned', side: u.side, slot: u.slot }); continue; }
    act(b, u, cmd);
    checkResult(b);
  }
  // the end of the round: burns and poison, timers, cooldowns
  if (b.result === null) {
    for (const side of [0, 1]) for (const u of alive(b, side)) {
      if (u.st.burn > 0) { u.st.burn--; b.events.push({ type: 'burnTick', side, slot: u.slot }); applyDamage(b, u, Math.max(1, Math.round(u.maxHp * BATTLE_RULES.burn))); }
      if (u.hp > 0 && u.st.poison > 0) { u.st.poison--; b.events.push({ type: 'poisonTick', side, slot: u.slot }); applyDamage(b, u, Math.max(1, Math.round(u.maxHp * BATTLE_RULES.poison))); }
    }
    checkResult(b);
  }
  for (const side of [0, 1]) for (const u of b.units[side]) {
    u.st.guard = false; u.st.counter = false;
    if (u.st.taunt > 0) u.st.taunt--;
    if (u.st.thorns > 0) u.st.thorns--;
    for (const m of Object.values(u.st.mods)) m.t--;
    for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
  }
  b.log.push(b.events);
  b.round++;
  if (b.result === null && b.round > BATTLE_RULES.maxRounds) {
    const share = side => alive(b, side).reduce((a, u) => a + u.hp / u.maxHp, 0);
    b.result = share(0) > share(1) ? 0 : share(1) > share(0) ? 1 : 'draw';
    b.events.push({ type: 'end', result: b.result, timeout: true });
  }
  return b.events;
}

function checkResult(b) {
  if (b.result !== null) return;
  const a = alive(b, 0).length, c = alive(b, 1).length;
  if (a && c) return;
  b.result = !a && !c ? 'draw' : a ? 0 : 1;
  b.events.push({ type: 'end', result: b.result });
}
