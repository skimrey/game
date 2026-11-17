/**
 * Fun audit — level-design quality beyond "completable and fair".
 *
 * Requirements scale with a level's design difficulty (0..1):
 *
 *   REPETITIVE_PLACEMENT   consecutive jumps on the route must differ by at least
 *                          MIN_PLACEMENT_DIFFERENCE (vector between platform centres),
 *                          so there are no copy-paste staircases or straight corridors
 *   TOO_FEW_DIRECTIONS     the route must travel in more directions as difficulty rises
 *                          (forward, left, right, up, down; "back" — toward the camera —
 *                          is deliberately not required)
 *   TOO_LITTLE_LATERAL     sideways travel per unit of forward travel
 *   TOO_LITTLE_VERTICAL    up + down travel per unit of forward travel
 *   TOO_FEW_TURNS          changes of direction (left↔right, up↔down) along the route
 *   TOO_FEW_FALSE_PATHS    tempting dead-end branches (more at higher difficulty)
 *   FALSE_PATH_TRAP        a branch you can enter but not get back from without falling
 *   TOO_FEW_ENCOUNTERS     enemy encounters along the route (more at higher difficulty)
 *   ENCOUNTERS_BUNCHED     encounters must be interspersed with platforming: none in the
 *                          first two route platforms and at least one plain jump between them
 *   FALSE_PATH_UNVERIFIED  the bot could not actually enter a false path, or climb back
 *                          out of one of its platforms, in the real physics
 *   TOO_FEW_DASHES         the route must require the air dash (gaps a plain jump can't make)
 *   TOO_FEW_DROPS          the route must include long drops (≥ RULES.LONG_DROP down)
 *   TOO_FEW_SHORTCUTS      non-obvious alternate routes that skip part of the course
 *   SHORTCUT_UNVERIFIED    the bot could not actually take a shortcut in the real physics
 *
 * Moves are rated with the best fair move: a plain jump, or — where that is beyond
 * RULES.QUALITY_CAP — an air-dash jump (see levelAudit.moveBetween).
 *
 * False paths are detected from the level geometry, independently of how the
 * level was made: off-route platforms are grouped into branches, and each branch
 * is classified from where you can enter it and where it lets you out:
 *   false      never leads further along the route than where you'd jump into it (a dash
 *              in from the route platform before only leads back to that spot: no progress)
 *   detour     rejoins the very next route platform (no progress, no dead end)
 *   alternate  skips at least one route platform — a shortcut, once proven in the physics
 */
import { analyzeJump, moveBetween, topOf, RULES, simulateMove, bestSpecial } from './audit.js';
import { abilitiesOf } from '../world/physics.js';
import { encounterPositions, encounterRequirement } from './encounterAudit.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const FUN_RULES = {
  MIN_PLACEMENT_DIFFERENCE: 0.6,
  DIRECTION_THRESHOLD: { lateral: 0.75, vertical: 0.25, forward: 0.75 },
};

/** What a level of design difficulty `d` must deliver. */
export function funRequirements(d, abilities = ['dash']) {
  d = clamp(d, 0, 1);
  return {
    // 0 at the start … 4 from d 0.75: with the air dash, every dead end must sit well below a
    // climbing route (see levelGenerator growFalsePath), so more would crowd out everything else;
    // with the double jump they must sit more than a double jump below — two is plenty then
    falsePaths: Math.min(abilities.includes('double') ? 2 : 4, Math.floor(d * 5 + 0.25)),
    directions: d < 0.2 ? 3 : d < 0.5 ? 4 : 5,
    lateralRatio: lerp(0.15, 0.5, d),
    verticalRatio: lerp(0.08, 0.3, d),
    turns: Math.round(lerp(1, 6, d)),
    encounters: encounterRequirement(d),
    dashes: d >= 0.6 ? 2 : d >= 0.15 ? 1 : 0,      // gaps only the air dash crosses
    longDrops: d >= 0.2 ? 1 : 0,                  // falls of RULES.LONG_DROP or more
    shortcuts: d >= 0.15 ? 1 : 0,                 // non-obvious alternate routes (from the dash lesson on)
  };
}

export function designDifficulty(level) {
  return level.meta?.difficulty ?? 0;
}

