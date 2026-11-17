/**
 * Star Beat — the starlit capstone: a rhythm game.
 *
 * The boss sings, and its notes fall as stars down four lanes toward the line at the
 * bottom. Press the lane's key — D F J K (or ← ↓ ↑ →) — as a star crosses the line.
 * Every hit recolours the world and chips at the boss; a star that slips past costs a
 * heart. A streak of hits wins a heart back.
 */
import { baseGame, tick, good, wrong, hurt, hitBoss, heal, labelOf, isGameKey } from '../kit/common.js';

export const STARBEAT = {
  lanes: [124, 148, 172, 196],
  keys: [['KeyD', 'ArrowLeft'], ['KeyF', 'ArrowDown'], ['KeyJ', 'ArrowUp'], ['KeyK', 'ArrowRight']],
  labels: ['D', 'F', 'J', 'K'],
  hitY: 148, spawnY: -8,
  lead: 1.6,            // s a star falls before it reaches the line
  window: 0.14,         // s either side of the line that counts as a hit
  perfect: 0.05,        // s: a "perfect" hit
  streakHeal: 10,       // hits in a row that win a heart back
};

export const starbeat = {
  id: 'starbeat',
  name: 'Star Beat',
  rules: boss => [
    'Stars fall down four lanes. <strong>Press the lane’s key — D F J K</strong> (or ← ↓ ↑ →) — as a star crosses the line.',
    `Every hit recolours the world and chips at the boss; a star that slips past costs a heart. ${STARBEAT.streakHeal} in a row win a heart back.`,
    `Land ${boss.hp} hits within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const B = STARBEAT;
    const g = baseGame(boss, seed);
    const beat = 60 / boss.bpm;
    Object.assign(g, {
      mode: 'starbeat',
      notes: [],            // { lane, at (s), hit, missed }
      charted: 2.4,         // song time charted so far (the first star appears after a breath)
      streak: 0,
      bestStreak: 0,
      flashes: [],          // lane flashes: { lane, t, perfect }
      pressed: [0, 0, 0, 0],// s left of each lane's key-press glow
      dancer: 0,            // counts hits (the hero's dance frame)

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const lane = B.keys.findIndex(ks => ks.includes(code));
        if (lane < 0) {
          if (isGameKey(code)) { this.streak = 0; wrong(this, { key: labelOf(code) }); return 'wrong'; }
          return null;
        }
        this.pressed[lane] = 0.12;
        const note = this.notes.filter(n => n.lane === lane && !n.hit && !n.missed && Math.abs(n.at - this.time) <= B.window)
          .sort((a, b) => Math.abs(a.at - this.time) - Math.abs(b.at - this.time))[0];
        if (!note) { this.streak = 0; wrong(this, { key: B.labels[lane], lane }); return 'wrong'; }
        note.hit = true;
        const perfect = Math.abs(note.at - this.time) <= B.perfect;
        this.flashes.push({ lane, t: 0.25, perfect });
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.dancer++;
        good(this, { lane, perfect });
        hitBoss(this);
        if (this.streak % B.streakHeal === 0) heal(this);
        return 'good';
      },

      /** Write the song a few seconds ahead: phrases of singles, pairs, runs and rests. */
      chart() {
        const rng = this.rng;
        while (this.charted < this.time + B.lead + 3) {
          const phrase = rng();
          let lane = Math.floor(rng() * 4);
          if (phrase < 0.35) {                        // four on the beat
            for (let i = 0; i < 4; i++) { this.notes.push({ lane, at: this.charted }); lane = (lane + 1 + Math.floor(rng() * 3)) % 4; this.charted += beat; }
          } else if (phrase < 0.6) {                  // a run up or down the lanes on half beats
            const dir = rng() < 0.5 ? 1 : -1;
            for (let i = 0; i < 4; i++) { this.notes.push({ lane: (lane + 4 + dir * i) % 4, at: this.charted }); this.charted += beat / 2; }
            this.charted += beat;
          } else if (phrase < 0.8 && this.boss.density > 0.5) {   // call and response: two lanes alternating
            const other = (lane + 2) % 4;
            for (let i = 0; i < 4; i++) { this.notes.push({ lane: i % 2 ? other : lane, at: this.charted }); this.charted += beat * (i % 2 ? 1 : 0.5); }
          } else {                                    // a held breath: two beats, one note
            this.notes.push({ lane, at: this.charted });
            this.charted += beat * 2;
          }
        }
      },

      step(dt) {
        const state = tick(this, dt);
        for (const f of this.flashes) f.t -= dt;
        this.flashes = this.flashes.filter(f => f.t > 0);
        for (let i = 0; i < 4; i++) this.pressed[i] = Math.max(0, this.pressed[i] - dt);
        if (state !== 'play') return;
        this.chart();
        for (const n of this.notes) {
          if (!n.hit && !n.missed && this.time - n.at > B.window) {
            n.missed = true;
            this.streak = 0;
            this.events.push({ type: 'miss', lane: n.lane });
            hurt(this);
            if (this.result !== 'playing') return;
          }
        }
        this.notes = this.notes.filter(n => this.time - n.at < 0.6);
      },
    });
    g.chart();
    return g;
  },

  /** Presses every note within `offset` s of perfect timing. */
  bot({ offset = 0.02, lead = 0 } = {}) {
    const B = STARBEAT;
    return g => {
      for (const n of g.notes) if (!n.hit && !n.missed && !n.tried && g.time >= n.at + offset - lead - 1e-9) { n.tried = lead > 0; g.press(B.keys[n.lane][0]); }
    };
  },
};

/** Where a note is on screen at time `t` (y of its centre). */
export function noteY(note, t) {
  const B = STARBEAT;
  return B.hitY - (note.at - t) / B.lead * (B.hitY - B.spawnY);
}
