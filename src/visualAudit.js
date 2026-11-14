/**
 * Visual audit — checks that environments stay readable and that every
 * difficulty tier has a distinct background. Colour differences use CIE76 ΔE
 * in L*a*b* space (≈2.3 is a just-noticeable difference; 20+ reads clearly).
 *
 *   PLATFORM_VS_HORIZON   platforms stand out from the fog/horizon they fade into
 *   PLATFORM_VS_BELOW     platforms stand out from what is seen below them
 *   AVATAR_VS_PLATFORM    the player stands out from the platform surface
 *   GOAL_VS_PLATFORM      the goal beacon stands out from the platform surface
 *   TIER_BACKGROUND       each tier's background differs clearly from every other tier
 */
import { BIOMES } from './biomes.js';
import { MATERIALS } from './materials.js';
import { AVATAR_PALETTES } from './avatar.js';

export const VISUAL_RULES = {
  PLATFORM_VS_HORIZON: 25,
  PLATFORM_VS_BELOW: 20,
  AVATAR_VS_PLATFORM: 20,
  GOAL_VS_PLATFORM: 20,
  TIER_BACKGROUND: 18,
};

// sRGB (0..1) → CIE L*a*b* (D65)
export function toLab([r, g, b]) {
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [r, g, b].map(v => lin(Math.max(0, Math.min(1, v))));
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a), [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const mul = (a, b) => a.map((v, i) => v * b[i]);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** How a platform top appears: texture swatch × top-face light (1.0) × biome tint. */
export function platformTopColor(biome, material = biome.material) {
  return mul(MATERIALS[material].swatch, biome.light.tint);
}

/** What the player sees behind/below platforms: the ground (hazed) or the sky below the horizon. */
export function belowColor(biome) {
  if (!biome.ground) return biome.sky.below;
  const ground = mul(MATERIALS[biome.ground.material].swatch, biome.light.tint);
  return mix(ground, biome.sky.horizon, biome.haze.strength);
}

export function auditBiome(biome) {
  const issues = [];
  const top = platformTopColor(biome);
  const check = (code, value, min, what) => {
    if (value < min) issues.push({ code, message: `${biome.name}: ${what} ΔE ${value.toFixed(1)} < ${min}` });
    return value;
  };
  const metrics = {
    platformVsHorizon: check('PLATFORM_VS_HORIZON', deltaE(top, biome.sky.horizon), VISUAL_RULES.PLATFORM_VS_HORIZON, 'platform vs horizon/fog'),
    platformVsBelow: check('PLATFORM_VS_BELOW', deltaE(top, belowColor(biome)), VISUAL_RULES.PLATFORM_VS_BELOW, 'platform vs what lies below'),
    avatarVsPlatform: check('AVATAR_VS_PLATFORM',
      Math.min(...Object.values(AVATAR_PALETTES).map(p => Math.max(deltaE(mul(p.shirt, biome.light.tint), top), deltaE(mul(p.pack, biome.light.tint), top)))),
      VISUAL_RULES.AVATAR_VS_PLATFORM, 'avatar (least distinct outfit) vs platform'),
    goalVsPlatform: check('GOAL_VS_PLATFORM', deltaE([1, 0.83, 0.15], top), VISUAL_RULES.GOAL_VS_PLATFORM, 'goal beacon vs platform'),
  };
  return { biome: biome.id, ok: issues.length === 0, issues, metrics };
}

/** A background's signature: sky top, horizon and what lies below. */
function signature(biome) {
  return [biome.sky.top, biome.sky.horizon, belowColor(biome)];
}

/** Every tier must have its own biome, and backgrounds must differ clearly pairwise. */
export function auditTierBackgrounds(tiers) {
  const issues = [];
  const ids = tiers.map(t => t.biome);
  if (new Set(ids).size !== ids.length) issues.push({ code: 'TIER_BACKGROUND', message: 'Two tiers share a biome' });
  const pairs = [];
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      const a = signature(BIOMES[tiers[i].biome]), b = signature(BIOMES[tiers[j].biome]);
      // distance = the most different of the three signature colours
      const d = Math.max(...a.map((c, k) => deltaE(c, b[k])));
      pairs.push({ a: tiers[i].id, b: tiers[j].id, deltaE: d });
      if (d < VISUAL_RULES.TIER_BACKGROUND) issues.push({ code: 'TIER_BACKGROUND', message: `${tiers[i].name} and ${tiers[j].name} backgrounds are too similar (ΔE ${d.toFixed(1)})` });
    }
  }
  return { ok: issues.length === 0, issues, pairs };
}