/** Screen-space names: the camera looks along +z, and +x is screen-left. */
function directionsOf({ dx, dy, dz }) {
  const t = FUN_RULES.DIRECTION_THRESHOLD;
  const out = [];
  if (dx >= t.lateral) out.push('left');
  if (dx <= -t.lateral) out.push('right');
  if (dy >= t.vertical) out.push('up');
  if (dy <= -t.vertical) out.push('down');
  if (dz >= t.forward) out.push('forward');
  if (dz <= -t.forward) out.push('back');
  return out;
}

/**
 * How a route travels (centre to centre between consecutive route platforms): the
 * directions it moves in, sideways / up-down / forward totals and direction changes.
 * Shared with the level generator, which checks its designs before auditing them.
 */
export function routeTravel(platforms, route) {
  const moves = [];
  for (let i = 1; i < route.length; i++) {
    const a = platforms[route[i - 1]], b = platforms[route[i]];
    moves.push({ from: route[i - 1], to: route[i], dx: b.x - a.x, dy: topOf(b) - topOf(a), dz: b.z - a.z });
  }
  const directions = new Set(moves.flatMap(directionsOf));
  const sum = f => moves.reduce((s, m) => s + f(m), 0);
  const forward = Math.max(1, sum(m => Math.max(0, m.dz)));
  const lateral = sum(m => Math.abs(m.dx));
  const ascent = sum(m => Math.max(0, m.dy));
  const descent = sum(m => Math.max(0, -m.dy));
  const t = FUN_RULES.DIRECTION_THRESHOLD;
  const signChanges = values => values.reduce((n, v, i) => n + (i > 0 && Math.sign(v) !== Math.sign(values[i - 1]) ? 1 : 0), 0);
  const turns = signChanges(moves.filter(m => Math.abs(m.dx) >= t.lateral).map(m => m.dx)) +
    signChanges(moves.filter(m => Math.abs(m.dy) >= t.vertical).map(m => m.dy));
  return { moves, directions, forward, lateral, ascent, descent, turns, lateralRatio: lateral / forward, verticalRatio: (ascent + descent) / forward };
}

/** Easiest way (fewest fair moves) from `start` back onto any route platform, avoiding banned moves. */
function wayBack(start, allowed, routeIndex, edge, banned) {
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const a = queue.shift();
    if (routeIndex.has(a)) {
      const path = [];
      for (let v = a; v !== null; v = prev.get(v)) path.unshift(v);
      return path;
    }
    for (let b = 0; b < edge.length; b++) {
      if (prev.has(b) || edge[a][b] > RULES.QUALITY_CAP || banned.has(`${a}>${b}`)) continue;
      if (allowed.has(b) || routeIndex.has(b)) { prev.set(b, a); queue.push(b); }
    }
  }
  return null;
}

/**
 * Prove an alternate branch is a real shortcut: the bot enters it from the route, crosses
 * it and leaves it further along the route (skipping at least one route platform), every
 * move in the real physics. Returns { platforms, verified, from, to, skipped, path, needs, problem }.
 */
function proveShortcut(level, branch, route, routeIndex, edge) {
  const members = new Set(branch.platforms);
  const result = { platforms: branch.platforms, verified: false, problem: 'no way through found' };
  for (const exit of branch.fairExits) {
    const exitIndex = routeIndex.get(exit);
    // route platforms early enough that leaving at `exit` skips at least one route platform
    const starts = branch.entries.filter(r => routeIndex.get(r) <= exitIndex - 2).sort((a, b) => routeIndex.get(a) - routeIndex.get(b));
    for (const start of starts) {
      // fewest fair moves start → (branch platforms only) → exit
      const prev = new Map([[start, null]]);
      const queue = [start];
      while (queue.length && !prev.has(exit)) {
        const a = queue.shift();
        for (const b of [...members, exit]) {
          if (prev.has(b) || edge[a][b] > RULES.QUALITY_CAP || (a === start && b === exit)) continue;
          if (b === exit && a === start) continue;
          prev.set(b, a);
          queue.push(b);
        }
      }
      if (!prev.has(exit)) continue;
      const path = [];
      for (let v = exit; v !== null; v = prev.get(v)) path.unshift(v);
      const failed = path.slice(1).findIndex((b, k) => !simulateMove(level, path[k], b));
      if (failed >= 0) { result.problem = `bot failed ${path[failed]} → ${path[failed + 1]}`; continue; }
      const moves = path.slice(1).map((b, k) => moveBetween(level.platforms[path[k]], level.platforms[b], RULES.QUALITY_CAP, abilitiesOf(level)));
      return {
        platforms: branch.platforms, verified: true, from: start, to: exit, path,
        skipped: exitIndex - routeIndex.get(start) - 1,
        hopsSaved: exitIndex - routeIndex.get(start) - (path.length - 1),
        needs: [...new Set(moves.map(m => (['dash', 'glide', 'double', 'spring'].includes(m.kind) ? m.kind : -m.dh >= RULES.LONG_DROP ? 'drop' : m.kind)))],
      };
    }
  }
  return result;
}

