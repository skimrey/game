/**
 * The maze mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { SLOT, ST } from '../../engine/palette.js';
import { blit, clear, ellipse, rect, solidMap } from '../../engine/pixel.js';
import { WHITE, blitHalf } from '../kit/view.js';
import { MAZE } from './rules.js';

// ---------------------------------------------------------------------------
// Maze Muncher
// ---------------------------------------------------------------------------
export function drawMaze(s, view, g, o) {
  const M = MAZE, c = M.cell;
  clear(s, SLOT.PANEL);
  for (let y = 0; y < M.rows; y++) for (let x = 0; x < M.cols; x++) {
    const px = M.left + x * c, py = M.top + y * c;
    if (g.walls[y][x]) { rect(s, px, py, c, c, ST.MID1); rect(s, px + 1, py + 1, c - 2, c - 2, ST.MID0); continue; }
    const gem = g.gems.get(`${x},${y}`);
    if (gem === 'gem') { rect(s, px + c / 2 - 1, py + c / 2 - 1, 3, 3, SLOT.GOLD); }
    else if (gem === 'power') { const r = 3 + (Math.floor(o.clock * 4) % 2); ellipse(s, px + c / 2, py + c / 2, r, r, SLOT.CYAN); }
  }
  const at = m => { const p = g.pos(m); return [M.left + p.x * c + c / 2, M.top + p.y * c + c / 2]; };
  for (const m of g.ghosts) {
    const [x, y] = at(m);
    const spr = view.minion.frame({ frame: Math.floor(o.clock * 6) });
    blit(s, spr, x - 10, y - 11, { map: g.scared > 0 ? (g.scared < 1.5 && Math.floor(o.clock * 8) % 2 ? WHITE : solidMap(SLOT.CYAN)) : null });
  }
  if (g.foe) { const [x, y] = at(g.foe); const spr = view.monster.frame({ pose: g.scared > 0 ? 'hurt' : 'idle', frame: Math.floor(o.clock * 3) }); blitHalf(s, spr, x - 12, y - 14); }
  const [hx, hy] = at(g.hero);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blitHalf(s, view.hero.get('front', 'idle', 0, Math.floor(o.clock * 8) % 4), hx - 7, hy - 12);
}
