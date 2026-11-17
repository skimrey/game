/**
 * The Ring's computer player: a command for each of a side's monsters.
 *
 * Every usable move and target gets a score: the share of the target's health it would take
 * (more for a knock-out, for hitting a type it's strong against, for burns, stuns and
 * poison on healthy foes), healing and shields when an ally is hurt, buffs and roars early
 * in the fight, Guard when about to go down, a taunt to cover a hurt friend. The best scoring
 * command wins — except that, with probability (1 − skill), a tamer just picks something (low
 * tiers are sloppy on purpose). Deterministic for a given rng.
 *
 *   const commands = chooseCommands(battle, side, { skill, rng });
 */
import { alive, commandsFor, targetsFor, damageOf, resolveRound } from './battle.js';

function score(b, u, move, t) {
  const foes = alive(b, 1 - u.side), allies = alive(b, u.side);
  const hurt = x => 1 - x.hp / x.maxHp;
  const dmgShare = (target, power) => Math.min(1, (damageOf(u, target, power) + target.st.shield * 0) / Math.max(1, target.hp + target.st.shield));
  const attack = (target, power) => {
    const share = dmgShare(target, power);
    return share + (share >= 0.99 ? 0.6 : 0) + (target.st.guard ? -0.2 : 0);
  };
  let v = 0;
  switch (move.target) {
    case 'foe': {
      if (!t) return -1;
      let power = move.power + (move.crescendo ? move.crescendo * u.st.crescendo : 0);
      if (move.mimic) power = Math.max(power, (b.lastMove[1 - u.side]?.power || 0));
      v = attack(t, power);
      if (move.burn && !t.st.burn) v += move.burn * 0.25;
      if (move.stun) v += move.stun * 0.3;
      if (move.drain) v += Math.min(hurt(u), 0.4) * move.drain;
      if (move.debuff) v += 0.1;
      if (move.rest) v -= 0.25;
      if (move.priority && t.hp <= damageOf(u, t, power)) v += 0.3;
      break;
    }
    case 'randomFoes': v = foes.reduce((a, f) => a + attack(f, move.power) * (move.hits || 1), 0) / Math.max(1, foes.length); break;
    case 'allFoes':
      v = move.power > 0 ? foes.reduce((a, f) => a + attack(f, move.power), 0) : 0;
      if (move.poison) v += foes.filter(f => !f.st.poison).length * 0.22;
      if (move.freeze) v += foes.length * move.freeze * 0.25;
      if (move.debuff) v += b.round <= 3 ? foes.length * 0.14 : 0.1;
      if (move.allyBuff) v += b.round <= 3 ? allies.length * 0.1 : 0.06;
      break;
    case 'ally':
      if (!t) return -1;
      if (move.heal) v = hurt(t) > 0.35 ? hurt(t) * 1.1 : 0;
      if (move.shield) v = hurt(t) > 0.3 ? 0.35 + hurt(t) * 0.4 : 0.12;
      if (move.cleanse && (t.st.burn || t.st.poison)) v += 0.3;
      break;
    case 'allAllies':
      if (move.shield) v = allies.reduce((a, x) => a + (hurt(x) > 0.2 ? 0.2 : 0.08), 0);
      if (move.buff) v = b.round <= 3 ? allies.length * 0.15 : 0.12;
      if (move.allyHeal) v += allies.reduce((a, x) => a + Math.min(hurt(x), move.allyHeal), 0);
      break;
    case 'self':
      if (move.guard) v = hurt(u) > 0.7 ? 0.35 : 0.02;
      if (move.counter) v = 0.3;
      if (move.taunt) v = allies.some(x => x !== u && hurt(x) > 0.5) && hurt(u) < 0.4 ? 0.5 : 0.12;
      if (move.thorns) v = b.round <= 3 ? 0.4 : 0.2;
      break;
    default: break;
  }
  return v;
}

/** Commands for every monster standing on `side`. */
export function chooseCommands(b, side, { skill = 1, rng = Math.random } = {}) {
  return alive(b, side).map(u => {
    const options = [];
    for (const move of commandsFor(b, u)) {
      const targets = targetsFor(b, u, move);
      if (move.target === 'foe' || move.target === 'ally') for (const t of targets) options.push({ move, t });
      else options.push({ move, t: null });
    }
    let pick;
    if (rng() > skill) pick = options[Math.floor(rng() * options.length)];
    else {
      let best = -Infinity;
      for (const o of options) { const v = score(b, u, o.move, o.t) + rng() * 0.05; if (v > best) { best = v; pick = o; } }
    }
    return { side, slot: u.slot, move: pick.move.id, target: pick.t ? pick.t.slot : null };
  });
}

/** A whole battle with the computer on both sides (tests, balance). */
export function autoBattle(b, skills = [1, 1], rngs = [Math.random, Math.random]) {
  for (let i = 0; i < 60 && b.result === null; i++) {
    const cmds = [...chooseCommands(b, 0, { skill: skills[0], rng: rngs[0] }), ...chooseCommands(b, 1, { skill: skills[1], rng: rngs[1] })];
    resolveRound(b, cmds);                    // both sides chose without seeing the other's commands
  }
  return b;
}
