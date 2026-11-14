function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
  return result;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0, 0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, 2 * far * near / (near - far), 0
  ]);
}

function lookAt(eye, target) {
  const normalize = v => {
    const length = Math.hypot(...v);
    return v.map(n => n / length);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = normalize(eye.map((n, i) => n - target[i]));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 4; i++) out[col * 4 + row] += a[i * 4 + row] * b[col * 4 + i];
    }
  }
  return out;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) throw new Error('WebGL is not available in this browser.');
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, `
    attribute vec3 position;
    attribute float shade;
    uniform mat4 viewProjection;
    uniform vec3 center;
    uniform vec3 size;
    varying float light;
    void main() {
      gl_Position = viewProjection * vec4(position * size + center, 1.0);
      light = shade;
    }
  `));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 color;
    varying float light;
    void main() { gl_FragColor = vec4(color * light, 1.0); }
  `));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const faces = [
    [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], 1],
    [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], 0.5],
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], 0.75],
    [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1], 0.75],
    [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1], 0.65],
    [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1], 0.85]
  ];
  const vertices = [];
  for (const face of faces) {
    for (const index of [0, 1, 2, 0, 2, 3]) vertices.push(...face[index].map(n => n / 2), face[4]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  const shade = gl.getAttribLocation(program, 'shade');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(shade);
  gl.vertexAttribPointer(shade, 1, gl.FLOAT, false, 16, 12);
  const uniforms = Object.fromEntries(['viewProjection', 'center', 'size', 'color'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.57, 0.79, 0.91, 1);

  function box(center, size, color) {
    gl.uniform3fv(uniforms.center, center);
    gl.uniform3fv(uniforms.size, size);
    gl.uniform3fv(uniforms.color, color);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }

  return (level, player) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cameraX = player.x * 0.5;
    const view = lookAt([cameraX, player.y + 7, player.z - 12], [cameraX, player.y + 1, player.z + 5]);
    gl.uniformMatrix4fv(uniforms.viewProjection, false, multiply(perspective(Math.PI / 3, width / height, 0.1, 100), view));
    for (const p of level.platforms) box([p.x, p.y, p.z], [p.width, p.height, p.depth], [0.35, 0.65, 0.35]);
    box([level.goal.x, level.goal.y + 0.7, level.goal.z], [0.3, 1.4, 0.3], [1, 0.83, 0.15]);
    box([player.x, player.y + 0.75, player.z], [0.8, 1.5, 0.8], [0.9, 0.3, 0.25]);
  };
}