/** Group off-route platforms into branches and classify them. */
export function findBranches(level, audit) {
  const { platforms } = level;
  const n = platforms.length;
  const route = [audit.route[0]?.from ?? 0, ...audit.route.map(e => e.to)];
  const routeIndex = new Map(route.map((p, i) => [p, i]));
  const edge = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const plainEdge = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const dashEdge = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const abilities = abilitiesOf(level);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      plainEdge[i][j] = analyzeJump(platforms[i], platforms[j]).difficulty;
      // the special moves this level allows (air dash, glide, double jump)
      dashEdge[i][j] = bestSpecial(platforms[i], platforms[j], abilities)?.difficulty ?? Infinity;
      // best fair move: the plain jump if fair, else a special move if fair, else the plain jump
      edge[i][j] = plainEdge[i][j] <= RULES.QUALITY_CAP || dashEdge[i][j] > RULES.QUALITY_CAP ? plainEdge[i][j] : dashEdge[i][j];
    }
  }

  // reachable from the start, fairly
  const reach = new Set([route[0]]);
  const queue = [route[0]];
  while (queue.length) {
    const a = queue.shift();
    for (let b = 0; b < n; b++) if (!reach.has(b) && edge[a][b] <= RULES.QUALITY_CAP) { reach.add(b); queue.push(b); }
  }
  // can reach the goal (route end), fairly
  const goal = route.at(-1);
  const canFinish = new Set([goal]);
  const back = [goal];
  while (back.length) {
    const b = back.shift();
    for (let a = 0; a < n; a++) if (!canFinish.has(a) && edge[a][b] <= RULES.QUALITY_CAP) { canFinish.add(a); back.push(a); }
  }

  const off = [...reach].filter(p => !routeIndex.has(p));
  const seen = new Set();
  const branches = [];
  for (const startNode of off) {
    if (seen.has(startNode)) continue;
    const members = [];
    const stack = [startNode];
    seen.add(startNode);
    while (stack.length) {
      const a = stack.pop();
      members.push(a);
      for (const b of off) {
        if (!seen.has(b) && (edge[a][b] <= 1 || edge[b][a] <= 1)) { seen.add(b); stack.push(b); }
      }
    }
    const entries = route.filter(r => members.some(m => edge[r][m] <= RULES.QUALITY_CAP));
    // where a player would naturally wander in: a plain (fair) jump
    const plainEntries = route.filter(r => members.some(m => plainEdge[r][m] <= RULES.QUALITY_CAP));
    // A branch lets you progress if you can leave it further along the route than
    // the earliest place you could have entered it (then it's an alternate route).
    const entryIndex = Math.min(Infinity, ...entries.map(r => routeIndex.get(r)));
    const plainEntryIndex = Math.min(Infinity, ...plainEntries.map(r => routeIndex.get(r)));
    // ways out count the air dash: a branch you can dash out of forward is no dead end
    const exits = route.filter(r => members.some(m => dashEdge[m][r] <= 1));
    const furthest = Math.max(-1, ...exits.map(r => routeIndex.get(r)));
    // fair ways out (for proving shortcuts), furthest along the route first
    const fairExits = route.filter(r => members.some(m => edge[m][r] <= RULES.QUALITY_CAP)).sort((a, b) => routeIndex.get(b) - routeIndex.get(a));
    const trapped = members.filter(m => !canFinish.has(m));
    // Ways in, easiest and smallest drop first (verified in the physics later)
    const entryEdges = entries.flatMap(r => members.map(m => [r, m]))
      .filter(([r, m]) => edge[r][m] <= RULES.QUALITY_CAP)
      .sort((a, b) => (edge[a[0]][a[1]] + 0.3 * Math.abs(topOf(platforms[a[1]]) - topOf(platforms[a[0]]))) -
        (edge[b[0]][b[1]] + 0.3 * Math.abs(topOf(platforms[b[1]]) - topOf(platforms[b[0]]))));
    branches.push({
      platforms: members.sort((a, b) => a - b),
      entryEdges,
      entries,
      entryIndex,
      // false: leads nowhere · detour: rejoins the very next route platform ·
      // alternate: skips at least one route platform
      // false: from where you'd jump in, it leads nowhere further (a dash in from the route
      // platform before only gets you back to where you could have jumped in: no progress)
      kind: entries.length === 0 ? 'hidden' : furthest > entryIndex + 1 ? 'alternate'
        : furthest <= Math.max(entryIndex, plainEntryIndex) ? 'false' : 'detour',
      trapped,
      fairExits,
    });
  }
  return { branches, route, routeIndex, edge };
}

