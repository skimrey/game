/**
 * Texture gallery: shows every material and verifies that each declared
 * `swatch` (used by the DOM-free visual audit) matches the painted texture.
 * Results are exposed on window.textureReport for automated checks.
 */
import { MATERIALS } from '../engine/materials.js';
import { paintTexture, TEXTURE_SIZE } from '../engine/textures.js';
import { deltaE } from '../levels/visualAudit.js';

export const SWATCH_TOLERANCE = 8;
const grid = document.getElementById('grid');
const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
const painted = new Map();
const paint = id => {
  if (!painted.has(id)) painted.set(id, paintTexture(id));
  return painted.get(id);
};

function averageColor(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  return sum.map(v => v / (data.length / 4) / 255);
}

const report = [];
for (const [name, m] of Object.entries(MATERIALS)) {
  const top = paint(m.top), side = paint(m.side);
  const measured = averageColor(top);
  const d = deltaE(measured, m.swatch);
  const ok = d <= SWATCH_TOLERANCE;
  report.push({ material: name, measured, swatch: m.swatch, deltaE: d, ok });

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>${name} <span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ΔE ${d.toFixed(1)}</span></h2>
    <div class="pair"><figure></figure><figure></figure></div>
    <div class="swatches">measured <span class="swatch" style="background:${css(measured)}"></span>
      declared <span class="swatch" style="background:${css(m.swatch)}"></span>
      ${m.fringe ? `fringe <span class="swatch" style="background:${css(m.fringe)}"></span>` : ''}</div>`;
  const [f1, f2] = card.querySelectorAll('figure');
  for (const [fig, canvas, label] of [[f1, top, `top: ${m.top}`], [f2, side, `side: ${m.side}`]]) {
    const copy = document.createElement('canvas');
    copy.width = copy.height = TEXTURE_SIZE;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    fig.append(copy);
    const cap = document.createElement('figcaption');
    cap.textContent = label;
    fig.append(cap);
  }
  grid.append(card);
}
window.textureReport = report;
