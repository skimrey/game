/**
 * Delve — a tiny side-on dungeon crawl, the third kind of NPC quest (after rifts and duels).
 * It's the one place the classes are real mechanics rather than spells:
 *
 *   Warrior   a sword (short reach, 2 damage) and a SHIELD: hold K to block anything coming
 *             from the front — arrows, slimes, even the Warden's charge (which stuns it)
 *   Hunter    a bow (fast arrows, 1 damage, long range) and a DODGE-ROLL: K rolls you
 *             through anything (you can't be hit mid-roll)
 *   Sorcerer  arcane bolts (slow, 2 damage, they go through every foe in a line) and a
 *             BLINK: K teleports you a few steps ahead
 *
 * Three rooms of foes — slimes that hop at you (on the floor they're just squishy), bats that hang back and swoop, skeleton
 * archers that lob arrows at where you're standing (keep moving) — then the Rift Warden: it
 * slams the floor (jump the shockwaves), charges across the room (jump it, roll through it,
 * blink past it or block it) and leaps at you (get out from under its shadow).
 *
 * The spells you learned on the run work here too — and recharge (MODES.delve.spellRecharge):
 * the hits of Cleave / Arcane Bolt / Volley / Thorns / Predator land on the nearest foe
 * (g.spellHit); shields, heals, slow-motion and the clock work as everywhere.
 *
 * Keys: ← → (A D) move · Space jump · J or X attack (hold to keep attacking) · hold ↑ (W) to
 * aim up (shots fly at 45°, the sword swings overhead — there's no aim help) · K or C class
 * move · ↓ (S) drop through a ledge. Rooms are made from the seed and the
 * difficulty; `bossHp` is every foe's health added up (so the HUD bar empties as you clear
 * the dungeon, and a win is the last foe down).
 */
import { baseGame, tick, good, hurt, hitBoss, axis, UP_KEYS, DOWN_KEYS } from '../kit/common.js';

const lerp = (a, b, t) => a + (b - a) * t;

export const DELVE = {
  floor: 160, ceiling: 24, left: 10, right: 310,
  ledgeY: 118,                                   // ledges: one-way platforms 42 px up
  hero: { w: 12, h: 28, speed: 82, jump: 270, gravity: 700, knock: 120, stun: 0.25, shot: 12 },   // shots leave at waist height (low enough for slimes)
  kits: {
    warrior: { attack: 'sword', reach: 34, damage: 2, cooldown: 0.36, swing: 0.18, move: 'block', blockSpeed: 0.35 },
    hunter: { attack: 'bow', speed: 280, damage: 1, cooldown: 0.3, move: 'roll', roll: 0.32, rollSpeed: 230, rollCooldown: 0.85 },
    sorcerer: { attack: 'bolt', speed: 175, damage: 2, cooldown: 0.55, move: 'blink', blink: 72, blinkCooldown: 1.2, blinkSafe: 0.3 },
  },
  slime: { w: 16, h: 11, hp: 2, hop: 135, every: [0.8, 1.3] },
  bat: { w: 14, h: 10, hp: 1, swoop: 125, rise: 60, aim: 0.4, hover: [1.3, 2.4] },
  archer: { w: 12, h: 26, hp: 3, draw: 0.75, rest: [1.4, 2.3], arrow: 135, gravity: 240, close: 44 },
  warden: { w: 36, h: 42, crouch: 26, wave: 130, waveH: 10, leap: 0.9, stun: 1.3 },
  shotReach: 8,                                  // px above and below a shot's line that still count as a hit
  door: 0.5,                                     // s for the door to slide open
  spawn: 0.7,                                    // s foes take to appear (harmless meanwhile)
};
export const ATTACK_KEYS = ['KeyJ', 'KeyX', 'Enter'];
export const MOVE_KEYS = ['KeyK', 'KeyC', 'ShiftLeft', 'ShiftRight'];
export const JUMP_KEYS = ['Space'];
export const AIM_UP_KEYS = UP_KEYS;                // hold ↑ / W to aim up: shots fly at 45°, the sword swings overhead
const KITS = DELVE.kits;
const SPELL_HITS = ['spell', 'arrow', 'thorns', 'pounce'];     // spell damage gets through the Warden's guard

const box = (x, y, w, h) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y });
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** The rooms of a delve: foes (and ledges) per room, from the seed and the difficulty. */
export function planDelve(rng, d, rooms = 3) {
  const out = [];
  for (let r = 0; r < rooms; r++) {
    const ledges = [];
    if (r > 0 || rng() < 0.5) {
      const x = 90 + rng() * 150, w = 56 + rng() * 24;
      ledges.push({ x0: x - w / 2, x1: x + w / 2, y: DELVE.ledgeY });
    }
    const foes = [];
    const slimes = r === 0 ? 2 + Math.round(d) : Math.round(lerp(1, 2, d * rng()));
    const bats = r === 0 ? (d > 0.5 ? 1 : 0) : 1 + (d > 0.6 && rng() < 0.6 ? 1 : 0);
    const archers = r === 0 ? 0 : r === 1 ? 1 : 1 + (d > 0.45 ? 1 : 0);
    for (let i = 0; i < slimes; i++) foes.push({ kind: 'slime', x: 170 + i * 40 + rng() * 20 });
    for (let i = 0; i < bats; i++) foes.push({ kind: 'bat', x: 150 + rng() * 140 });
    for (let i = 0; i < archers; i++) {
      const onLedge = i === 0 && ledges.length;
      foes.push({ kind: 'archer', x: onLedge ? (ledges[0].x0 + ledges[0].x1) / 2 : 250 + i * 30, ledge: !!onLedge });
    }
    out.push({ ledges, foes });
  }
  out.push({ ledges: rng() < 0.5 ? [{ x0: 30, x1: 84, y: DELVE.ledgeY }, { x0: 236, x1: 290, y: DELVE.ledgeY }] : [], foes: [{ kind: 'warden', x: 240 }] });
  return out;
}

