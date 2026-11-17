/**
 * Home decorations — won by finishing a run (one per run, themed on a zone the run
 * visited; a perfect run brings home a trophy). Each belongs to a SPOT in the house, and
 * is painted in pixel art there (town/home.js). Several items can share a spot: the player picks
 * which one is out (the rest wait in the cupboard).
 *
 *   spots   shelf · wall · poster · floor · corner · rug · ceiling · window · trophy
 */
import { rect, pset, ellipse, line, poly, ring, hline, frame } from '../engine/pixel.js';
import { mulberry32, hashSeed } from '../levels/generator.js';

/** Palette slots the decorations draw with (town/home.js fills them): HC.* */
export const HC = {
  INK: 1, WHITE: 2, RED: 3, GOLD: 5, GRAY: 6, DARK: 7, CYAN: 11, GOLD_D: 15,
  WOOD: 112, WOOD_D: 113, GREEN: 114, GREEN_D: 115, BLUE: 116, BLUE_D: 117, PINK: 118, PURPLE: 119,
  ORANGE: 120, SAND: 121, GLASS: 122, CREAM: 123, BROWN: 124, LAVA: 125, NIGHT: 126, TEAL: 127,
};

const D = (id, name, zone, spot, rarity, about, paint) => ({ id, name, zone, spot, rarity, about, paint });

