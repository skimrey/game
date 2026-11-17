/**
 * Blade Duel — a sword fight in three heights (a boss or checkpoint game, and the duel
 * an NPC challenges you to on a quest).
 *
 * The foe winds up a strike — high, middle or low — and shows where it's coming (its
 * blade glints at that height). Move your blade there: hold ↑ (or W) to guard high,
 * ↓ (or S) to guard low, nothing to guard the middle. Meet the strike and it's blocked
 * (clang!) — the foe staggers for a moment: press Space to PARRY and riposte. Three
 * parries win the duel. Guard the wrong height and the strike lands (a heart). Swinging
 * at nothing (Space while the foe isn't staggered) throws you off balance for a moment.
 *
 * Later duels are quicker: shorter wind-ups, feints (the glint jumps to another height
 * halfway through — the wind-up is stretched so there's always time to follow it),
 * two-strike combos and a narrower window to parry.
 */
import { baseGame, tick, good, wrong, hurt, hitBoss, UP_KEYS, DOWN_KEYS } from '../kit/common.js';

export const PARRY = {
  heights: ['high', 'mid', 'low'],
  heroX: 104, foeX: 214, ground: 150,
  offBalance: 0.5,       // s you can't parry after swinging at nothing
  recover: 0.7,          // s the foe needs after landing a hit
  reel: 0.9,             // s the foe reels after a parry
  feintAt: 0.55,         // share of the wind-up at which a feint switches height
  feintStretch: 0.25,    // … and the wind-up gets this much longer (time to follow the switch: 70 % of a wind-up)
  quick: 0.75,           // a combo's second strike winds up this much faster
};
const PARRY_KEYS = ['Space', 'Enter', 'KeyJ', 'KeyX'];

export const parry = {
  id: 'parry',
  name: 'Blade Duel',
  controls: 'guard+parry',
  roles: ['checkpoint', 'boss'],
  rules: boss => [
    'The foe winds up a strike — <strong>high, middle or low</strong> — its blade glints where it’s coming.',
    'Move your blade there: <strong>hold ↑</strong> (W) to guard high, <strong>hold ↓</strong> (S) to guard low, <strong>nothing</strong> to guard the middle.',
    'A blocked strike staggers the foe: press <strong>Space</strong> right then to <strong>parry</strong>! Swinging at nothing throws you off balance.',
    `A strike you don’t block costs a heart. <strong>Parry ${boss.hp} times</strong> within <strong>${boss.time} seconds</strong> to win.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const P = PARRY;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'parry',
      stance: 'mid',
      offBalance: 0,
      foe: { phase: 'rest', t: 0.9, target: 'mid', feint: false, feinted: false, combo: false, length: 0, swing: 0 },
      clash: 0,              // s of clang flash left (where: the blocked height)
      clashAt: 'mid',
      parries: 0,
      blocks: 0,
      riposte: 0,            // s of the riposte thrust left (drawing)
      feintFlash: 0,         // s since a feint switched height (drawing)
      lastHit: null,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (!PARRY_KEYS.includes(code)) return UP_KEYS.includes(code) || DOWN_KEYS.includes(code) ? 'guard' : null;
        if (this.foe.phase === 'stagger' && this.offBalance <= 0) {
          this.parries++;
          good(this, { parry: true });
          this.events.push({ type: 'parry' });
          hitBoss(this);
          this.foe.phase = 'reel'; this.foe.t = P.reel;
          this.riposte = 0.35;
          return 'parry';
        }
        this.offBalance = P.offBalance;
        wrong(this, { whiff: true });
        return 'whiff';
      },

      /** A height to strike at: high and low twice as often as the middle (the resting guard); never `not`. */
      pickHeight(not = null) {
        const options = P.heights.filter(h => h !== not), weights = options.map(h => (h === 'mid' ? 1 : 2));
        let roll = this.rng() * weights.reduce((a, b) => a + b, 0);
        return options.find((_, i) => (roll -= weights[i]) <= 0) || options.at(-1);
      },

      /** A new strike: pick a height and maybe a feint (a combo's quick second strike never comes at the same height). */
      windUp(quick = false) {
        const f = this.foe;
        f.target = this.pickHeight(quick ? f.target : null);
        f.feint = !quick && this.rng() < this.boss.feint;
        f.feinted = false;
        f.base = this.boss.windup * (quick ? P.quick : 1);
        f.length = f.base * (f.feint ? 1 + P.feintStretch : 1);
        f.t = f.length;
        f.phase = 'windup';
        f.quick = quick;
        this.bossAttack = 0;
      },

      step(dt) {
        const state = tick(this, dt);
        this.clash = Math.max(0, this.clash - dt);
        this.riposte = Math.max(0, this.riposte - dt);
        this.feintFlash = Math.max(0, this.feintFlash - dt);
        if (state !== 'play') return;
        this.offBalance = Math.max(0, this.offBalance - dt);
        this.stance = UP_KEYS.some(k => this.held.has(k)) ? 'high' : DOWN_KEYS.some(k => this.held.has(k)) ? 'low' : 'mid';
        const f = this.foe;
        f.t -= dt;
        f.swing = Math.max(0, f.swing - dt);
        if (f.phase === 'windup') {
          // a feint: halfway through, the blade switches to another height
          if (f.feint && !f.feinted && f.t <= f.length - f.base * P.feintAt) {
            f.target = this.pickHeight(f.target);
            f.feinted = true;
            this.feintFlash = 0.35;
            this.events.push({ type: 'feint', target: f.target });
          }
          if (f.t <= 0) {
            f.swing = 0.25;
            this.bossAttack = 0.3;
            if (this.stance === f.target) {
              this.blocks++;
              this.clash = 0.3; this.clashAt = f.target;
              good(this, { block: true });
              this.events.push({ type: 'block', at: f.target });
              if (!f.quick && this.rng() < this.boss.combo) this.windUp(true);          // a second, quicker strike
              else { f.phase = 'stagger'; f.t = this.boss.window; }
            } else {
              this.lastHit = f.target;
              hurt(this, { strike: f.target });
              f.phase = 'recover'; f.t = P.recover;
            }
          }
        } else if (f.t <= 0) {
          if (f.phase === 'rest') this.windUp();
          else {                                   // stagger ran out (no parry), or recovered / reeled: a breather
            if (f.phase === 'stagger') this.events.push({ type: 'recovered' });
            f.t = this.boss.rest * (f.phase === 'stagger' ? 0.6 : 0.8 + 0.4 * this.rng());
            f.phase = 'rest';
          }
        }
      },
    });
    return g;
  },

  /** Guards wherever the glint is; parries as soon as the foe staggers. */
  bot({ lead = 0 } = {}) {
    return g => {
      const f = g.foe;
      const want = f.phase === 'windup' ? f.target : 'mid';
      const up = want === 'high', down = want === 'low';
      for (const k of ['ArrowUp', 'ArrowDown']) g.held.delete(k);
      if (up) g.held.add('ArrowUp');
      if (down) g.held.add('ArrowDown');
      if (f.phase === 'stagger' && f.t > lead * 0.5 && g.offBalance <= 0) g.press('Space');
    };
  },
};