export const delve = {
  id: 'delve',
  name: 'Dungeon Delve',
  controls: 'move+jump+attack',
  roles: ['quest'],
  spellRecharge: 12,          // s: in a delve your spells come back (MODES.delve.spellRecharge)
  rules: boss => {
    const kit = KITS[boss.cls] || KITS.warrior;
    const move = {
      block: '<strong>Hold K</strong> to raise your <strong>shield</strong>: arrows, slimes, bats — even the Warden’s charge — bounce off it (from the front or above).',
      roll: 'Press <strong>K</strong> to <strong>dodge-roll</strong>: nothing can hit you mid-roll — roll right through arrows and charges.',
      blink: 'Press <strong>K</strong> to <strong>blink</strong> a few steps ahead — out of a shadow, past a charge.',
    }[kit.move];
    const attack = { sword: 'swing your <strong>sword</strong> (close up, 2 damage)', bow: 'shoot your <strong>bow</strong> (fast, far, 1 damage)', bolt: 'cast an <strong>arcane bolt</strong> (slow, 2 damage, through every foe in a line)' }[kit.attack];
    return [
      `<strong>← →</strong> move, <strong>Space</strong> jump (↓ drops off a ledge). <strong>J</strong> (or X): ${attack} — hold it to keep going. <strong>Hold ↑</strong> to aim up: ${kit.attack === 'sword' ? 'an overhead swing' : 'shots fly at 45°'} (no aim help: line your shots up).`,
      move,
      'Clear a room to open its door. Slimes hop, bats swoop, skeletons <strong>lob arrows where you stand</strong> — keep moving.',
      `Then the <strong>Rift Warden</strong>: jump its shockwaves, dodge its charge, get out from under its leap. Your spells recharge here (${delve.spellRecharge} s). Clear the dungeon within <strong>${boss.time} seconds</strong>.`,
    ];
  },

  create(boss, { seed = 1 } = {}) {
    const D = DELVE, d = boss.difficulty ?? 0.5;
    const g = baseGame(boss, seed);
    const cls = KITS[boss.cls] ? boss.cls : 'warrior';
    const kit = KITS[cls];
    const rooms = planDelve(g.rng, d, boss.rooms || 3);
    const wardenHp = boss.wardenHp || Math.round(lerp(10, 16, d));
    const hpOf = kind => kind === 'warden' ? wardenHp : D[kind].hp + (kind === 'slime' && d > 0.7 ? 1 : 0);
    const total = rooms.reduce((n, r) => n + r.foes.reduce((m, f) => m + hpOf(f.kind), 0), 0);
    let nextId = 1;
    Object.assign(g, {
      mode: 'delve',
      cls, kit,
      rooms,
      room: 0,
      totalHp: total,
      bossHp: total,
      hero: { x: 30, y: D.floor, vx: 0, vy: 0, face: 1, ground: true, attackCd: 0, swing: 0, moveCd: 0, roll: 0, rollDir: 1, safe: 0, stun: 0, blocking: false, drop: 0, run: 0 },
      foes: [],
      shots: [],             // yours: { x, y, vx, kind, damage, pierce, hit:Set }
      arrows: [],            // theirs: { x, y, vx, vy, tx }
      waves: [],             // shockwaves along the floor: { x, vx, t }
      doorOpen: 0,           // 0..1
      cleared: false,
      banked: 0,             // spell hits waiting for a foe to land on
      flashes: [],           // drawing: { x, y, t, kind }
      wardenSeen: false,
      enteredAt: 0,          // drawing: when this room began (its banner)
      lastHitAt: null,       // drawing: where the last hit landed
      blinkFx: null,         // drawing: the blink's afterimage

      enter(r) {
        this.room = r;
        this.cleared = false;
        this.doorOpen = 0;
        this.shots = []; this.arrows = []; this.waves = [];
        this.foes = rooms[r].foes.map(f => this.spawn(f));
        const h = this.hero;
        Object.assign(h, { x: 30, y: D.floor, vx: 0, vy: 0, face: 1, ground: true, roll: 0, stun: 0 });
        this.enteredAt = this.time;
        this.events.push({ type: 'room', room: r, boss: r === rooms.length - 1 });
        if (r === rooms.length - 1) this.wardenSeen = true;
      },

      spawn(f) {
        const hp = hpOf(f.kind);
        const base = { id: nextId++, kind: f.kind, x: f.x, y: D.floor, vx: 0, vy: 0, hp, maxHp: hp, hurt: 0, appear: D.spawn, face: -1, t: 0.6 + this.rng() * 0.6, state: 'idle', ground: true };
        if (f.kind === 'bat') { base.home = D.floor - 74 - this.rng() * 18; base.y = base.home; base.state = 'hover'; base.t = lerp(...D.bat.hover, this.rng()); base.phase = this.rng() * 6; }
        if (f.kind === 'archer' && f.ledge) { base.y = D.ledgeY; base.perch = this.ledges[0]; }
        if (f.kind === 'warden') { base.state = 'walk'; base.t = 1.2; base.appear = 1.1; }
        return base;
      },

      size(f) {
        if (f.kind === 'warden') return [D.warden.w, f.state === 'charge' ? D.warden.crouch : D.warden.h];
        return [D[f.kind].w, D[f.kind].h];
      },
      boxOf(f) { const [w, h] = this.size(f); return box(f.x, f.y, w, h); },
      heroBox() { const h = this.hero; return box(h.x, h.y, D.hero.w, h.roll > 0 ? 14 : D.hero.h); },

      /** Damage a foe (the health counted on the HUD goes down with it). */
      damage(f, n, from = 'hit') {
        if (f.hp <= 0 || n <= 0) return 0;
        if (this.armored(f) && !SPELL_HITS.includes(from)) {      // the Warden's guard is up: clink!
          this.flashes.push({ x: f.x - f.face * 14, y: f.y - 24, t: 0.2, kind: 'clink' });
          this.events.push({ type: 'clink' });
          return 0;
        }
        const dealt = Math.min(f.hp, n);
        f.hp -= dealt;
        f.hurt = 0.25;
        this.lastHitAt = [f.x, f.y - this.size(f)[1] / 2];
        hitBoss(this, dealt);
        this.flashes.push({ x: f.x, y: f.y - this.size(f)[1] / 2, t: 0.25, kind: from });
        if (f.hp <= 0) {
          good(this, { kill: f.kind });
          this.events.push({ type: 'kill', kind: f.kind, x: f.x, y: f.y });
        } else if (f.kind !== 'warden' && f.kind !== 'archer') {
          f.vx = Math.sign(f.x - this.hero.x || 1) * 70; if (f.kind === 'slime' && f.ground) { f.vy = -60; f.ground = false; }
        }
        return dealt;
      },

      /** A spell's hit (progression/spells.js): the nearest foe takes it — or the next one to show up. */
      spellHit(n = 1, kind = 'spell') {
        const h = this.hero;
        const target = this.living.slice().sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
        if (!target) { this.banked += n; return; }
        this.damage(target, n, kind);
      },

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const h = this.hero;
        if (JUMP_KEYS.includes(code)) {
          if (h.ground && h.stun <= 0 && !h.blocking) { h.vy = -D.hero.jump; h.ground = false; this.events.push({ type: 'jump' }); return 'jump'; }
          return null;
        }
        if (DOWN_KEYS.includes(code)) { if (h.ground && h.y < D.floor) { h.drop = 0.2; h.ground = false; } return 'drop'; }
        if (ATTACK_KEYS.includes(code)) return this.attack();
        if (MOVE_KEYS.includes(code)) return this.classMove();
        return null;
      },

      /** Where a sword swing reaches: ahead at chest height, or overhead while aiming up. */
      swordReach() {
        const h = this.hero;
        if (this.aimingUp) return { x0: h.x + h.face * 4 - 18, x1: h.x + h.face * 4 + 18, y0: h.y - 30 - kit.reach, y1: h.y - 18 };
        return { x0: h.face > 0 ? h.x + 2 : h.x - 2 - kit.reach, x1: h.face > 0 ? h.x + 2 + kit.reach : h.x - 2, y0: h.y - 38, y1: h.y + 2 };
      },

      attack() {
        const h = this.hero;
        if (h.attackCd > 0 || h.stun > 0 || h.roll > 0 || h.blocking) return null;
        h.attackCd = kit.cooldown;
        if (kit.attack === 'sword') {
          h.swing = kit.swing; h.swingUp = this.aimingUp;
          const reach = this.swordReach();
          let any = false;
          for (const f of this.living) if (f.appear <= 0 && overlap(reach, this.boxOf(f))) { this.damage(f, kit.damage, 'sword'); any = true; }
          // a sword knocks arrows out of the air
          this.arrows = this.arrows.filter(a => !(a.x > reach.x0 && a.x < reach.x1 && a.y > reach.y0 && a.y < reach.y1));
          this.events.push({ type: 'swing', hit: any });
        } else {
          // no aim help: straight ahead — or at 45° up while ↑ is held
          const x = h.x + h.face * 8, y = h.y - D.hero.shot, up = this.aimingUp;
          const vx = h.face * kit.speed * (up ? Math.SQRT1_2 : 1), vy = up ? -kit.speed * Math.SQRT1_2 : 0;
          this.shots.push({ x, y, vx, vy, kind: kit.attack, damage: kit.damage, pierce: kit.attack === 'bolt', hit: new Set() });
          this.events.push({ type: 'shoot', kind: kit.attack });
        }
        return 'attack';
      },

      classMove() {
        const h = this.hero;
        if (kit.move === 'roll') {
          if (h.moveCd > 0 || h.stun > 0 || h.roll > 0) return null;
          const dir = axis(this) || h.face;
          h.face = dir; h.roll = kit.roll; h.rollDir = dir; h.moveCd = kit.rollCooldown;
          this.events.push({ type: 'roll' });
          return 'roll';
        }
        if (kit.move === 'blink') {
          if (h.moveCd > 0 || h.stun > 0) return null;
          const dir = axis(this) || h.face, from = h.x;
          h.face = dir;
          h.x = Math.max(D.left + 8, Math.min(D.right - 8, h.x + dir * kit.blink));
          h.safe = kit.blinkSafe; h.moveCd = kit.blinkCooldown;
          this.events.push({ type: 'blink', from, to: h.x, y: h.y });
          this.blinkFx = { from, to: h.x, y: h.y, t: 0.3 };
          return 'blink';
        }
        return 'block';                               // the shield is held (see step)
      },

      /** Something hits the hero from x: blocked by a shield from the front, else a heart. */
      strikeHero(fromX, what) {
        const h = this.hero;
        if (h.roll > 0 || h.safe > 0) return 'dodged';
        if (h.blocking && (fromX - h.x) * h.face > -14) {           // in front — or overhead
          good(this, { block: true });
          this.events.push({ type: 'block', what, x: h.x + h.face * 10, y: h.y - 16 });
          return 'blocked';
        }
        if (this.invulnerable > 0) return 'blink';
        if (hurt(this, { what })) {
          const away = Math.sign(h.x - fromX) || -h.face;
          h.vx = away * D.hero.knock; h.vy = -150; h.ground = false; h.stun = D.hero.stun;
          return 'hurt';
        }
        return 'none';
      },

      step(dt) {
        const state = tick(this, dt);
        for (const fl of this.flashes) fl.t -= dt;
        if (this.blinkFx) { this.blinkFx.t -= dt; if (this.blinkFx.t <= 0) this.blinkFx = null; }
        this.flashes = this.flashes.filter(fl => fl.t > 0);
        if (state === 'over') return;
        const h = this.hero;
        // --- the hero
        h.attackCd = Math.max(0, h.attackCd - dt);
        h.moveCd = Math.max(0, h.moveCd - dt);
        h.swing = Math.max(0, h.swing - dt);
        h.safe = Math.max(0, h.safe - dt);
        h.stun = Math.max(0, h.stun - dt);
        h.drop = Math.max(0, h.drop - dt);
        const celebrating = state === 'celebrate';
        const dir = celebrating ? 0 : axis(this);
        h.blocking = !celebrating && kit.move === 'block' && h.ground && h.stun <= 0 && MOVE_KEYS.some(k => this.held.has(k));
        if (h.roll > 0) {
          h.roll -= dt;
          h.vx = h.rollDir * kit.rollSpeed;
        } else if (h.stun > 0) {
          h.vx *= Math.pow(0.02, dt);
        } else {
          h.vx = dir * D.hero.speed * (h.blocking ? kit.blockSpeed : 1);
          if (dir) h.face = dir;                      // (behind a shield: turning it to face the other way)
          if (!celebrating && ATTACK_KEYS.some(k => this.held.has(k))) this.attack();
        }
        h.run = dir && h.ground ? h.run + dt : 0;
        const prevY = h.y;
        h.vy += D.hero.gravity * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        const doorway = this.cleared && this.doorOpen >= 1;
        h.x = Math.max(D.left + 6, Math.min(doorway ? D.right + 20 : D.right - 6, h.x));
        h.ground = false;
        if (h.y >= D.floor) { h.y = D.floor; h.vy = 0; h.ground = true; }
        else if (h.vy >= 0 && h.drop <= 0) {
          for (const l of this.ledges) if (prevY <= l.y + 0.5 && h.y >= l.y && h.x > l.x0 - 4 && h.x < l.x1 + 4) { h.y = l.y; h.vy = 0; h.ground = true; }
        }
        if (h.y < D.ceiling + D.hero.h) { h.y = D.ceiling + D.hero.h; h.vy = Math.max(0, h.vy); }
        if (celebrating) return;
        // through the door: the next room
        if (doorway && h.x > D.right + 8 && this.room < rooms.length - 1) { this.enter(this.room + 1); return; }

        // --- your shots
        for (const s of this.shots) {
          s.x += s.vx * dt; s.y += s.vy * dt;
          const sb = { x0: s.x - 4, x1: s.x + 4, y0: s.y - D.shotReach, y1: s.y + D.shotReach };        // a forgiving hit box (you aim yourself)
          for (const f of this.living) {
            if (f.appear > 0 || s.hit.has(f.id) || !overlap(sb, this.boxOf(f))) continue;
            s.hit.add(f.id);
            this.damage(f, s.damage, s.kind);
            if (!s.pierce) { s.dead = true; break; }
          }
          if (s.x < D.left || s.x > D.right || s.y < D.ceiling || s.y > D.floor) s.dead = true;
        }
        this.shots = this.shots.filter(s => !s.dead);

        // --- foes
        const hb = this.heroBox();
        for (const f of this.foes) {
          if (f.hp <= 0) continue;
          f.hurt = Math.max(0, f.hurt - dt);
          if (f.appear > 0) { f.appear -= dt; continue; }
          if (this.banked > 0) { const n = this.banked; this.banked = 0; this.damage(f, n, 'spell'); if (f.hp <= 0) continue; }
          this[f.kind](f, dt);
          if (f.hp > 0 && overlap(hb, this.boxOf(f))) {
            if (this.touches(f)) { const r = this.strikeHero(f.x, f.kind); if (r === 'blocked') this.shove(f); }
            else if (h.roll <= 0 && f.state !== 'leap') this.bump(f);
          }
        }

        // --- their arrows and shockwaves
        for (const a of this.arrows) {
          a.vy += D.archer.gravity * dt;
          a.x += a.vx * dt; a.y += a.vy * dt;
          if (a.y >= D.floor || a.x < D.left || a.x > D.right) { a.dead = true; continue; }
          if (a.x > hb.x0 - 2 && a.x < hb.x1 + 2 && a.y > hb.y0 && a.y < hb.y1) {
            const r = this.strikeHero(a.x - Math.sign(a.vx) * 8, 'arrow');
            if (r !== 'dodged' && r !== 'blink') a.dead = true;
          }
        }
        this.arrows = this.arrows.filter(a => !a.dead);
        for (const w of this.waves) {
          w.x += w.vx * dt; w.t += dt;
          if (w.x < D.left || w.x > D.right) { w.dead = true; continue; }
          if (Math.abs(w.x - h.x) < 8 && h.y > D.floor - D.warden.waveH) {
            const r = this.strikeHero(w.x - Math.sign(w.vx) * 6, 'wave');
            if (r === 'blocked' || r === 'hurt') w.dead = true;
          }
        }
        this.waves = this.waves.filter(w => !w.dead);

        // --- a cleared room opens its door
        if (!this.cleared && this.foes.length && this.living.length === 0) {
          this.cleared = true;
          this.events.push({ type: 'clear', room: this.room });
        }
        if (this.cleared) this.doorOpen = Math.min(1, this.doorOpen + dt / D.door);
      },

      /** The Warden guards while it stalks you: hit it while it winds up, recovers or is stunned. */
      armored(f) { return f.kind === 'warden' && f.state === 'walk'; },
      /** Does touching this foe hurt? Only while it attacks. */
      touches(f) {
        if (f.kind === 'slime') return !f.ground;                 // a slime hurts when it hops on you (on the floor it just squishes)
        if (f.kind === 'bat') return f.state === 'swoop';          // … a bat when it dives
        if (f.kind === 'warden') return f.state === 'charge';      // … the Warden when it charges (its slams and leaps hurt too)
        return false;                                              // skeleton archers only shoot
      },
      /** Walking into a foe that isn't attacking: a bump, no harm (a Warden on its feet pushes you back). */
      bump(f) {
        const h = this.hero, dir = Math.sign(h.x - f.x) || -h.face;
        if (f.kind === 'slime' || f.kind === 'warden') h.x = f.x + dir * (D.hero.w + this.size(f)[0]) / 2;
      },
      /** A foe hits your shield: pushed back (the Warden's charge is stopped cold). */
      shove(f) {
        if (f.kind === 'warden') {
          if (f.state === 'charge') { f.state = 'stunned'; f.t = D.warden.stun; f.vx = 0; this.events.push({ type: 'stagger' }); }
          f.x -= this.hero.face * 4;
          return;
        }
        f.vx = this.hero.face * 110; f.x += this.hero.face * 4;
        if (f.kind === 'slime') { f.vy = -80; f.ground = false; }
        if (f.kind === 'bat') { f.state = 'rise'; }
      },

      // --- foe behaviours ------------------------------------------------------
      slime(f, dt) {
        const S = D.slime;
        f.vy += D.hero.gravity * dt;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.y >= D.floor) { f.y = D.floor; f.vy = 0; f.vx = 0; f.ground = true; }
        f.x = Math.max(D.left + 8, Math.min(D.right - 8, f.x));
        if (f.ground) {
          f.t -= dt;
          f.face = Math.sign(this.hero.x - f.x) || f.face;
          if (f.t <= 0) {
            f.t = lerp(...S.every, this.rng()) * lerp(1.15, 0.8, d);
            f.vy = -S.hop * lerp(0.85, 1.1, this.rng());
            f.vx = f.face * lerp(38, 58, d);
            f.ground = false;
          }
        }
      },

      bat(f, dt) {
        const B = D.bat, h = this.hero;
        f.phase += dt;
        f.x = Math.max(D.left + 8, Math.min(D.right - 8, f.x + f.vx * dt));
        if (f.state === 'hover') {
          f.vx = 0;
          const want = h.x + (f.x > h.x ? 50 : -50);
          f.x += Math.sign(want - f.x) * Math.min(Math.abs(want - f.x), 22 * dt);
          f.y = f.home + Math.sin(f.phase * 3) * 5;
          f.t -= dt;
          if (f.t <= 0) { f.state = 'aim'; f.t = B.aim * lerp(1.2, 0.85, d); }
        } else if (f.state === 'aim') {
          f.t -= dt;
          f.face = Math.sign(h.x - f.x) || f.face;
          if (f.t <= 0) { f.state = 'swoop'; f.tx = h.x; f.ty = h.y - 8; f.t = 1.3; }
        } else if (f.state === 'swoop') {
          const dx = f.tx - f.x, dy = f.ty - f.y, dist = Math.hypot(dx, dy), v = B.swoop * lerp(0.9, 1.15, d);
          f.t -= dt;
          if (dist < 4 || f.t <= 0) { f.state = 'rise'; }
          else { f.x += dx / dist * Math.min(dist, v * dt); f.y += dy / dist * Math.min(dist, v * dt); }
        } else {                                   // rise back up
          f.vx *= Math.pow(0.05, dt);
          f.y -= B.rise * dt;
          if (f.y <= f.home) { f.y = f.home; f.state = 'hover'; f.t = lerp(...B.hover, this.rng()) * lerp(1.15, 0.8, d); }
        }
      },

      archer(f, dt) {
        const A = D.archer, h = this.hero;
        f.face = Math.sign(h.x - f.x) || f.face;
        f.vx *= Math.pow(0.02, dt);
        f.x = Math.max(D.left + 8, Math.min(D.right - 8, f.x + f.vx * dt));
        if (f.perch) f.x = Math.max(f.perch.x0 + 5, Math.min(f.perch.x1 - 5, f.x));
        f.t -= dt;
        if (f.state === 'idle' && f.t <= 0) { f.state = 'draw'; f.t = A.draw * lerp(1.15, 0.85, d); }
        else if (f.state === 'draw' && Math.abs(h.x - f.x) < A.close) {
          // too close to shoot fairly: it shuffles back (off its ledge, if it must) and draws again
          f.vx = -f.face * 40;
          if (f.t <= 0) f.t = 0.3;
        } else if (f.state === 'draw' && f.t <= 0) {
          // lob an arrow at where you are now
          const sx = f.x + f.face * 6, sy = f.y - 18, tx = h.x, ty = h.y - 14;
          const vx = Math.sign(tx - sx || f.face) * A.arrow * lerp(0.9, 1.15, d);
          const T = Math.max(0.35, Math.abs(tx - sx) / Math.abs(vx));
          const vy = (ty - sy - 0.5 * A.gravity * T * T) / T;
          this.arrows.push({ x: sx, y: sy, vx, vy, tx, land: this.time + T });
          this.events.push({ type: 'loose' });
          f.state = 'idle'; f.t = lerp(...A.rest, this.rng()) * lerp(1.15, 0.8, d);
        }
      },

      warden(f, dt) {
        const W = D.warden, h = this.hero;
        f.t -= dt;
        const toward = Math.sign(h.x - f.x) || f.face;
        if (f.state === 'walk') {
          f.face = toward;
          if (Math.abs(h.x - f.x) > 34) f.x += toward * lerp(18, 28, d) * dt;
          if (f.t <= 0) {
            const far = Math.abs(h.x - f.x) > 70;
            const roll = this.rng();
            if (far && roll < 0.45) { f.state = 'chargeWind'; f.t = lerp(0.85, 0.6, d); }
            else if (roll < 0.75) { f.state = 'slamWind'; f.t = lerp(0.9, 0.6, d); }
            else { f.state = 'leapWind'; f.t = lerp(0.6, 0.45, d); }
            this.events.push({ type: 'telegraph', move: f.state });
            this.bossAttack = f.t;
          }
        } else if (f.state === 'slamWind' && f.t <= 0) {
          this.waves.push({ x: f.x - 20, vx: -W.wave * lerp(0.9, 1.15, d), t: 0 }, { x: f.x + 20, vx: W.wave * lerp(0.9, 1.15, d), t: 0 });
          this.events.push({ type: 'slam', x: f.x });
          f.state = 'recover'; f.t = 0.6;
        } else if (f.state === 'chargeWind') {
          f.face = toward;
          if (f.t <= 0) { f.state = 'charge'; f.vx = f.face * lerp(150, 190, d); }
        } else if (f.state === 'charge') {
          f.x += f.vx * dt;
          if (f.x < D.left + W.w / 2 || f.x > D.right - W.w / 2) {
            f.x = Math.max(D.left + W.w / 2, Math.min(D.right - W.w / 2, f.x));
            f.state = 'stunned'; f.t = W.stun; f.vx = 0;
            this.events.push({ type: 'crash', x: f.x });
          }
        } else if (f.state === 'leapWind') {
          if (f.t <= 0) { f.state = 'leap'; f.t = W.leap; f.from = f.x; f.to = Math.max(D.left + W.w / 2, Math.min(D.right - W.w / 2, h.x)); }
        } else if (f.state === 'leap') {
          const k = 1 - Math.max(0, f.t) / W.leap;
          f.x = lerp(f.from, f.to, k);
          f.y = D.floor - Math.sin(k * Math.PI) * 80;
          if (f.t <= 0) {
            f.y = D.floor;
            this.waves.push({ x: f.x - 16, vx: -W.wave * 0.8, t: 0 }, { x: f.x + 16, vx: W.wave * 0.8, t: 0 });
            this.events.push({ type: 'slam', x: f.x });
            // landing on you
            if (overlap(this.heroBox(), this.boxOf(f))) this.strikeHero(f.x, 'leap');
            f.state = 'recover'; f.t = 0.5;
          }
        } else if ((f.state === 'recover' || f.state === 'stunned') && f.t <= 0) {
          f.state = 'walk'; f.t = lerp(1.4, 0.8, d) * lerp(0.8, 1.2, this.rng());
        }
      },
    });
    // (getters: Object.assign would copy their values once)
    Object.defineProperties(g, {
      ledges: { get() { return rooms[this.room].ledges; } },
      living: { get() { return this.foes.filter(f => f.hp > 0); } },
      aimingUp: { get() { return AIM_UP_KEYS.some(k => this.held.has(k)); } },     // ↑ / W held
    });
    g.enter(0);
    return g;
  },

  /**
   * Plays like a careful player of the boss's class: keeps out from under arrows and the
   * Warden's leap, jumps shockwaves and charges (the Warrior blocks them), keeps its distance
   * with a bow or bolts and closes in with a sword; walks through the door when it opens.
   */
  bot({ lead = 0 } = {}) {
    const hold = (g, keys, on) => { for (const k of keys) on ? g.held.add(k) : g.held.delete(k); };
    return (g, dt) => {
      const D = DELVE, h = g.hero, kit = g.kit;
      hold(g, ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyJ', 'KeyK'], false);
      if (g.result !== 'playing' || g.victory > 0) return;
      let move = 0, attack = false, block = false, jump = false, special = false, aimUp = false;
      const foes = g.living.filter(f => f.appear <= 0);
      const warden = foes.find(f => f.kind === 'warden');
      // 1. walk on when the room's clear
      if (!foes.length) {
        if (g.cleared) move = 1;
        else move = h.x < 60 ? 1 : 0;
      }
      // 2. dangers
      const danger = [];
      /** When (if ever) would this arrow hit a hero standing at x? */
      const arrowHits = (a, x) => {
        let { x: ax, y: ay, vy } = a;
        for (let t = 0; t < 1.6; t += 1 / 60) {
          vy += D.archer.gravity / 60; ax += a.vx / 60; ay += vy / 60;
          if (ay >= D.floor) return null;
          if (Math.abs(ax - x) < D.hero.w / 2 + 5 && ay > h.y - D.hero.h - 4 && ay < h.y + 2) return t;
        }
        return null;
      };
      for (const a of g.arrows) {
        const t = arrowHits(a, h.x);
        if (t !== null && t < 0.9) {
          // which way is safe? (where it would miss after walking for that long)
          const options = [-1, 1].filter(m => h.x + m * 24 > D.left + 6 && h.x + m * 24 < D.right - 6 && arrowHits(a, h.x + m * Math.min(60, D.hero.speed * t + 14)) === null);
          danger.push({ kind: 'arrow', from: a.x - Math.sign(a.vx) * 8, t, safe: options });
        }
      }
      for (const w of g.waves) {
        const gap = (h.x - w.x) * Math.sign(w.vx);
        const v = Math.abs(w.vx) + Math.max(0, -h.vx * Math.sign(w.vx));           // closing speed (you may be walking into it)
        if (gap > -4 && gap < 42 + v * (0.05 + lead)) danger.push({ kind: 'wave', from: w.x, gap, v });
      }
      if (warden) {
        const gap = Math.abs(h.x - warden.x) - D.warden.w / 2 - D.hero.w / 2;
        if (warden.state === 'charge' && Math.sign(h.x - warden.x) === Math.sign(warden.vx)) danger.push({ kind: 'charge', from: warden.x, gap: gap - Math.abs(warden.vx) * lead });
        if (warden.state === 'chargeWind') danger.push({ kind: 'chargeWind', from: warden.x, gap });
        if (warden.state === 'leap' && Math.abs(h.x - warden.to) < D.warden.w / 2 + 18) danger.push({ kind: 'leap', at: warden.to, t: warden.t });
        if (warden.state === 'leapWind' && gap < 30) danger.push({ kind: 'back', from: warden.x });
        // a slam about to land close by: its shockwaves will be on you at once — jump (or shield) as it lands
        const near = kit.move === 'block' ? 50 : 16;
        if (warden.state === 'slamWind' && gap < near && warden.t < 0.12 + lead) danger.push({ kind: 'slam', from: warden.x });
        if (warden.state === 'leap' && Math.abs(h.x - warden.to) - D.warden.w / 2 - D.hero.w / 2 < near + 20 && Math.abs(h.x - warden.to) > D.warden.w / 2 + 8 && warden.t < 0.12 + lead) danger.push({ kind: 'slam', from: warden.to });
      }
      for (const f of foes) {
        const dx = f.x - h.x;
        if (f.kind === 'bat' && (f.state === 'swoop' || f.state === 'aim') && Math.abs(dx) < 70) danger.push({ kind: 'swoop', from: f.state === 'swoop' ? f.x : f.x, f, dist: Math.hypot(dx, f.y - h.y) });
        if (f.kind === 'slime' && !f.ground && Math.abs(dx) < 40 + 130 * lead && Math.sign(f.vx) === -Math.sign(dx) && (kit.move !== 'block' || Math.abs(dx) < 26 + 60 * lead)) danger.push({ kind: 'hop', from: f.x, f });
      }
      /** The quicker way out from under something landing at `at` (not into a wall). */
      const away = at => {
        const clear = D.warden.w / 2 + D.hero.w / 2 + 6;
        const cost = m => { const target = at + m * clear; return target < D.left + 8 || target > D.right - 8 ? Infinity : Math.abs(target - h.x); };
        return cost(1) <= cost(-1) ? 1 : -1;
      };
      let busy = false;
      for (const dg of danger) {
        if (dg.kind === 'arrow') {
          if (kit.move === 'block' && h.ground) { block = true; busy = true; if (Math.sign(dg.from - h.x) !== h.face) move = Math.sign(dg.from - h.x); }
          else if (dg.safe.length) { move = dg.safe.includes(move) ? move : dg.safe[0]; busy = true; }
          else if (kit.move !== 'block' && h.moveCd <= 0 && dg.t < 0.3 + lead) { special = true; move = -Math.sign(dg.from - h.x) || 1; busy = true; }
        } else if (dg.kind === 'wave' && !h.ground) {
          move = 0; busy = true;                   // over a shockwave: don't drift along with it
        } else if (dg.kind === 'wave') {
          if (kit.move === 'block' && Math.sign(dg.from - h.x) === h.face) { block = true; busy = true; }
          else if (dg.gap < 22 + dg.v * lead) { jump = true; busy = true; move = 0; }
          else if (Math.sign(dg.from - h.x) !== Math.sign(move)) { move = 0; busy = true; }     // don't run from it: wait and hop it
        } else if (dg.kind === 'charge') {
          if (kit.move === 'block' && h.ground) { block = true; busy = true; if (Math.sign(dg.from - h.x) !== h.face) move = Math.sign(dg.from - h.x); }
          else if (kit.move === 'roll' && dg.gap < 26 && h.moveCd <= 0) { special = true; move = Math.sign(dg.from - h.x); busy = true; }
          else if (kit.move === 'blink' && dg.gap < 30 && h.moveCd <= 0) { special = true; move = Math.sign(dg.from - h.x); busy = true; }
          else if (dg.gap < 34 && h.ground) { jump = true; busy = true; }
        } else if (dg.kind === 'chargeWind') {
          if (kit.move === 'block') { block = true; busy = true; if (Math.sign(dg.from - h.x) !== h.face) move = Math.sign(dg.from - h.x); }
        } else if (dg.kind === 'swoop' || dg.kind === 'hop') {
          if (kit.move === 'block' && h.ground) {
            if (Math.abs(dg.from - h.x) > 6 && Math.sign(dg.from - h.x) !== h.face) move = Math.sign(dg.from - h.x);
            else if (dg.kind === 'hop' || dg.f.state === 'swoop') block = true;
            busy = true;
          } else if (dg.kind === 'hop') { move = -Math.sign(dg.from - h.x); busy = Math.abs(dg.from - h.x) < 24; }
        } else if (dg.kind === 'slam') {
          if (kit.move === 'block' && h.ground) { block = true; if (Math.sign(dg.from - h.x) !== h.face) move = Math.sign(dg.from - h.x); }
          else if (h.ground) jump = true;
          busy = true;
        } else if (dg.kind === 'back') {
          move = -Math.sign(dg.from - h.x) || 1; busy = true;
          if ((h.x < D.left + 20 && move < 0) || (h.x > D.right - 20 && move > 0)) move = 0;
        } else if (dg.kind === 'leap') {
          move = away(dg.at); busy = true;
          if (kit.move === 'blink' && h.moveCd <= 0 && Math.abs(h.x - dg.at) < 20) special = true;
        }
      }
      // 3. attack the nearest foe
      if (foes.length && !busy) {
        const target = foes.slice().sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x))[0];
        const [, th] = g.size(target);
        const dx = target.x - h.x, side = Math.sign(dx) || h.face;
        const shotY = h.y - D.hero.shot;
        const level = shotY > target.y - th - 4 && shotY < target.y + 4;
        const high = target.y < D.floor - 20 && target.kind !== 'bat';
        if (h.ground && h.y < D.floor - 1 && target.y > h.y + 10 && target.kind !== 'bat') g.press('ArrowDown');   // off the ledge
        if (kit.attack === 'sword') {
          const want = target.kind === 'warden' ? D.warden.w / 2 + 24 : target.kind === 'slime' ? 36 : 16;
          // a slime about to hop (it squashes first) or in the air: let it come to you
          const lively = target.kind === 'slime' && (!target.ground || target.t < 0.3 + lead) && Math.abs(dx) < 70;
          if (lively) move = Math.abs(dx) < 30 ? -side : 0;
          else if (Math.abs(dx) > want + 6) move = side;
          else if (Math.abs(dx) < want - 8 && target.kind !== 'archer') move = -side;
          if (h.face !== side && !move) move = side;
          const closing = target.kind === 'slime' && !target.ground && Math.sign(target.vx) === -side ? Math.abs(target.vx) * lead : 0;
          const inReach = Math.abs(dx) < kit.reach + g.size(target)[0] / 2 - 2 + closing;
          if (inReach && side === h.face && !g.armored(target)) {
            const batNear = foes.some(f => f.kind === 'bat' && f.state !== 'hover' && Math.abs(f.x - h.x) < 80);
            if (high) {
              if (h.ground && Math.abs(dx) < 14) { attack = true; aimUp = true; }          // right below it: an overhead swing
              else if (h.ground && !batNear) jump = true;
              else if (!h.ground && h.vy > -80) attack = true;
            }
            else if (target.kind === 'bat' ? target.state === 'swoop' || target.y > h.y - 40 : true) attack = true;
            if (attack && move === -side) move = 0;      // stand and swing (backing off would turn you round)
          }
          if (target.kind === 'slime' && target.vy < 0 && Math.abs(dx) < 24) { move = -side; attack = side === h.face; }
          if ((h.x < D.left + 16 && move < 0) || (h.x > D.right - 16 && move > 0)) move = 0;   // not into the wall
        } else {
          // no aim help in the game: line shots up yourself — straight, or 45° up with ↑ held
          const keep = target.kind === 'warden' ? 90 : 70;
          const lineOf = f => {
            const fx = (f.x - h.x) * h.face, [, fh] = g.size(f), fy = f.y - fh / 2 - shotY, tol = fh / 2 + D.shotReach - 2;
            if (fx < 6) return null;
            if (Math.abs(fy) < tol) return 'straight';
            if (fy < 0 && Math.abs(fx - 8 + fy) < tol) return 'up';         // the 45° shot rises a pixel per pixel
            return null;
          };
          const fy = target.y - th / 2 - shotY, tol = th / 2 + D.shotReach - 2;
          // (the Warden: time the shot to land while its guard is down)
          const travel = Math.abs(dx) / kit.speed;
          const open = target.kind !== 'warden' || (target.state === 'walk' ? target.t < travel : target.state === 'recover' || target.state === 'stunned' ? target.t > travel : true);
          const facing = h.face === side;
          const line = facing ? lineOf(target) : null;
          if (line && open && Math.abs(dx) > 20) { attack = true; aimUp = line === 'up'; }
          else if (fy < -tol) {
            // above you: step to where the 45° line meets it (or just turn to face it)
            const want = -fy + 8;
            if (Math.abs(dx) < want - 5) move = -side;
            else if (Math.abs(dx) > want + 5) move = side;
            else if (!facing) move = side;
            if ((h.x < D.left + 16 && move < 0) || (h.x > D.right - 16 && move > 0)) { move = 0; if (h.ground && target.kind !== 'bat') jump = true; }
          } else {
            if (Math.abs(dx) < keep - 20) move = -side;
            else if (Math.abs(dx) > keep + 60) move = side;
            if (move === -side && (h.x < D.left + 24 || h.x > D.right - 24)) {
              move = 0;                                // cornered: roll or blink past a Warden that's closing in
              if (target.kind === 'warden' && Math.abs(dx) < 52 && h.moveCd <= 0 && h.ground) { special = true; move = side; }
            }
            if (!move && !facing) move = side;
          }
          // anything else in a line of fire is fair game too
          if (!attack) for (const f of foes) { const l = f.kind !== 'warden' && lineOf(f); if (l) { attack = true; aimUp = l === 'up'; break; } }
        }
      }
      // don't walk into an arrow's path (stand still instead, if that's safe)
      if (move && !busy && g.arrows.some(a => { const t = arrowHits(a, h.x + move * 16); return t !== null && t < 1.2; })) {
        if (!g.arrows.some(a => arrowHits(a, h.x) !== null)) move = 0;
      }
      if (move < 0) g.held.add('ArrowLeft');
      if (move > 0) g.held.add('ArrowRight');
      if (attack) g.held.add('KeyJ');
      if (attack && aimUp) g.held.add('ArrowUp');
      if (block) g.held.add('KeyK');
      if (jump && h.ground) g.press('Space');
      if (special) g.press('KeyK');
      if (kit.move === 'block' && block) g.held.add('KeyK');
    };
  },
};