/** paint(s, x, y) draws the item with its anchor at (x, y) — bottom-centre for most spots. */
export const DECOR_LIST = [
  // meadow
  D('sunflower', 'Potted Sunflower', 'meadow', 'corner', 'common', 'It follows the sun. Indoors, it follows you.', (s, x, y) => { rect(s, x - 6, y - 10, 12, 10, HC.BROWN); rect(s, x - 7, y - 11, 14, 2, HC.WOOD_D); line(s, x, y - 11, x, y - 44, HC.GREEN_D); ellipse(s, x - 5, y - 24, 4, 2, HC.GREEN); ellipse(s, x + 5, y - 31, 4, 2, HC.GREEN); for (let k = 0; k < 10; k++) { const a = k * 0.63; ellipse(s, x + Math.cos(a) * 6, y - 50 + Math.sin(a) * 6, 3, 3, HC.GOLD); } ellipse(s, x, y - 50, 4, 4, HC.BROWN); }),
  D('beejar', 'Jar of Honey Bees', 'meadow', 'shelf', 'common', 'Very friendly. Very buzzy.', (s, x, y) => { rect(s, x - 6, y - 14, 12, 14, HC.GLASS); rect(s, x - 7, y - 16, 14, 3, HC.RED); rect(s, x - 5, y - 6, 10, 5, HC.GOLD); pset(s, x - 2, y - 10, HC.INK); pset(s, x + 3, y - 8, HC.INK); pset(s, x - 1, y - 10, HC.GOLD); pset(s, x + 2, y - 8, HC.GOLD); }),
  D('meadowpainting', 'Meadow Painting', 'meadow', 'wall', 'common', 'Rolling hills, a cottage, and a very small cow.', (s, x, y) => painting(s, x, y, (px, py) => { rect(s, px, py, 40, 28, HC.GREEN); rect(s, px, py, 40, 14, HC.BLUE); ellipse(s, px + 12, py + 20, 12, 6, HC.GREEN_D); ellipse(s, px + 30, py + 24, 10, 4, HC.GREEN_D); rect(s, px + 24, py + 10, 7, 6, HC.CREAM); poly(s, [[px + 23, py + 10], [px + 27.5, py + 6], [px + 32, py + 10]], HC.RED); ellipse(s, px + 8, py + 4, 3, 3, HC.GOLD); })),
  // lagoon
  D('shipbottle', 'Ship in a Bottle', 'lagoon', 'shelf', 'common', 'Nobody knows how it got in there.', (s, x, y) => { ellipse(s, x, y - 7, 12, 7, HC.GLASS); rect(s, x + 11, y - 9, 5, 4, HC.GLASS); rect(s, x + 15, y - 9, 2, 4, HC.BROWN); rect(s, x - 6, y - 6, 12, 3, HC.BROWN); line(s, x, y - 6, x, y - 13, HC.WOOD_D); poly(s, [[x + 1, y - 13], [x + 6, y - 8], [x + 1, y - 8]], HC.WHITE); }),
  D('aquarium', 'Aquarium', 'lagoon', 'floor', 'rare', 'Three fish named Gloop, Glorp and Steve.', (s, x, y) => { rect(s, x - 22, y - 12, 44, 12, HC.WOOD); rect(s, x - 20, y - 40, 40, 28, HC.BLUE); rect(s, x - 20, y - 40, 40, 4, HC.CYAN); frame(s, x - 21, y - 41, 42, 30, HC.INK); for (const [fx, fy, c] of [[-10, -30, HC.ORANGE], [6, -24, HC.GOLD], [-2, -18, HC.PINK]]) { ellipse(s, x + fx, y + fy, 4, 2, c); poly(s, [[x + fx - 4, y + fy], [x + fx - 7, y + fy - 2], [x + fx - 7, y + fy + 2]], c); } for (let k = 0; k < 4; k++) line(s, x - 14 + k * 9, y - 13, x - 14 + k * 9 + (k % 2 ? 2 : -2), y - 22, HC.GREEN); }),
  D('chime', 'Seashell Wind Chime', 'lagoon', 'window', 'common', 'Tinkles whenever you walk past. Or don’t.', (s, x, y) => { hline(s, x - 10, x + 10, y, HC.WOOD_D); for (let k = 0; k < 5; k++) { const cx = x - 8 + k * 4, len = 6 + (k % 3) * 3; line(s, cx, y, cx, y + len, HC.GRAY); ellipse(s, cx, y + len + 2, 1.5, 2, [HC.PINK, HC.CREAM, HC.WHITE][k % 3]); } }),
  // canyon
  D('cactuspot', 'Cactus in a Pot', 'canyon', 'shelf', 'common', 'Low maintenance. High pointiness.', (s, x, y) => { rect(s, x - 5, y - 7, 10, 7, HC.ORANGE); rect(s, x - 2, y - 20, 5, 13, HC.GREEN); rect(s, x - 6, y - 16, 4, 3, HC.GREEN); rect(s, x - 6, y - 19, 2, 4, HC.GREEN); rect(s, x + 3, y - 13, 3, 2, HC.GREEN); pset(s, x, y - 21, HC.PINK); }),
  D('sunsetpainting', 'Canyon Sunset', 'canyon', 'poster', 'common', 'Painted from memory. Mostly orange.', (s, x, y) => painting(s, x, y, (px, py) => { rect(s, px, py, 40, 28, HC.ORANGE); rect(s, px, py, 40, 8, HC.PINK); ellipse(s, px + 20, py + 16, 7, 7, HC.GOLD); rect(s, px, py + 18, 14, 10, HC.BROWN); rect(s, px + 26, py + 14, 14, 14, HC.BROWN); })),
  D('tumbleweed', 'Pet Tumbleweed', 'canyon', 'corner', 'rare', 'It’s called Kevin. It doesn’t do much.', (s, x, y) => { ring(s, x, y - 9, 9, HC.SAND); ring(s, x, y - 9, 6, HC.BROWN); line(s, x - 8, y - 12, x + 7, y - 5, HC.SAND); line(s, x - 6, y - 3, x + 5, y - 15, HC.SAND); line(s, x - 2, y - 17, x + 3, y - 1, HC.BROWN); }),
  // grove
  D('mushroomlamp', 'Glowing Mushroom Lamp', 'grove', 'corner', 'rare', 'Reading light with a faint smell of forest.', (s, x, y) => { rect(s, x - 3, y - 26, 6, 26, HC.CREAM); ellipse(s, x, y - 28, 14, 7, HC.RED); ellipse(s, x, y - 24, 13, 3, HC.CYAN); for (const [dx, dy] of [[-6, -31], [3, -33], [8, -28]]) ellipse(s, x + dx, y + dy, 1.5, 1.5, HC.WHITE); }),
  D('terrarium', 'Terrarium', 'grove', 'shelf', 'common', 'A whole tiny forest. Somebody lives in there.', (s, x, y) => { ellipse(s, x, y - 9, 10, 9, HC.GLASS); rect(s, x - 8, y - 4, 16, 4, HC.BROWN); rect(s, x - 1, y - 10, 2, 6, HC.CREAM); ellipse(s, x, y - 11, 4, 2, HC.RED); line(s, x - 5, y - 4, x - 6, y - 9, HC.GREEN); line(s, x + 5, y - 4, x + 7, y - 8, HC.GREEN); }),
  D('fireflyjar', 'Jar of Fireflies', 'grove', 'window', 'common', 'They blink in time with the music.', (s, x, y) => { line(s, x, y, x, y + 5, HC.GRAY); rect(s, x - 5, y + 5, 10, 12, HC.GLASS); rect(s, x - 6, y + 4, 12, 2, HC.BROWN); for (const [dx, dy] of [[-2, 9], [2, 12], [0, 15]]) pset(s, x + dx, y + dy, HC.GOLD); }),
  // alpine
  D('snowglobe', 'Snow Globe', 'alpine', 'shelf', 'common', 'Shake it and a tiny blizzard happens.', (s, x, y) => { rect(s, x - 7, y - 4, 14, 4, HC.WOOD); ellipse(s, x, y - 11, 8, 8, HC.GLASS); poly(s, [[x - 4, y - 5], [x, y - 13], [x + 4, y - 5]], HC.GREEN_D); for (const [dx, dy] of [[-4, -14], [3, -16], [5, -9], [-6, -9]]) pset(s, x + dx, y + dy, HC.WHITE); }),
  D('knitrug', 'Cozy Knitted Rug', 'alpine', 'rug', 'common', 'Knitted by a yodeler. You can tell.', (s, x, y) => { ellipse(s, x, y, 44, 6, HC.RED); ellipse(s, x, y, 36, 4, HC.CREAM); ellipse(s, x, y, 26, 3, HC.RED); for (let k = -40; k <= 40; k += 8) pset(s, x + k, y, HC.WHITE); }),
  D('mountainposter', 'Mountain Poster', 'alpine', 'poster', 'common', '“Hang in there.” (It’s a goat on a cliff.)', (s, x, y) => painting(s, x, y, (px, py) => { rect(s, px, py, 40, 28, HC.BLUE); poly(s, [[px, py + 28], [px + 16, py + 6], [px + 32, py + 28]], HC.GRAY); poly(s, [[px + 10, py + 14], [px + 16, py + 6], [px + 22, py + 14]], HC.WHITE); poly(s, [[px + 18, py + 28], [px + 30, py + 12], [px + 40, py + 28]], HC.DARK); rect(s, px + 28, py + 9, 3, 3, HC.CREAM); })),
  // volcano
  D('lavalamp', 'Lava Lamp', 'volcano', 'corner', 'rare', 'Real lava. Please don’t touch it.', (s, x, y) => { rect(s, x - 6, y - 6, 12, 6, HC.DARK); poly(s, [[x - 5, y - 6], [x + 5, y - 6], [x + 3, y - 30], [x - 3, y - 30]], HC.NIGHT); ellipse(s, x - 1, y - 12, 3, 3, HC.LAVA); ellipse(s, x + 1, y - 21, 2, 3, HC.LAVA); ellipse(s, x, y - 27, 2, 2, HC.ORANGE); rect(s, x - 4, y - 33, 8, 3, HC.DARK); }),
  D('dragonegg', 'Dragon Egg', 'volcano', 'shelf', 'epic', 'Warm to the touch. It wobbled once.', (s, x, y) => { ellipse(s, x, y - 4, 8, 3, HC.DARK); ellipse(s, x, y - 11, 6, 9, HC.PURPLE); line(s, x - 4, y - 14, x + 3, y - 8, HC.GOLD); line(s, x - 3, y - 6, x + 4, y - 15, HC.GOLD); pset(s, x - 2, y - 17, HC.WHITE); }),
  D('obsidianbust', 'Obsidian Bust', 'volcano', 'floor', 'rare', 'A statue of someone very important. Nobody remembers who.', (s, x, y) => { rect(s, x - 9, y - 18, 18, 18, HC.CREAM); rect(s, x - 11, y - 20, 22, 3, HC.WHITE); ellipse(s, x, y - 28, 8, 9, HC.NIGHT); rect(s, x - 7, y - 20, 14, 4, HC.NIGHT); pset(s, x - 3, y - 30, HC.PURPLE); pset(s, x + 3, y - 30, HC.PURPLE); rect(s, x - 2, y - 24, 4, 1, HC.PURPLE); }),
  // crystal
  D('chandelier', 'Geode Chandelier', 'crystal', 'ceiling', 'epic', 'Throws rainbows on every wall.', (s, x, y) => { line(s, x, y, x, y + 8, HC.GRAY); ellipse(s, x, y + 10, 12, 3, HC.GOLD); for (let k = -2; k <= 2; k++) poly(s, [[x + k * 5 - 2, y + 12], [x + k * 5 + 2, y + 12], [x + k * 5, y + 20 + Math.abs(k) * -2]], [HC.PURPLE, HC.CYAN, HC.PINK][(k + 3) % 3]); }),
  D('crystalball', 'Crystal Ball', 'crystal', 'shelf', 'rare', 'It shows you… a slightly better hat.', (s, x, y) => { rect(s, x - 6, y - 4, 12, 4, HC.GOLD_D); ellipse(s, x, y - 11, 7, 7, HC.PURPLE); ellipse(s, x - 2, y - 13, 3, 3, HC.PINK); pset(s, x - 3, y - 15, HC.WHITE); }),
  D('amethyst', 'Amethyst Cluster', 'crystal', 'floor', 'rare', 'Purple, pointy, priceless (probably).', (s, x, y) => { for (const [dx, h, w, c] of [[-10, 20, 5, HC.PURPLE], [0, 32, 7, HC.PINK], [10, 24, 5, HC.PURPLE], [-4, 14, 4, HC.CYAN]]) { poly(s, [[x + dx - w, y], [x + dx + w, y], [x + dx, y - h]], c); line(s, x + dx, y - h, x + dx, y - 2, HC.WHITE); } }),
  // starlit
  D('telescope', 'Telescope', 'starlit', 'corner', 'epic', 'Pointed at the ceiling. The view is… plaster.', (s, x, y) => { line(s, x, y - 16, x - 8, y, HC.WOOD_D); line(s, x, y - 16, x + 8, y, HC.WOOD_D); line(s, x, y - 16, x, y, HC.WOOD_D); for (let k = 0; k < 4; k++) line(s, x - 6 + k, y - 16 - k * 2 + 6, x + 12 + k, y - 30 - k, HC.BLUE_D); rect(s, x + 10, y - 34, 5, 5, HC.GOLD); }),
  D('starmap', 'Star Map', 'starlit', 'poster', 'rare', 'Every constellation, including “the Big Spoon”.', (s, x, y) => painting(s, x, y, (px, py) => { rect(s, px, py, 40, 28, HC.NIGHT); const r = mulberry32(hashSeed('stars')); for (let k = 0; k < 22; k++) pset(s, px + 2 + Math.floor(r() * 36), py + 2 + Math.floor(r() * 24), k % 5 ? HC.WHITE : HC.GOLD); line(s, px + 6, py + 6, px + 14, py + 10, HC.CYAN); line(s, px + 14, py + 10, px + 22, py + 8, HC.CYAN); line(s, px + 22, py + 8, px + 30, py + 16, HC.CYAN); })),
  D('moonlamp', 'Moon Lamp', 'starlit', 'ceiling', 'rare', 'A little moon of your own.', (s, x, y) => { line(s, x, y, x, y + 10, HC.GRAY); ellipse(s, x, y + 17, 8, 8, HC.CREAM); ellipse(s, x - 2, y + 15, 2, 2, HC.SAND); ellipse(s, x + 3, y + 19, 1.5, 1.5, HC.SAND); }),
  // specials
  D('riftcrown', 'The Rift King’s Crown', null, 'wall', 'legendary', 'Won from the Rift King himself, over a game of cards. It still hums.', (s, x, y) => { rect(s, x - 16, y - 4, 32, 4, HC.WOOD_D); poly(s, [[x - 12, y - 6], [x + 12, y - 6], [x + 14, y - 22], [x + 6, y - 13], [x, y - 26], [x - 6, y - 13], [x - 14, y - 22]], HC.GOLD); for (const [dx, c] of [[-8, HC.PURPLE], [0, HC.CYAN], [8, HC.PINK]]) ellipse(s, x + dx, y - 10, 2, 2, c); pset(s, x - 1, y - 24, HC.WHITE); }),
  D('ringbelt', 'The Ring Champion’s Belt', null, 'wall', 'epic', 'Rocco hands it over with a little tear in his eye. Your monsters are very proud.', (s, x, y) => { rect(s, x - 20, y - 14, 40, 8, HC.BROWN); rect(s, x - 20, y - 13, 40, 1, HC.WOOD); ellipse(s, x, y - 10, 9, 9, HC.GOLD); ellipse(s, x, y - 10, 6, 6, HC.GOLD_D); ellipse(s, x, y - 10, 3, 3, HC.RED); pset(s, x - 1, y - 11, HC.WHITE); for (const dx of [-14, 14]) ellipse(s, x + dx, y - 10, 2, 2, HC.GOLD); }),
  D('cardtrophy', 'Riftcards Champion’s Cup', null, 'shelf', 'epic', 'Every card player in town has lost to you. Politely.', (s, x, y) => { rect(s, x - 6, y - 4, 12, 4, HC.WOOD_D); rect(s, x - 1, y - 9, 2, 5, HC.GOLD); poly(s, [[x - 6, y - 18], [x + 6, y - 18], [x + 3, y - 9], [x - 3, y - 9]], HC.GOLD); rect(s, x - 3, y - 17, 4, 6, HC.CREAM); rect(s, x - 2, y - 16, 2, 2, HC.RED); }),
  D('trophy', 'Golden Trophy', null, 'trophy', 'legendary', 'For a perfect run: every game beaten.', (s, x, y) => { rect(s, x - 8, y - 5, 16, 5, HC.WOOD_D); rect(s, x - 2, y - 12, 4, 7, HC.GOLD); poly(s, [[x - 8, y - 24], [x + 8, y - 24], [x + 4, y - 12], [x - 4, y - 12]], HC.GOLD); ring(s, x - 9, y - 20, 3, HC.GOLD); ring(s, x + 9, y - 20, 3, HC.GOLD); pset(s, x - 4, y - 21, HC.WHITE); }),
];
export const DECOR = Object.fromEntries(DECOR_LIST.map(d => [d.id, d]));
export const SPOTS = ['shelf', 'wall', 'poster', 'floor', 'corner', 'rug', 'ceiling', 'window', 'trophy'];

