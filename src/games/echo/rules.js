/**
 * Copycat — the meadow capstone: a dance-off memory game (think Simon Says).
 *
 * The boss dances a sequence of moves — up, down, left, right — one beat at a time.
 * Then it's your turn: repeat the sequence with the arrow keys (or WASD). Every
 * correct move is a dance step of your own (and a new colour for the world); finish
 * the sequence and the boss takes a hit, then dances a longer one. A wrong move, or
 * dawdling too long, costs a heart — and the boss shows the sequence again.
 *
 * From the second time you meet this game, there's a timing check mid-fight: a marker
 * sweeps along a gauge — press Space as it crosses the green zone. Miss it and the
 * boss pulls a face, and its next dance is the same length but a brand-new order (so
 * what you memorised is no help).
 */
import { baseGame, tick, good, wrong, hurt, hitBoss, directionOf, isGameKey, labelOf } from '../kit/common.js';

export const ECHO = {
  moves: ['up', 'down', 'left', 'right'],
  gap: 0.35,            // s between the boss's moves
  inputTimeout: 3.2,    // s to make each move
  pause: 0.9,           // s between the boss's turn and yours, and after a round
  gaugeTimeout: 4,      // s to press Space on the gauge
  taunt: 1.2,           // s the boss pulls a face after a missed gauge
};

/** Where the gauge marker is (0..1) after `t` seconds at `period` seconds per sweep (back and forth). */
export function gaugeMarker(t, period) {
  const u = (t / period) % 2;
  return u < 1 ? u : 2 - u;
}

