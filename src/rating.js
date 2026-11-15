/**
 * The end-of-run star rating: how many of the run's mini-games you beat (bosses,
 * arcade checkpoints and travel levels alike — skipping one counts as not beaten).
 *
 *   ★★★★★  every game     ★★★★  80 %     ★★★  60 %     ★★  40 %     ★  finishing the run
 */
export const STAR_STEPS = [0.4, 0.6, 0.8, 1];

export function starRating(beaten, total) {
  if (!total) return 5;
  const share = beaten / total;
  return 1 + STAR_STEPS.filter(step => share >= step - 1e-9).length;
}

export const starsText = n => '★'.repeat(n) + '☆'.repeat(5 - n);
