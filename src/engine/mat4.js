/**
 * Minimal column-major 4x4 matrix helpers (WebGL layout).
 * Kept allocation-light and dependency-free so they work in Node tests too.
 */

export function identity() {
  const out = new Float32Array(16);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let i = 0; i < 4; i++) sum += a[i * 4 + row] * b[col * 4 + i];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function translation(x, y, z) {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

export function scaling(x, y, z) {
  const out = identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

/** Rotation about X. Positive angles rotate +Y toward +Z. */
export function rotationX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const out = identity();
  out[5] = c; out[6] = s;
  out[9] = -s; out[10] = c;
  return out;
}

/** Rotation about Y. Positive angles rotate +Z toward +X. */
export function rotationY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const out = identity();
  out[0] = c; out[2] = -s;
  out[8] = s; out[10] = c;
  return out;
}

/** Rotation about Z. Positive angles rotate +X toward +Y. */
export function rotationZ(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const out = identity();
  out[0] = c; out[1] = s;
  out[4] = -s; out[5] = c;
  return out;
}

/** Multiply a chain of matrices left-to-right: compose(A, B, C) = A * B * C. */
export function compose(...matrices) {
  return matrices.reduce((acc, m) => multiply(acc, m));
}

export function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
