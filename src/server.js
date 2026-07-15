import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── Load .env file (no external dependency — Node built-ins only) ─────────────
const __dirname_s = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname_s, '..', '.env');
try {
  const envRaw = await fs.readFile(ENV_FILE, 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && val && !process.env[key]) process.env[key] = val; // don't override real env vars
  }
} catch { /* .env is optional — silently skip if missing */ }

import { PORT, CONFIG_FILE, DATA_DIR, PUBLIC_DIR, MIME_TYPES, DEFAULT_CONFIG, TEAM_MODE, BIND_HOST, PING_URL, INSTALL_ID_FILE, APP_VERSION } from './constants.js';
import { writeJsonIfMissing, sendText, sendJson, readJson, writeJson, normalizeConfig } from './utils.js';
import { handleApi, handleUpgrade } from './routes/api.js';
import { scanRepos } from './git.js';
import { notifyDesktop } from './notify.js';
import { applySecurityHeaders, isAllowedHost, isAllowedOrigin, checkRateLimit, cleanupExpired, hashPassword, isHashValid, loadSessions, isValidSession, LOCAL_IPC_TOKEN } from './security.js';
import { generateDashboardExport } from './export.js';
import { META_FILE } from './constants.js';

// AI endpoints use the user's own API key — exempt from server-side rate limiting.
const AI_PATHS = new Set(['/api/v1/standup', '/api/v1/repos/aisync', '/api/v1/repos/ai-review', '/api/v1/repos/ai-autofix', '/api/v1/repos/ai-chat', '/api/v1/ai/standup']);
// Integration endpoints: outbound calls to 3rd-party APIs — tighter bucket (10/min)
const INTEGRATION_PATHS = new Set(['/api/v1/integrations/issues', '/api/v1/integrations/slack']);

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let raw = null;
  try {
    raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('⚠️  config.json is missing or invalid — starting fresh.');
    }
  }

  if (raw === null || typeof raw !== 'object') {
    raw = { ...DEFAULT_CONFIG };
    await writeJson(CONFIG_FILE, raw);
  }

  await writeJsonIfMissing(path.join(DATA_DIR, 'repo-meta.json'), {});

  let dirty = false;
  // C1 migration: hash any plaintext appPassword still in config.json
  if (raw.appPassword && !raw.appPasswordHash) {
    console.log('\u2705 Migrating plaintext password to secure hash...');
    raw.appPasswordHash = hashPassword(raw.appPassword);
    delete raw.appPassword;
    dirty = true;
  }

  // Allow setting initial password via environment variable (useful for Docker)
  if (process.env.REPOTRACKER_PASSWORD && !raw.appPasswordHash) {
    console.log('\u2705 Applying password from REPOTRACKER_PASSWORD environment variable...');
    raw.appPasswordHash = hashPassword(process.env.REPOTRACKER_PASSWORD);
    dirty = true;
  }

  if (raw.appPasswordHash && !isHashValid(raw.appPasswordHash)) {
    console.warn('⚠️  Invalid password hash detected. Wiping it. You will need to setup a new password.');
    delete raw.appPasswordHash;
    dirty = true;
  }

  if (dirty) {
    await writeJson(CONFIG_FILE, raw);
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${cleanPath}`);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const type = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
    response.end(content);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    // ── Security guards (applied before anything else) ─────────────────────────
    applySecurityHeaders(response);

    if (!isAllowedHost(request)) {
      sendText(response, 400, 'Bad Request: Invalid Host header');
      return;
    }

    if (!isAllowedOrigin(request)) {
      sendText(response, 403, 'Forbidden: Cross-origin request rejected');
      return;
    }

    // M6: ensureDataFiles is called once at startup — not per-request
    if (request.url?.startsWith('/api/v1/')) {
      // ── Per-IP rate limiting (AI endpoints exempt) ────────────────────────
      const ip = request.socket.remoteAddress ?? 'unknown';
      const pathname = new URL(request.url, 'http://localhost').pathname;

      if (pathname === '/api/v1/login') {
        if (!checkRateLimit('login', ip, 10, 60_000)) {
          sendJson(response, 429, { error: 'Too many login attempts. Try again later.' });
          return;
        }
      } else if (pathname === '/api/v1/verify-github-token') {
        // Stricter bucket — unauthenticated endpoint that hits GitHub's API
        if (!checkRateLimit('gh-verify', ip, 5, 15 * 60_000)) {
          sendJson(response, 429, { error: 'Too many token verification attempts. Try again in 15 minutes.' });
          return;
        }
      } else if (INTEGRATION_PATHS.has(pathname)) {
        if (!checkRateLimit('integrations', ip, 10, 60_000)) {
          sendJson(response, 429, { error: 'Too many integration requests. Try again in a minute.' });
          return;
        }
      } else if (AI_PATHS.has(pathname)) {
        // AI endpoints: user's own API key — allow 10/min to cap abuse
        if (!checkRateLimit('ai', ip, 10, 60_000)) {
          sendJson(response, 429, { error: 'Too many AI requests. Try again in a minute.' });
          return;
        }
      } else {
        if (!checkRateLimit('general', ip, 60, 60_000)) {
          sendJson(response, 429, { error: 'Too many requests. Try again later.' });
          return;
        }
      }

      await handleApi(request, response);
      return;
    }

    // GET /export — generate and serve a self-contained HTML snapshot export
    const pathname2 = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && pathname2 === '/export') {
      // Auth guard: export contains all repo data — require a valid session or local IPC token
      const exportConfig = normalizeConfig(await readJson(CONFIG_FILE, DEFAULT_CONFIG));
      const cookies = request.headers.cookie || '';
      const match = cookies.match(/(^|;\s*)repo_auth=([^;]+)/);
      const token = match ? match[2] : (request.headers.authorization?.replace('Bearer ', '') || '');
      if (token !== LOCAL_IPC_TOKEN && !isValidSession(token)) {
        sendText(response, 401, 'Unauthorized');
        return;
      }
      try {
        const meta   = await readJson(META_FILE, {});
        const scanData = await scanRepos(exportConfig, meta);
        const html = generateDashboardExport(scanData, exportConfig);
        const buf = Buffer.from(html, 'utf8');
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="repotracker-export-${new Date().toISOString().slice(0,10)}.html"`,
          'Content-Length': buf.length,
        });
        response.end(buf);
      } catch (err) {
        console.error('[Export error]', err);
        sendText(response, 500, 'Export failed');
      }
      return;
    }

    if (request.url?.startsWith('/api/')) {
      sendJson(response, 404, { error: 'Unknown or unsupported API route' });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    if (error.code === 'PAYLOAD_TOO_LARGE') {
      sendJson(response, 413, { error: 'Request body too large (max 1 MB)' });
      return;
    }
    if (error.code === 'INVALID_JSON') {
      sendJson(response, 400, { error: 'Invalid JSON body' });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

async function runWorkerCycle() {
  try {
    const config = normalizeConfig(await readJson(CONFIG_FILE, DEFAULT_CONFIG));
    if (!config.roots.length) return;

    const meta = await readJson(path.join(DATA_DIR, 'repo-meta.json'), {});
    const scanData = await scanRepos(config, meta);

    const behindRepos = scanData.repos.filter(r => r.status.behind > 0);
    if (behindRepos.length > 0) {
      await notifyDesktop({
        title: 'RepoTracker Alert',
        message: `${behindRepos.length} repositories are behind their remote upstream!`
      });
    }
  } catch (err) {
    console.error('Background worker error:', err);
  }
}

async function startBackgroundWorker() {
  await runWorkerCycle(); // L5: run immediately on boot, then every 60 minutes
  setInterval(runWorkerCycle, 60 * 60 * 1000);

  // Background Workspace Sync (every 5 mins)
  setInterval(async () => {
    if (TEAM_MODE) {
      const config = normalizeConfig(await readJson(CONFIG_FILE, DEFAULT_CONFIG));
      if (config.workspaceRepo && config.githubPat && config.userName) {
        const { syncWorkspace } = await import('./sync.js');
        const res = await syncWorkspace(config);
        if (res.ok) {
          const newConfig = normalizeConfig({ ...config, workspaceLastSync: res.syncedAt });
          await writeJson(CONFIG_FILE, newConfig);
        }
      }
    }
  }, 5 * 60 * 1000);
}

// ── LAN IP Detection (for Team Mode) ─────────────────────────────────────────
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of (ifaces || [])) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

// ── Anonymous Install Ping (opt-in) ──────────────────────────────────────────
async function sendInstallPing(config) {
  if (!config?.pingOptIn) return; // only runs if user explicitly opted in
  try {
    const { readJson, writeJson } = await import('./utils.js');
    const install = await readJson(INSTALL_ID_FILE, {});
    if (install.pinged) return; // ping only once per installation
    const { randomBytes } = await import('node:crypto');
    const installId = install.id || randomBytes(16).toString('hex');
    await fetch(PING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: installId, version: APP_VERSION, platform: process.platform }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {}); // silent fail — never crash on ping
    await writeJson(INSTALL_ID_FILE, { id: installId, pinged: true, ts: Date.now() });
  } catch { /* silent */ }
}

