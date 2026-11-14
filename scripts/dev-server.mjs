#!/usr/bin/env node
/**
 * Dev server with live reload + Chrome launcher (no dependencies).
 *
 *   npm run dev                          # serve on :8000, open index.html in Chrome
 *   node scripts/dev-server.mjs --open playground.html --port 8000
 *   node scripts/dev-server.mjs --no-open
 *   node scripts/dev-server.mjs --quality test    # low-resolution testing mode (≥ 30 fps on the software-rendered VM)
 *
 * - Serves the project with caching disabled (ES modules always fresh).
 * - Injects a tiny live-reload client into every HTML page.
 * - Watches the project; on every edit, open pages reload automatically.
 * - Launches Chrome with the page open; if that window was closed, the next
 *   edit launches it again.
 *
 * Rendering: on machines without a GPU (no /dev/dri render node on Linux) Chrome is
 * launched with --disable-gpu-compositing: WebGL still runs on SwiftShader, but the
 * page is composited by Chrome's CPU compositor instead of *through* the emulated GPU.
 * Measured on the test VM this cut the per-frame floor from 32 to 12 ms of CPU and
 * took the playground's test mode from ~26 to ~46 fps (see perf/README.md).
 * Force either way with --software / --gpu.
 *
 * Chrome is found via $CHROME_PATH, common install locations, or Playwright's
 * bundled Chromium. Chrome runs with --remote-debugging-port (default 9222) so
 * tools can inspect the live page.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 || args[i + 1]?.startsWith('--') ? fallback : args[i + 1];
};
const PORT = Number(option('port', 8000));
const QUALITY = option('quality', null);   // 'test' | 'normal' (see src/quality.js)
const PAGE = (() => {
  const page = option('open', 'index.html');
  if (!QUALITY) return page;
  return `${page}${page.includes('?') ? '&' : '?'}quality=${encodeURIComponent(QUALITY)}`;
})();
const OPEN = !flag('no-open');
const DEBUG_PORT = Number(option('debug-port', 9222));
/** Is there a usable GPU? (Linux: a DRM render node; other OSes: assume yes.) */
function hasGpu() {
  if (flag('software')) return false;
  if (flag('gpu')) return true;
  if (process.platform !== 'linux') return true;
  try {
    return fs.readdirSync('/dev/dri').some(name => name.startsWith('renderD'));
  } catch {
    return false;
  }
}
const SOFTWARE_RENDERING = !hasGpu();

const IGNORE = [/^\.git\//, /^node_modules\//, /^screenshots\//, /(^|\/)\.[^/]*$/, /~$/, /\.swp$/];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const RELOAD_CLIENT = `
<script>
  (() => {
    const source = new EventSource('/__livereload');
    source.addEventListener('reload', () => location.reload());
  })();
</script>`;

// ---------------------------------------------------------------------------
// Live reload (server-sent events)
// ---------------------------------------------------------------------------
const clients = new Set();
function broadcastReload(files) {
  for (const res of clients) res.write(`event: reload\ndata: ${JSON.stringify(files)}\n\n`);
  return clients.size;
}

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/__livereload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (ext === '.html') {
      console.log(`[${new Date().toLocaleTimeString()}] page load: ${url.pathname}${url.search}`);
      const html = data.toString('utf8');
      data = Buffer.from(html.includes('</body>') ? html.replace('</body>', `${RELOAD_CLIENT}\n</body>`) : html + RELOAD_CLIENT);
    }
    res.writeHead(200, headers).end(data);
  });
});

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      candidates.push(execFileSync('which', [name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
    } catch { /* not installed */ }
  }
  // Playwright's bundled Chromium
  for (const dir of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(os.homedir(), '.cache/ms-playwright')].filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      candidates.push(path.join(dir, entry, 'chrome-linux', 'chrome'));
    }
  }
  return candidates.find(c => c && fs.existsSync(c)) || null;
}

let chrome = null;
function launchChrome() {
  if (!OPEN || (chrome && chrome.exitCode === null)) return;
  const executable = findChrome();
  const url = `http://localhost:${PORT}/${PAGE}`;
  if (!executable) {
    console.log(`Chrome not found (set CHROME_PATH). Open ${url} manually.`);
    return;
  }
  const profile = path.join(os.tmpdir(), 'game-dev-chrome-profile');
  chrome = spawn(executable, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader', // WebGL fallback on machines/VMs without a GPU
    ...(SOFTWARE_RENDERING ? ['--disable-gpu-compositing'] : []),
    '--start-maximized',
    '--new-window',
    url,
  ], {
    stdio: 'ignore',
    detached: false,
    // silence the "Google API keys are missing" bar on plain Chromium builds
    env: { ...process.env, GOOGLE_API_KEY: 'no', GOOGLE_DEFAULT_CLIENT_ID: 'no', GOOGLE_DEFAULT_CLIENT_SECRET: 'no' },
  });
  chrome.on('exit', code => console.log(`Chrome closed (${code ?? 'signal'}); it will reopen on the next edit.`));
  console.log(`Launched Chrome → ${url}${SOFTWARE_RENDERING ? ' (no GPU: CPU compositing)' : ''}`);
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------
let pending = new Set();
let timer = null;
fs.watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const rel = filename.split(path.sep).join('/');
  if (IGNORE.some(re => re.test(rel))) return;
  pending.add(rel);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const files = [...pending];
    pending = new Set();
    const reloaded = broadcastReload(files);
    console.log(`[${new Date().toLocaleTimeString()}] changed: ${files.join(', ')} → reloaded ${reloaded} page(s)`);
    launchChrome(); // reopen Chrome if the window was closed
  }, 150);
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}/  (live reload on, watching ${ROOT})`);
  launchChrome();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (chrome && chrome.exitCode === null) chrome.kill();
    process.exit(0);
  });
}
