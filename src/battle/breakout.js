/**
 * Brick Breaker — a boss game: the boss hides behind a wall of bricks.
 *
 * Move the paddle with ← → (or the mouse), launch the ball with Space or a click. The ball bounces off it — where it hits the
 * paddle sets the angle. Break through the bricks and hit the boss; every hit recolours
 * the world. A ball that gets past the paddle costs a heart (a new one is served).
 * Later bosses patch their wall back up and spit goo that makes the paddle sticky (slow) for a moment.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from './common.js';

export const BREAKOUT = {
  left: 40, right: 280, top: 22,
  paddleY: 160, paddleW: 44, paddleSpeed: 235,
  brickW: 24, brickH: 8, brickTop: 64, rows: 3,
  ball: 3,
  bossY: 40,
};

export const breakout = {
  id: 'breakout',
  name: 'Brick Breaker',
  controls: 'paddle',
  rules: boss => [
    'Move the paddle with <strong>← →</strong> (or the mouse) and launch the ball with <strong>Space</strong> (or a click). Where the ball hits the paddle sets its angle.',
    'Break through the bricks and hit the boss — every hit recolours the world.',
    `A ball past your paddle costs a heart.${boss.goo ? ' Dodge the boss’s goo: it makes the paddle sticky.' : ''} Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const B = BREAKOUT;
    const g = baseGame(boss, seed);
    const cols = Math.floor((B.right - B.left) / B.brickW);
    Object.assign(g, {
      mode: 'breakout',
      paddle: { x: 160, stun: 0 },
      ball: null,
      serve: 1,
      bricks: [],            // { col, row, hp }
      goo: [],               // { x, y }
      foe: { x: 160, dir: 1 },
      nextPatch: 4,
      nextGoo: 3,
      cols,

      ready: false,          // a ball sits on the paddle, waiting to be launched

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (this.ready && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'Enter')) { this.serveBall(); return 'serve'; }
        return null;
      },
      aimAt(x) { this.pointerX = x; },
      click(x) { this.pointerX = x; return this.press('Space'); },

      brickAt(col, row) { return { x: B.left + col * B.brickW + B.brickW / 2, y: B.brickTop + row * B.brickH + B.brickH / 2 }; },

      serveBall() {
        this.ready = false;
        const dir = this.rng() < 0.5 ? -1 : 1;
        this.ball = { x: this.paddle.x, y: B.paddleY - 8, vx: dir * this.boss.ballSpeed * 0.45, vy: -this.boss.ballSpeed * 0.9 };
      },

      step(dt) {
        const state = tick(this, dt);
        if (state !== 'play') { this.goo = []; return; }
        const p = this.paddle;
        p.stun = Math.max(0, p.stun - dt);
        // goo makes the paddle sticky: it drags along at under half speed for a moment
        const speed = B.paddleSpeed * (p.stun > 0 ? 0.45 : 1);
        if (this.pointerX !== undefined) { p.x += Math.max(-speed * dt, Math.min(speed * dt, this.pointerX - p.x)); }
        p.x += axis(this) * speed * dt;
        p.x = Math.max(B.left + B.paddleW / 2, Math.min(B.right - B.paddleW / 2, p.x));
        // the boss paces behind its wall
        this.foe.x += this.foe.dir * this.boss.foeSpeed * dt;
        if (this.foe.x < B.left + 30 || this.foe.x > B.right - 30) this.foe.dir *= -1;
        // patching the wall (later bosses)
        if (this.boss.patch) {
          this.nextPatch -= dt;
          if (this.nextPatch <= 0) {
            const holes = [];
            for (let r = 0; r < this.boss.rows; r++) for (let c = 0; c < cols; c++) if (!this.bricks.some(b => b.col === c && b.row === r)) holes.push({ col: c, row: r });
            if (holes.length) { const h = holes[Math.floor(this.rng() * holes.length)]; this.bricks.push({ ...h, hp: 1 }); this.bossAttack = 0.3; }
            this.nextPatch = this.boss.patch * (0.8 + 0.4 * this.rng());
          }
        }
        if (this.boss.goo) {
          this.nextGoo -= dt;
          if (this.nextGoo <= 0) {
            this.goo.push({ x: this.foe.x, y: B.bossY + 16 });
            this.bossAttack = 0.4;
            this.nextGoo = this.boss.goo * (0.8 + 0.4 * this.rng());
          }
        }
        for (const o of this.goo) {
          o.y += 70 * dt;
          if (!o.spent && Math.abs(o.y - B.paddleY) < 5 && Math.abs(o.x - p.x) < B.paddleW / 2 + 3) { o.spent = true; p.stun = 1; this.events.push({ type: 'stun' }); }
        }
        this.goo = this.goo.filter(o => !o.spent && o.y < 185);
        // the ball
        if (!this.ball) { this.serve -= dt; if (this.serve <= 0) this.ready = true; return; }
        const b = this.ball;
        const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 3);
        for (let k = 0; k < steps && this.ball; k++) this.moveBall(dt / steps);
      },

      moveBall(dt) {
        const b = this.ball, p = this.paddle;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < B.left + B.ball) { b.x = B.left + B.ball; b.vx = Math.abs(b.vx); }
        if (b.x > B.right - B.ball) { b.x = B.right - B.ball; b.vx = -Math.abs(b.vx); }
        if (b.y < B.top + B.ball) { b.y = B.top + B.ball; b.vy = Math.abs(b.vy); }
        // the boss
        if (b.vy < 0 && Math.abs(b.x - this.foe.x) < 25 && b.y < B.bossY + 18 && b.y > B.bossY - 18) {
          b.vy = Math.abs(b.vy);
          good(this);
          hitBoss(this);
        }
        // bricks
        for (const br of this.bricks) {
          const c = this.brickAt(br.col, br.row);
          if (Math.abs(b.x - c.x) < B.brickW / 2 + B.ball && Math.abs(b.y - c.y) < B.brickH / 2 + B.ball) {
            br.hp--;
            if (Math.abs(b.x - c.x) / B.brickW > Math.abs(b.y - c.y) / B.brickH) b.vx = -b.vx; else b.vy = -b.vy;
            this.events.push({ type: 'pop', x: c.x, y: c.y });
            break;
          }
        }
        this.bricks = this.bricks.filter(br => br.hp > 0);
        // the paddle
        if (b.vy > 0 && b.y >= B.paddleY - B.ball && b.y <= B.paddleY + 3 && Math.abs(b.x - p.x) <= B.paddleW / 2 + B.ball) {
          const off = Math.max(-1, Math.min(1, (b.x - p.x) / (B.paddleW / 2)));
          const speed = Math.min(this.boss.ballSpeed * 1.2, Math.hypot(b.vx, b.vy) * 1.02);
          const angle = off * 0.9;
          b.vx = Math.sin(angle) * speed; b.vy = -Math.cos(angle) * speed;
          b.y = B.paddleY - B.ball;
        }
        if (b.y > 182) { this.ball = null; this.serve = 1; hurt(this, { dropped: true }); }
      },
    });
    for (let r = 0; r < (boss.rows || B.rows); r++) for (let c = 0; c < cols; c++) if ((c + r) % boss.gaps !== 0) g.bricks.push({ col: c, row: r, hp: 1 });
    return g;
  },

  /** Tracks the ball's landing point, hitting it off-centre toward the boss. */
  bot({ lead = 0 } = {}) {
    const B = BREAKOUT;
    const inFlight = [];       // what we asked for over the last `lead` seconds — it hasn't happened yet
    return (g, dt = 1 / 120) => {
      while (inFlight.length > Math.round(lead / dt)) inFlight.shift();
      const px = g.paddle.x + inFlight.reduce((a, v) => a + v, 0) * B.paddleSpeed * dt;
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      const b = g.ball;
      if (g.ready) g.press('Space');
      let target = b ? b.x : 160;          // rising: keep under it, it'll be back
      if (b && b.vy > 0) {
        // where the ball crosses the paddle line (walls reflect)
        const t = (B.paddleY - B.ball - b.y) / b.vy;
        let x = b.x + b.vx * t - B.left - B.ball;
        const w = B.right - B.left - 2 * B.ball;
        x = ((x % (2 * w)) + 2 * w) % (2 * w);
        if (x > w) x = 2 * w - x;
        target = x + B.left + B.ball - Math.sign(g.foe.x - (x + B.left)) * B.paddleW * 0.25;
      }
      // sidestep goo — unless the ball needs us right now
      const ballSoon = b && b.vy > 0 && (B.paddleY - b.y) / b.vy < 0.6;
      if (!ballSoon) for (const o of g.goo) if (Math.abs(o.y - B.paddleY) < 40 && Math.abs(o.x - target) < B.paddleW / 2 + 4) target += (o.x < target ? 1 : -1) * (B.paddleW / 2 + 6);
      // a slower player settles for "close enough" rather than wobbling
      let dir = 0;
      if (Math.abs(target - px) > 3) dir = target < px ? -1 : 1;
      if (dir) g.held.add(dir < 0 ? 'ArrowLeft' : 'ArrowRight');
      inFlight.push(dir);
    };
  },
};