/**
 * Audit how fun a level's design is at its design difficulty.
 * @returns {{ ok, issues: [{code, message}], metrics, requirements }}
 */
export function auditFun(level, audit, difficulty = designDifficulty(level)) {
  const issues = [];
  const req = funRequirements(difficulty, abilitiesOf(level));
  if (!audit.ok || !audit.route) {
    return { ok: false, issues: [{ code: 'NOT_PLAYABLE', message: 'Level must pass the playability audit first' }], metrics: null, requirements: req };
  }
  const { platforms } = level;
  const { branches, route, routeIndex, edge } = findBranches(level, audit);

  const { moves, directions, forward, lateral, ascent, descent, turns } = routeTravel(platforms, route);

  // Minimum difference between consecutive placements
  const similar = [];
  let minDifference = Infinity;
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1], b = moves[i];
    const diff = Math.hypot(a.dx - b.dx, a.dy - b.dy, a.dz - b.dz);
    minDifference = Math.min(minDifference, diff);
    if (diff < FUN_RULES.MIN_PLACEMENT_DIFFERENCE) similar.push(`${a.from}→${a.to}→${b.to}`);
  }

  const falsePaths = branches.filter(b => b.kind === 'false');
  const alternates = branches.filter(b => b.kind === 'alternate');
  const shortcuts = alternates.map(b => proveShortcut(level, b, route, routeIndex, edge));
  const detours = branches.filter(b => b.kind === 'detour');
  const traps = branches.filter(b => b.kind !== 'hidden' && b.trapped.length);

  const metrics = {
    difficulty,
    moves: moves.length,
    directions: [...directions],
    lateralRatio: lateral / forward,
    verticalRatio: (ascent + descent) / forward,
    ascent,
    descent,
    turns,
    minPlacementDifference: Number.isFinite(minDifference) ? minDifference : 0,
    falsePaths: falsePaths.length,
    falsePathPlatforms: falsePaths.reduce((s, b) => s + b.platforms.length, 0),
    alternates: alternates.length,
    detours: detours.length,
    branches,
    // moves only the level's special techniques make: air dash, glide, double jump, bounce pads
    dashes: (audit.metrics.moves?.dash ?? 0) + (audit.metrics.moves?.glide ?? 0) + (audit.metrics.moves?.double ?? 0) + (audit.metrics.moves?.spring ?? 0),
    longDrops: audit.metrics.moves?.longDrop ?? 0,
    maxDrop: audit.metrics.maxDrop ?? 0,
    shortcuts: shortcuts.filter(c => c.verified).length,
    shortcutDetails: shortcuts,
  };

  const requireAtLeast = (code, value, min, what, fmt = v => String(v)) => {
    if (value < min) issues.push({ code, message: `${what}: ${fmt(value)} (needs ≥ ${fmt(min)} at difficulty ${difficulty.toFixed(2)})` });
  };
  if (similar.length) {
    issues.push({ code: 'REPETITIVE_PLACEMENT', message: `${similar.length} pair(s) of consecutive jumps are nearly identical (< ${FUN_RULES.MIN_PLACEMENT_DIFFERENCE}): ${similar.slice(0, 3).join(', ')}${similar.length > 3 ? '…' : ''}` });
  }
  requireAtLeast('TOO_FEW_DIRECTIONS', directions.size, req.directions, `route travels in ${[...directions].join('/') || 'no'} directions`);
  requireAtLeast('TOO_LITTLE_LATERAL', metrics.lateralRatio, req.lateralRatio, 'sideways travel per forward unit', v => v.toFixed(2));
  requireAtLeast('TOO_LITTLE_VERTICAL', metrics.verticalRatio, req.verticalRatio, 'up/down travel per forward unit', v => v.toFixed(2));
  requireAtLeast('TOO_FEW_TURNS', turns, req.turns, 'direction changes along the route');
  requireAtLeast('TOO_FEW_FALSE_PATHS', falsePaths.length, req.falsePaths, 'false paths');
  requireAtLeast('TOO_FEW_DASHES', metrics.dashes, req.dashes, 'route moves that need a special technique (air dash, glide, double jump, bounce pad)');
  requireAtLeast('TOO_FEW_DROPS', metrics.longDrops, req.longDrops, `long drops (≥ ${RULES.LONG_DROP}) on the route`);
  requireAtLeast('TOO_FEW_SHORTCUTS', metrics.shortcuts, req.shortcuts, 'proven shortcuts');
  for (const c of shortcuts.filter(c => !c.verified)) {
    issues.push({ code: 'SHORTCUT_UNVERIFIED', message: `Alternate route through ${c.platforms.join(',')}: ${c.problem}` });
  }
  // Prove false paths in the real physics: at least one way in must work, and from
  // every platform at least one way back to the route must work.
  let simulated = 0;
  for (const b of falsePaths) {
    const problems = [];
    const tries = b.entryEdges.slice(0, 4);
    let entered = false;
    for (const [r, m] of tries) {
      simulated++;
      if (simulateMove(level, r, m)) { entered = true; break; }
    }
    if (tries.length && !entered) problems.push(`entering (tried ${tries.map(([r, m]) => `${r}→${m}`).join(', ')})`);
    const members = new Set(b.platforms);
    for (const m of b.platforms) {
      if (b.trapped.includes(m)) continue; // reported as a trap below
      const banned = new Set();
      let back = false;
      for (let attempt = 0; attempt < 4 && !back; attempt++) {
        const path = wayBack(m, members, routeIndex, edge, banned);
        if (!path) break;
        back = true;
        for (let k = 1; k < path.length; k++) {
          simulated++;
          if (!simulateMove(level, path[k - 1], path[k])) { banned.add(`${path[k - 1]}>${path[k]}`); back = false; break; }
        }
      }
      if (!back) problems.push(`getting back from ${m}`);
    }
    if (problems.length) issues.push({ code: 'FALSE_PATH_UNVERIFIED', message: `False path ${b.platforms.join(',')}: bot failed ${problems.join('; ')}` });
  }
  metrics.simulatedMoves = simulated;

  // Enemy encounters: enough of them, spread between platforming sections
  const encounters = encounterPositions(level, route);
  metrics.encounters = encounters.length;
  metrics.encounterPositions = encounters.map(e => e.position);
  requireAtLeast('TOO_FEW_ENCOUNTERS', encounters.length, req.encounters, 'enemy encounters');
  const bunched = encounters.filter((e, i) => e.position < 2 || (i > 0 && e.position - encounters[i - 1].position < 2));
  if (bunched.length) {
    issues.push({ code: 'ENCOUNTERS_BUNCHED', message: `Encounters at route positions ${encounters.map(e => e.position).join(', ')} are not interspersed with platforming` });
  }

  for (const trap of traps) {
    issues.push({ code: 'FALSE_PATH_TRAP', message: `Branch ${trap.platforms.join(',')} can be entered but platform(s) ${trap.trapped.join(',')} cannot get back without falling` });
  }

  // Informational 0–10 score: how much of each ingredient the level offers
  const parts = [
    Math.min(1, falsePaths.length / 5),
    directions.size / 5,
    Math.min(1, metrics.lateralRatio / 0.6),
    Math.min(1, metrics.verticalRatio / 0.4),
    Math.min(1, turns / 8),
    Math.min(1, metrics.minPlacementDifference / 1.5),
    ((metrics.dashes > 0) + (metrics.longDrops > 0)) / 2,   // movement vocabulary
    Math.min(1, metrics.shortcuts),
  ];
  metrics.funScore = (10 * parts.reduce((s, v) => s + v, 0)) / parts.length;

  return { ok: issues.length === 0, issues, metrics, requirements: req };
}