server.listen(PORT, BIND_HOST, async () => {
  if (TEAM_MODE) {
    const lanIp = getLanIp();
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────┐');
    console.log(`  │  🚀 RepoTracker v${APP_VERSION}  —  TEAM MODE             │`);
    console.log(`  │  Solo:  http://localhost:${PORT}                    │`);
    if (lanIp) console.log(`  │  Team:  http://${lanIp}:${PORT}             │`);
    console.log('  └──────────────────────────────────────────────────┘');
    console.log('');
  } else {
    console.log(`RepoTracker v${APP_VERSION} running at http://localhost:${PORT}`);
      if (!process.versions.electron) {
        import('node:child_process').then(({ execFile }) => {
          const url = `http://localhost:${PORT}`;
          const [cmd, args] = process.platform === 'win32'
            ? ['cmd.exe', ['/c', 'start', url]]
            : process.platform === 'darwin'
              ? ['open', [url]]
              : ['xdg-open', [url]];
          execFile(cmd, args, { shell: false }, () => {});
        });
      }
  }
  console.log(`Scanning roots from ${CONFIG_FILE}`);
  await ensureDataFiles();
  await loadSessions();
  // Fire-and-forget install ping if user opted in (never crashes server)
  const { readJson: _rj, normalizeConfig: _nc } = await import('./utils.js');
  const _cfg = _nc(await _rj(CONFIG_FILE, DEFAULT_CONFIG));
  sendInstallPing(_cfg).catch(() => {});
  startBackgroundWorker().catch(err => console.error('Worker startup failed:', err));
  const cleanupInterval = setInterval(cleanupExpired, 5 * 60 * 1000);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  function shutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully...`);
    clearInterval(cleanupInterval);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    // Force-exit after 10s if connections are still open
    setTimeout(() => process.exit(0), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
});


server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Another RepoTracker instance may already be running.`);
    console.error(`   To fix: run  npx kill-port ${PORT}  then try again.\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.on('upgrade', (request, socket, head) => {
  if (!isAllowedHost(request) || !isAllowedOrigin(request)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  handleUpgrade(request, socket, head).catch(err => {
    console.error('WebSocket upgrade failed:', err);
    socket.destroy();
  });
});