/** A framed picture: paint(px, py) fills a 40×28 canvas whose top-left is (px, py); (x, y) is the frame's bottom-centre. */
function painting(s, x, y, paint) {
  const px = x - 20, py = y - 30;
  rect(s, px - 3, py - 3, 46, 34, HC.GOLD_D);
  rect(s, px - 2, py - 2, 44, 32, HC.GOLD);
  paint(px, py);
}

/**
 * The decoration for a finished run: a perfect run brings home the trophy (the first time);
 * otherwise one of the visited zones' items you don't have yet (rarer ones with more stars).
 */
export function decorReward({ zones = [], stars = 0, owned = [], seed = 1 } = {}) {
  const rng = mulberry32(hashSeed('decor', seed));
  if (stars >= 5 && !owned.includes('trophy')) return DECOR.trophy;
  const rank = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const ok = d => d.zone && !owned.includes(d.id) && rank[d.rarity] <= Math.max(0, stars - 2);
  let pool = DECOR_LIST.filter(d => ok(d) && zones.includes(d.zone));
  if (!pool.length) pool = DECOR_LIST.filter(d => d.zone && !owned.includes(d.id) && zones.includes(d.zone));
  if (!pool.length) pool = DECOR_LIST.filter(d => d.zone && !owned.includes(d.id));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}