export const echo = {
  id: 'echo',
  name: 'Copycat',
  rules: boss => [
    'The boss dances a sequence of moves. <strong>Repeat it with the arrow keys</strong> (or WASD) when it’s your turn.',
    'Each correct move recolours the world; finish the sequence and the boss takes a hit — then it dances a longer one.',
    `A wrong move (or waiting too long) costs a heart and the boss shows it again. Win ${boss.hp} rounds within <strong>${boss.time} seconds</strong>.`,
    ...(boss.gaugeRounds?.length ? ['<strong>Timing check:</strong> press <strong>Space</strong> as the marker crosses the green zone. Miss, and the boss’s next dance is the same length in a brand-new order.'] : []),
  ],

  create(boss, { seed = 1 } = {}) {
    const E = ECHO;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'echo',
      sequence: [],
      phase: 'pause',       // 'show' (the boss dances) | 'input' (your turn) | 'pause'
      phaseTime: 0,
      showIndex: -1,        // move being shown
      inputIndex: 0,        // moves repeated so far
      round: 0,
      bossMove: null,       // the boss's current pose
      heroMove: null,       // the hero's current pose: { move, t }
      nextPhase: 'show',
      gauge: null,          // { zone: [from, to], t, result: null | 'hit' | 'miss' } during a timing check
      taunt: 0,             // s the boss pulls a face

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (this.phase === 'gauge') {
          if (code !== 'Space' && code !== 'Enter') return null;
          const m = gaugeMarker(this.gauge.t, this.boss.gaugePeriod);
          this.finishGauge(m >= this.gauge.zone[0] && m <= this.gauge.zone[1]);
          return this.gauge.result === 'hit' ? 'good' : 'wrong';
        }
        const move = directionOf(code);
        if (this.phase !== 'input') return null;              // watch first (keys are ignored, not wrong)
        if (code === 'Space') return null;
        if (!move) {
          if (isGameKey(code)) { this.mistake(labelOf(code)); return 'wrong'; }
          return null;
        }
        if (move === this.sequence[this.inputIndex]) {
          this.inputIndex++;
          this.heroMove = { move, t: 0.3 };
          this.phaseTime = 0;
          good(this, { move });
          if (this.inputIndex >= this.sequence.length) {
            hitBoss(this);
            this.round++;
            if (this.bossHp > 0 && this.boss.gaugeRounds?.includes(this.round)) this.startGauge();
            else {
              this.setPhase('pause', 'show');
              if (this.bossHp > 0) this.extend();
            }
          }
          return 'good';
        }
        this.mistake(move);
        return 'wrong';
      },

      mistake(label) {
        wrong(this, { key: label, want: this.sequence[this.inputIndex] });
        hurt(this);
        this.heroMove = { move: 'oops', t: 0.5 };
        if (this.result === 'playing') this.setPhase('pause', 'show');
      },

      setPhase(phase, next = null) {
        this.phase = phase;
        this.phaseTime = 0;
        this.nextPhase = next;
        if (phase === 'show') { this.showIndex = -1; this.bossMove = null; }
        if (phase === 'input') { this.inputIndex = 0; this.events.push({ type: 'yourTurn' }); }
      },

      startGauge() {
        const w = this.boss.gaugeZone;
        const from = 0.15 + this.rng() * (0.7 - w);
        this.gauge = { zone: [from, from + w], t: 0, result: null };
        this.setPhase('gauge');
        this.events.push({ type: 'gauge' });
      },

      finishGauge(hit) {
        this.gauge.result = hit ? 'hit' : 'miss';
        if (hit) {
          good(this, { gauge: true });
          this.extend();                                     // as usual: the same dance, one move longer
        } else {
          wrong(this, { gauge: true });
          this.taunt = ECHO.taunt;                           // the boss pulls a face …
          const length = this.sequence.length;               // … and dances a new order, same length
          this.sequence = [];
          for (let i = 0; i < length; i++) this.extend();
        }
        this.setPhase('pause', 'show');
      },

      extend() {
        const last = this.sequence.at(-1);
        let m;
        do { m = E.moves[Math.floor(this.rng() * 4)]; } while (m === last && this.rng() < 0.7);
        this.sequence.push(m);
      },

      step(dt) {
        const state = tick(this, dt);
        if (this.heroMove) { this.heroMove.t -= dt; if (this.heroMove.t <= 0) this.heroMove = null; }
        this.taunt = Math.max(0, this.taunt - dt);
        if (state !== 'play') { this.bossMove = null; return; }
        this.phaseTime += dt;
        if (this.phase === 'gauge') {
          this.gauge.t += dt;
          if (this.gauge.t > ECHO.gaugeTimeout) this.finishGauge(false);
          return;
        }
        const beat = this.boss.beat;
        if (this.phase === 'pause') {
          if (this.phaseTime >= E.pause) this.setPhase(this.nextPhase || 'show');
        } else if (this.phase === 'show') {
          // move i is shown from i·(beat+gap) for `beat` seconds
          const slot = beat + E.gap;
          const i = Math.floor(this.phaseTime / slot);
          const inMove = this.phaseTime - i * slot < beat;
          if (i >= this.sequence.length) { this.bossMove = null; this.setPhase('input'); return; }
          if (inMove && i !== this.showIndex) {
            this.showIndex = i;
            this.bossAttack = beat;
            this.events.push({ type: 'bossMove', move: this.sequence[i], index: i });
          }
          this.bossMove = inMove ? this.sequence[i] : null;
        } else if (this.phase === 'input') {
          if (this.phaseTime > E.inputTimeout) this.mistake('too slow');
        }
      },
    });
    for (let i = 0; i < boss.startLength; i++) g.extend();
    return g;
  },

  /** Remembers everything; answers `delay` s after each prompt. */
  bot({ delay = 0.3 } = {}) {
    let wait = 0;
    return (g, dt) => {
      if (g.phase === 'gauge') {
        const m = gaugeMarker(g.gauge.t, g.boss.gaugePeriod), [a, b] = g.gauge.zone;
        if (m > a + 0.02 && m < b - 0.02) g.press('Space');
        return;
      }
      if (g.phase !== 'input') { wait = delay; return; }
      wait -= dt;
      if (wait > 0) return;
      wait = delay;
      g.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[g.sequence[g.inputIndex]]);
    };
  },
};
