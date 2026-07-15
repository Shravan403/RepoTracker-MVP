import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn, execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CONFIG_FILE, META_FILE, DEFAULT_CONFIG } from '../constants.js';
import { readJson, writeJson, writeJsonIfMissing, normalizeConfig, readRequestJson, sendJson, sanitizeConfigForResponse, isDocker } from '../utils.js';
import { scanRepos, runGit, detectScripts, getCommitActivity, getStandupData } from '../git.js';
import { hashPassword, verifyPassword, createSession, destroySession, isValidSession, makeSessionCookie, LOCAL_IPC_TOKEN, isValidTeamToken } from '../security.js';
import { notifyDesktop } from '../notify.js';
import { pathResolver } from '../pathResolver.js';
import os from 'node:os';
import { WebSocketServer } from 'ws';

// A lightweight polyfill for node-pty using child_process
// This avoids C++ native compilation errors in Electron on Windows
const pty = {
  spawn: (command, args, options) => {
    const proc = spawn(command, args, { ...options, shell: false });
    
    // Simulate the pty API
    return {
      onData: (cb) => {
        proc.stdout.on('data', (data) => cb(data.toString()));
        proc.stderr.on('data', (data) => cb(data.toString()));
      },
      onExit: (cb) => {
        proc.on('close', (code) => cb({ exitCode: code || 0 }));
      },
      kill: () => proc.kill()
    };
  }
};

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const activeTasks = new Map(); // taskId -> ptyProcess
const MAX_ACTIVE_TASKS = 10;

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const taskId = url.searchParams.get('taskId');
  const termProcess = activeTasks.get(taskId);
  
  if (!termProcess) {
    ws.close(1008, 'Task not found');
    return;
  }

  const onData = (data) => ws.send(data);
  const dataListener = termProcess.onData(onData);

  ws.on('message', (msg) => {
    const text = Array.isArray(msg)
      ? Buffer.concat(msg).toString('utf8')
      : Buffer.isBuffer(msg)
        ? msg.toString('utf8')
        : msg instanceof ArrayBuffer
          ? Buffer.from(msg).toString('utf8')
          : String(msg);

    try {
      const data = JSON.parse(text);
      if (data.type === 'resize') {
        termProcess.resize(data.cols, data.rows);
        return;
      }
    } catch {
      termProcess.write(text);
    }
  });

  ws.on('close', () => {
    dataListener.dispose();
    try { termProcess.kill(); } catch {}
    activeTasks.delete(taskId);
  });

  const exitListener = termProcess.onExit((event) => {
    const code = event ? event.exitCode : 0;
    setTimeout(() => {
      try { ws.send(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`); } catch (e) {}
      ws.close(1000, 'Process exited');
    }, 1500);
    exitListener.dispose();
  });
});

export async function handleUpgrade(request, socket, head) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname === '/api/v1/tasks/stream') {
    const config = normalizeConfig(await readJson(CONFIG_FILE, DEFAULT_CONFIG));
    if (config.appPasswordHash) {
      let token = requestUrl.searchParams.get('token') || '';
      if (!token) token = getCookie(request, 'repo_auth') || '';
      if (!isValidSession(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
}

// ── Security helpers ──────────────────────────────────────────────────────────

function isPathInside(parentPath, childPath) {
  const norm = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
  const parent = norm(parentPath);
  const child = norm(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function getSafeEnv() {
  const env = { ...process.env };
  delete env.LEMONSQUEEZY_API_KEY;
  delete env.LEMONSQUEEZY_STORE_ID;
  delete env.LEMONSQUEEZY_PRO_PRODUCT_ID;
  delete env.LEMONSQUEEZY_TEAM_PRODUCT_ID;
  return env;
}

/** Ensure an existing path resolves inside one of the user's configured root dirs. */
async function isPathWithinRoots(candidatePath, roots) {
  let target;
  try {
    target = await fs.realpath(candidatePath);
  } catch {
    return false;
  }

  for (const root of roots) {
    try {
      const realRoot = await fs.realpath(root);
      if (isPathInside(realRoot, target)) return true;
    } catch {}
  }
  return false;
}

function ensureTaskCapacity(response) {
  if (activeTasks.size < MAX_ACTIVE_TASKS) return true;
  sendJson(response, 429, { error: 'Too many concurrent tasks' });
  return false;
}

/** Only allow https:// clone URLs and reject shell metacharacters. */
function isValidHttpsUrl(url) {
  try {
    if (/["'$`\\]/.test(url)) return false;
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Repo names must be simple filesystem-safe strings (no shell meta-chars). */
function isValidRepoName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(name);
}

/** Validate a git-grep query: reject null bytes and excessive length. */
function sanitizeSearchQuery(query) {
  if (typeof query !== 'string') return null;
  if (query.includes('\0')) return null;
  if (query.length > 200) return null;
  return query;
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || '';
  const match = cookies.match(new RegExp(`(^|;\\s*)${name}=([^;]+)`));
  return match ? match[2] : null;
}

function getSessionToken(request) {
  let token = getCookie(request, 'repo_auth') || '';
  if (token) return token;
  const authHeader = request.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

export async function handleApi(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const config = normalizeConfig(await readJson(CONFIG_FILE, DEFAULT_CONFIG));

  // M1: Enforce Content-Type on state-changing requests
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const ct = request.headers['content-type'] || '';
    const hasBody = Number(request.headers['content-length'] || 0) > 0 || Boolean(request.headers['transfer-encoding']);
    if (hasBody && !ct.startsWith('application/json')) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' });
      return;
    }
  }

  // POST /api/verify-github-token — exempt from session auth; called during onboarding
  // Rate-limited with its own stricter bucket in server.js (5 per 15 min per IP).
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/verify-github-token') {
    const body = await readRequestJson(request);
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      sendJson(response, 400, { ok: false, error: 'No token provided' });
      return;
    }
    try {
      const ghRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'RepoTracker'
        }
      });
      const data = await ghRes.json();
      if (ghRes.ok && data.login) {
        sendJson(response, 200, { ok: true, login: data.login, name: data.name || data.login, avatar_url: data.avatar_url });
      } else {
        sendJson(response, 200, { ok: false, error: data.message || 'Authentication failed' });
      }
    } catch (err) {
      sendJson(response, 200, { ok: false, error: 'Network error reaching GitHub' });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/login') {
    const body = await readRequestJson(request);

    // C1: Backward-compat migration — hash any remaining plaintext password
    if (config.appPassword && !config.appPasswordHash) {
      const hashed = hashPassword(config.appPassword);
      const migrated = normalizeConfig({ ...config, appPasswordHash: hashed });
      delete migrated.appPassword;
      await writeJson(CONFIG_FILE, migrated);
      config.appPasswordHash = hashed;
    }

    if (!config.appPasswordHash) {
      const isTeam = process.env.REPOTRACKER_TEAM === '1' || process.argv.includes('--team');
      if (isTeam && body.token !== LOCAL_IPC_TOKEN) {
        sendJson(response, 403, { error: 'Password required in Team Mode' });
        return;
      }
      // No password configured — issue a session token so the client has one
      const token = createSession();
      sendJson(response, 200, { ok: true, token }, { 'Set-Cookie': makeSessionCookie(token, request) });
    } else if (verifyPassword(body.password ?? '', config.appPasswordHash)) {
      const token = createSession();
      sendJson(response, 200, { ok: true, token }, { 'Set-Cookie': makeSessionCookie(token, request) });
    } else {
      sendJson(response, 401, { error: 'Incorrect password' });
    }
    return;
  }


  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/logout') {
    destroySession(getSessionToken(request));
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'repo_auth=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    return;
  }

  // C1/H2: Session-based auth — raw password is never sent after login
  if (config.appPasswordHash) {
    let token = getSessionToken(request);
    
    if (!token && requestUrl.pathname === '/api/v1/tasks/stream') {
      token = requestUrl.searchParams.get('token') || '';
    }
    if (!isValidSession(token) && !isValidTeamToken(token, config.teamTokens)) {
      sendJson(response, 401, { error: 'Unauthorized', userName: config.userName || '' });
      return;
    }
  } else {
    // SECURITY: Enforce local IPC token if no password is set
    const isSetupRoute = requestUrl.pathname === '/api/v1/config' && request.method === 'PUT' && !config.onboardingComplete;
    if (!isSetupRoute && requestUrl.pathname !== '/api/v1/suggest-roots' && requestUrl.pathname !== '/api/v1/verify-github-token') {
      let token = getSessionToken(request);
      if (!token && requestUrl.pathname === '/api/v1/tasks/stream') {
        token = requestUrl.searchParams.get('token') || '';
      }
      if (token !== LOCAL_IPC_TOKEN) {
        sendJson(response, 401, { error: 'Unauthorized. Local token required.', userName: config.userName || '' });
        return;
      }
    }
  }

  // C2: Return sanitized config — never expose raw API keys or password hash
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/config') {
    sendJson(response, 200, sanitizeConfigForResponse(config));
    return;
  }

  // GET /api/suggest-roots — guarded: exposes local filesystem paths
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/suggest-roots') {
    const existingPaths = await pathResolver.getCommonRoots();
    sendJson(response, 200, { suggestions: existingPaths });
    return;
  }



  // H1: Pick only known keys from the request body; handle masked sentinels
  if (request.method === 'PUT' && requestUrl.pathname === '/api/v1/config') {
    const body = await readRequestJson(request);
    const MASK = '\u2022\u2022\u2022 (saved)';

    // Sensitive fields: keep existing value when client sends the mask sentinel
    const githubPat      = body.githubPat      === MASK ? config.githubPat      : (typeof body.githubPat      === 'string' ? body.githubPat      : config.githubPat);
    const aiApiKey       = body.aiApiKey        === MASK ? config.aiApiKey       : (typeof body.aiApiKey        === 'string' ? body.aiApiKey        : config.aiApiKey);
    const wakatimeApiKey = body.wakatimeApiKey  === MASK ? config.wakatimeApiKey : (typeof body.wakatimeApiKey  === 'string' ? body.wakatimeApiKey  : config.wakatimeApiKey);

    // Password: empty = keep existing; non-empty = hash and store new
    let { appPasswordHash } = config;
    if (typeof body.appPassword === 'string' && body.appPassword !== '') {
      appPasswordHash = hashPassword(body.appPassword);
    }
    // Explicit clear: frontend sends clearPassword: true
    if (body.clearPassword === true) appPasswordHash = '';

    // onboardingComplete: once set to true, never go back to false
    const onboardingComplete = Boolean(body.onboardingComplete) || Boolean(config.onboardingComplete);

    // Always carry forward fields not controlled by the settings form

    const teamTokens          = config.teamTokens          || [];
    const pingOptIn           = config.pingOptIn           ?? null;
    const gistSyncId          = config.gistSyncId          || '';
    const lastGistSync        = config.lastGistSync        || null;
    const workspaceRepo       = body.workspaceRepo         !== undefined ? body.workspaceRepo : config.workspaceRepo;
    const workspaceLastSync   = config.workspaceLastSync   || null;
    const slackWebhookUrl     = body.slackWebhookUrl       !== undefined ? body.slackWebhookUrl : config.slackWebhookUrl;
    const linearApiKey        = body.linearApiKey          !== undefined ? body.linearApiKey : config.linearApiKey;
    const jiraDomain          = body.jiraDomain            !== undefined ? body.jiraDomain : config.jiraDomain;
    const jiraEmail           = body.jiraEmail             !== undefined ? body.jiraEmail : config.jiraEmail;
    const jiraApiToken        = body.jiraApiToken          !== undefined ? body.jiraApiToken : config.jiraApiToken;

    const updatedRoots = body.roots || [];
    const oldRoots = config.roots || [];
    
    // Only validate newly added roots to maintain backward compatibility
    for (const r of updatedRoots) {
      if (!oldRoots.includes(r)) {
        const validation = await pathResolver.validateRoot(r);
        if (!validation.valid) {
          sendJson(response, 400, { error: validation.error });
          return;
        }
      }
    }

    const updatedConfig = normalizeConfig({
      roots:          updatedRoots,
      maxDepth:       body.maxDepth,
      userName:       body.userName,
      githubPat,
      aiApiKey,
      wakatimeApiKey,
      appPasswordHash,
      onboardingComplete,

      teamTokens,
      pingOptIn,
      gistSyncId,
      lastGistSync,
      workspaceRepo,
      workspaceLastSync,
      slackWebhookUrl,
      linearApiKey,
      jiraDomain,
      jiraEmail,
      jiraApiToken
    });
    await writeJson(CONFIG_FILE, updatedConfig);
    sendJson(response, 200, sanitizeConfigForResponse(updatedConfig));
    return;
  }


  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/repos') {
    const meta = await readJson(META_FILE, {});
    const rawRepos = await scanRepos(config, meta);
    const repos = Array.isArray(rawRepos) ? rawRepos : (rawRepos.repos || []);

    // Feature 3: Smart Desktop Notifications — fire alerts for repos needing attention
    // Throttled: max 1 notification per repo per hour via meta.json lastNotifiedAt
    const now = Date.now();
    const HOUR_MS = 60 * 60 * 1000;
    let metaDirty = false;
    const notifMeta = meta._notifications || {};

    for (const repo of repos) {
      if (repo.isRemoteOnly) continue;
      const lastNotified = notifMeta[repo.path]?.at || 0;
      if (now - lastNotified < HOUR_MS) continue; // cooldown active

      let title = null;
      let message = null;

      // Priority order: CI fail > commits behind > massive dirty > stale
      if (repo.github?.ci === 'failure' && notifMeta[repo.path]?.lastCi !== 'failure') {
        title = `❌ CI Failed — ${repo.name}`;
        message = `A CI check just failed on ${repo.name}. Check GitHub Actions.`;
      } else if (repo.status?.behind >= 5) {
        title = `⚠️ ${repo.name} is falling behind`;
        message = `${repo.name} is ${repo.status.behind} commits behind origin/${repo.status.currentBranch || 'main'}.`;
      } else if (repo.status?.dirtyCount >= 20) {
        title = `🟡 ${repo.name} has many uncommitted changes`;
        message = `${repo.status.dirtyCount} uncommitted files in ${repo.name}. Consider committing or stashing.`;
      } else if (repo.isStale) {
        const days = repo.daysSinceCommit || 30;
        title = `💤 ${repo.name} is inactive`;
        message = `No commits in ${days} day${days !== 1 ? 's' : ''}. Still active?`;
      }

      if (title) {
        notifyDesktop({ title, message }).catch(() => {}); // fire-and-forget
        notifMeta[repo.path] = { at: now, lastCi: repo.github?.ci || null };
        metaDirty = true;
      }
    }

    if (metaDirty) {
      await writeJson(META_FILE, { ...meta, _notifications: notifMeta });
    }

    sendJson(response, 200, rawRepos);
    return;
  }

  if (request.method === 'PATCH' && requestUrl.pathname === '/api/v1/repos/meta') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath) {
      sendJson(response, 400, { error: 'Missing repo path' });
      return;
    }
    if (!(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    const meta = await readJson(META_FILE, {});
    meta[repoPath] = {
      ...(meta[repoPath] || {}),
      pinned: typeof body.pinned === 'boolean' ? body.pinned : Boolean(meta[repoPath]?.pinned),
      note: typeof body.note === 'string' ? body.note.slice(0, 800) : meta[repoPath]?.note || '',
      tags: Array.isArray(body.tags) ? body.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 12) : meta[repoPath]?.tags || []
    };
    await writeJson(META_FILE, meta);
    sendJson(response, 200, meta[repoPath]);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/timeline') {
    const meta = await readJson(META_FILE, {});
    const scanData = await scanRepos(config, meta);
    const allCommits = [];
    await Promise.all(scanData.repos.map(async (repo) => {
      const logs = await runGit(repo.path, ['log', '-10', '--format=%h%x09%ct%x09%s%x09%an']);
      if (logs) {
        logs.split(/\r?\n/).forEach(line => {
          const [hash, timestamp, subject, author] = line.split('\t');
          if (hash && timestamp) {
            allCommits.push({ repoName: repo.name, repoPath: repo.path, hash, timestamp: Number(timestamp) * 1000, subject, author });
          }
        });
      }
    }));
    allCommits.sort((a, b) => b.timestamp - a.timestamp);
    sendJson(response, 200, allCommits.slice(0, 50));
    return;
  }

  // M2: github-proxy restricted to GET + safe endpoint allowlist
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/github-proxy') {
    if (!config.githubPat) { sendJson(response, 401, { error: 'No GitHub PAT configured' }); return; }
    const body = await readRequestJson(request);
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    
    let ghUrl;
    try {
      ghUrl = new URL(endpoint, 'https://api.github.com');
      if (ghUrl.origin !== 'https://api.github.com') throw new Error('Invalid origin');
    } catch {
      sendJson(response, 400, { error: 'Invalid GitHub endpoint URL' });
      return;
    }

    const ALLOWED_ENDPOINT = /^\/repos\/[^/]+\/[^/]+(\/(commits|issues|pulls|actions\/runs)(\/.*)?)?$|^\/user(\/repos)?$/;
    if (!ALLOWED_ENDPOINT.test(ghUrl.pathname)) {
      sendJson(response, 400, { error: 'GitHub endpoint not allowed' });
      return;
    }
    
    try {
      const ghResponse = await fetch(ghUrl.toString(), {
        method: 'GET', // Force read-only
        headers: { 'Authorization': `Bearer ${config.githubPat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoTracker' }
      });
      const data = await ghResponse.json();
      sendJson(response, ghResponse.status, data);
    } catch (err) { 
      console.error('[Route Error]', err);
      sendJson(response, 500, { error: 'Operation failed. See server logs for details.' });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/open') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    try {
      await fs.access(repoPath);
      const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(command, [repoPath], { detached: true, stdio: 'ignore', shell: false }).unref();
      sendJson(response, 200, { opened: repoPath });
    } catch { sendJson(response, 404, { error: 'Repository path not found' }); }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/system/check-update') {
    const isExe = Boolean(process.pkg); // true when running as a packaged .exe
    try {
      if (isExe) {
        // ── Packaged .exe: compare against GitHub latest release tag ──────────
        const ghRes = await fetch('https://api.github.com/repos/Vinit080/repotracker/releases/latest', {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'RepoTracker-App' },
          signal: AbortSignal.timeout(8000),
        });
        if (!ghRes.ok) throw new Error('GitHub API error');
        const ghData = await ghRes.json();
        const latestTag  = ghData.tag_name || '';                    // e.g. "v0.3.1"
        const currentVer = 'v' + (process.env.npm_package_version || '0.0.0');
        // Simple semver compare: strip leading 'v' and split
        const parseVer = v => v.replace(/^v/, '').split('.').map(Number);
        const [lMaj, lMin, lPatch] = parseVer(latestTag);
        const [cMaj, cMin, cPatch] = parseVer(currentVer);
        const updateAvailable =
          lMaj > cMaj || (lMaj === cMaj && lMin > cMin) || (lMaj === cMaj && lMin === cMin && lPatch > cPatch);
        const downloadUrl = `https://github.com/Vinit080/repotracker/releases/tag/${latestTag}`;
        sendJson(response, 200, { updateAvailable, isExe: true, latestVersion: latestTag, currentVersion: currentVer, downloadUrl });
      } else {
        // ── Git clone: check how many commits behind origin/main ──────────────
        await execFileAsync('git', ['fetch'], { cwd: process.cwd() });
        const { stdout } = await execFileAsync('git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd: process.cwd() });
        const commitsBehind = parseInt(stdout.trim(), 10) || 0;
        sendJson(response, 200, { updateAvailable: commitsBehind > 0, isExe: false, commitsBehind });
      }
    } catch (err) {
      sendJson(response, 500, { error: 'Failed to check for updates' });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/system/apply-update') {
    if (process.pkg) {
      // .exe users cannot self-update — this should never be called, but guard anyway
      sendJson(response, 400, { error: 'Please download the latest .exe from the GitHub Releases page.' });
      return;
    }
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: process.cwd() });
      try {
        const remoteUrl = new URL(stdout.trim());
        if (remoteUrl.hostname !== 'github.com' || !remoteUrl.pathname.startsWith('/Vinit080/repotracker')) {
          throw new Error('Mismatch');
        }
      } catch {
        sendJson(response, 403, { error: 'Remote URL mismatch — update aborted' });
        return;
      }
      await execFileAsync('git', ['pull'], { cwd: process.cwd() });
      // P10: use execFileAsync (not execAsync) to avoid shell injection
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      await execFileAsync(npmCmd, ['install'], { cwd: process.cwd() });
      sendJson(response, 200, { ok: true });
      setTimeout(() => process.exit(0), 1000);
    } catch (err) {
      console.error('[Route Error]', err);
      sendJson(response, 500, { error: 'Operation failed. See server logs for details.' });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/dialog/folder') {
    try {
      let selectedPath = '';
      if (process.platform === 'win32') {
        const psCmd = `
          Add-Type -AssemblyName System.Windows.Forms
          $f = New-Object System.Windows.Forms.OpenFileDialog
          $f.ValidateNames = $false
          $f.CheckFileExists = $false
          $f.CheckPathExists = $true
          $f.FileName = 'Select Folder.'
          $f.Title = 'Select Folder'
          $f.Filter = 'Folders|\n'
          if ($f.ShowDialog() -eq 'OK') {
              Write-Output ([System.IO.Path]::GetDirectoryName($f.FileName))
          }
        `;
        const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psCmd]);
        selectedPath = stdout.trim();
      } else if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder)']);
        selectedPath = stdout.trim();
      } else {
        const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory']);
        selectedPath = stdout.trim();
      }
      if (selectedPath) {
        sendJson(response, 200, { path: selectedPath });
      } else {
        sendJson(response, 200, { path: '', canceled: true });
      }
    } catch (err) {
      sendJson(response, 500, { error: 'Failed to open dialog' });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/integrations/issues') {
    const issues = [];
    const promises = [];

    // 1. Jira
    if (config.jiraDomain && config.jiraEmail && config.jiraApiToken) {
      promises.push((async () => {
        try {
          const auth = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');
          const jql = encodeURIComponent('assignee=currentUser() AND statusCategory != Done');
          const res = await fetch(`https://${config.jiraDomain}/rest/api/3/search?jql=${jql}`, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
          });
          if (res.ok) {
            const data = await res.json();
            for (const issue of (data.issues || [])) {
              issues.push({
                id: issue.key,
                title: issue.fields?.summary || 'Untitled',
                state: issue.fields?.status?.name || 'Open',
                source: 'Jira',
                url: `https://${config.jiraDomain}/browse/${issue.key}`
              });
            }
          }
        } catch (e) { console.error('Jira fetch failed', e); }
      })());
    }

    // 2. Linear
    if (config.linearApiKey) {
      promises.push((async () => {
        try {
          const query = `{ viewer { assignedIssues(filter: { state: { type: { neq: "completed" } } }) { nodes { identifier title url state { name } } } } }`;
          const res = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { 'Authorization': config.linearApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
          });
          if (res.ok) {
            const data = await res.json();
            const nodes = data?.data?.viewer?.assignedIssues?.nodes || [];
            for (const node of nodes) {
              issues.push({
                id: node.identifier,
                title: node.title,
                state: node.state?.name || 'Open',
                source: 'Linear',
                url: node.url
              });
            }
          }
        } catch (e) { console.error('Linear fetch failed', e); }
      })());
    }

    // 3. GitHub
    if (config.githubPat) {
      promises.push((async () => {
        try {
          const res = await fetch('https://api.github.com/issues?filter=assigned&state=open', {
            headers: {
              'Authorization': `Bearer ${config.githubPat}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'RepoTracker'
            }
          });
          if (res.ok) {
            const data = await res.json();
            for (const issue of data) {
              issues.push({
                id: `#${issue.number}`,
                title: issue.title,
                state: issue.state,
                source: 'GitHub',
                url: issue.html_url
              });
            }
          }
        } catch (e) { console.error('GitHub fetch failed', e); }
      })());
    }

    await Promise.allSettled(promises);
    sendJson(response, 200, { issues });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/integrations/slack') {
    if (!config.slackWebhookUrl) {
      sendJson(response, 400, { error: 'Slack webhook URL not configured' });
      return;
    }
    try {
      const body = await readRequestJson(request);
      if (typeof body.text !== 'string' || body.text.length === 0 || body.text.length > 4000) {
        sendJson(response, 400, { error: 'Invalid message: must be a non-empty string under 4000 characters' });
        return;
      }
      const res = await fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body.text })
      });
      if (!res.ok) throw new Error('Slack API returned ' + res.status);
      sendJson(response, 200, { ok: true });
    } catch (err) {
      sendJson(response, 500, { error: 'Slack delivery failed' });
    }
    return;
  }


  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/terminal') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    try {
      await fs.access(repoPath);
      if (!ensureTaskCapacity(response)) return;
      const taskId = randomBytes(16).toString('hex');
      const command = process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env.SHELL || 'bash'); // respects zsh, fish, etc. on Mac/Linux
      
      const ptyProcess = pty.spawn(command, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: repoPath,
        env: getSafeEnv()
      });
      activeTasks.set(taskId, ptyProcess);

      ptyProcess.onExit(() => {
        setTimeout(() => activeTasks.delete(taskId), 10000);
      });

      sendJson(response, 200, { taskId });
    } catch { sendJson(response, 404, { error: 'Repository path not found' }); }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/action') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    const scriptCmd = body.scriptCmd; // New parameter passed from frontend

    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    if (!scriptCmd || typeof scriptCmd !== 'string') {
      sendJson(response, 400, { error: 'Missing or invalid script command' });
      return;
    }

    try {
      await fs.access(repoPath);
      const scripts = await detectScripts(repoPath) || [];
      const allowedCmds = new Set(scripts.map(s => s.cmd));
      if (!allowedCmds.has(scriptCmd)) {
        sendJson(response, 403, { error: 'Command not allowed' });
        return;
      }

      if (!ensureTaskCapacity(response)) return;

      const taskId = randomBytes(16).toString('hex');
      const command = process.platform === 'win32' ? 'cmd.exe' : 'sh';
      const args = process.platform === 'win32' ? ['/c', scriptCmd] : ['-c', scriptCmd];
      
      const ptyProcess = pty.spawn(command, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: repoPath,
        env: getSafeEnv()
      });
      activeTasks.set(taskId, ptyProcess);

      ptyProcess.onExit(() => {
        setTimeout(() => activeTasks.delete(taskId), 3000); // keep around for 3s
      });

      sendJson(response, 200, { taskId });
    } catch { sendJson(response, 404, { error: 'Repository path not found' }); }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/setup') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    try {
      await fs.access(repoPath);
      if (!ensureTaskCapacity(response)) return;
      const taskId = randomBytes(16).toString('hex');
      const command = process.platform === 'win32' ? 'cmd.exe' : 'sh';
      const winArgs = [
        '/c',
        'echo Pulling latest code... & git pull & ' +
        'if exist package.json (echo. & echo Installing NPM dependencies... & call npm install) & ' +
        'if exist requirements.txt (echo. & echo Installing Python dependencies... & pip install -r requirements.txt) & ' +
        'if exist Cargo.toml (echo. & echo Fetching Cargo dependencies... & cargo fetch) & ' +
        'if exist go.mod (echo. & echo Downloading Go modules... & go mod download)'
      ];
      const macArgs = [
        '-c',
        `echo "Pulling latest code..."; git pull; ` +
        `if [ -f package.json ]; then echo "\\nInstalling NPM dependencies..."; npm install; fi; ` +
        `if [ -f requirements.txt ]; then echo "\\nInstalling Python dependencies..."; pip install -r requirements.txt; fi; ` +
        `if [ -f Cargo.toml ]; then echo "\\nFetching Cargo dependencies..."; cargo fetch; fi; ` +
        `if [ -f go.mod ]; then echo "\\nDownloading Go modules..."; go mod download; fi`
      ];
      
      const ptyProcess = pty.spawn(command, process.platform === 'win32' ? winArgs : macArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: repoPath,
        env: getSafeEnv()
      });
      activeTasks.set(taskId, ptyProcess);

      ptyProcess.onExit(() => {
        setTimeout(() => activeTasks.delete(taskId), 10000);
      });

      sendJson(response, 200, { taskId });
    } catch (e) { console.error('[setup error]', e); sendJson(response, 404, { error: 'Repository path not found or inaccessible' }); }
    return;
  }

  // Shelby Terminal: Kill task
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/tasks/kill') {
    const body = await readRequestJson(request);
    const child = activeTasks.get(body.taskId);
    if (child) {
      try {
        child.kill();
      } catch (e) { }
      activeTasks.delete(body.taskId);
      sendJson(response, 200, { ok: true });
    } else {
      sendJson(response, 404, { error: 'Task not found' });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/search') {
    const body = await readRequestJson(request);
    const query = sanitizeSearchQuery(body.query);
    if (!query) {
      sendJson(response, 400, { error: 'Invalid or missing search query' });
      return;
    }
    const meta = await readJson(META_FILE, {});
    const scanData = await scanRepos(config, meta);
    const results = [];
    await Promise.all(scanData.repos.map(async (repo) => {
      try {
        const out = await runGit(repo.path, ['grep', '-n', '-i', '-I', '-e', query]);
        if (out) {
          out.split(/\r?\n/).forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 3) results.push({ repo: repo.name, path: repo.path, file: parts[0], line: parts[1], content: parts.slice(2).join(':').trim() });
          });
        }
      } catch { }
    }));
    sendJson(response, 200, { results: results.slice(0, 100) });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/audit') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    try {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const { stdout } = await execFileAsync(npmCmd, ['audit', '--json'], { 
        cwd: repoPath, 
        maxBuffer: 10 * 1024 * 1024,
        shell: false
      });
      sendJson(response, 200, JSON.parse(stdout));
    } catch (err) {
      if (err.stdout) {
        try {
          sendJson(response, 200, JSON.parse(err.stdout));
        } catch (e) {
          sendJson(response, 500, { error: 'Invalid JSON output from npm audit' });
        }
      } else {
        console.error('[Route Error]', err);
        sendJson(response, 500, { error: 'Operation failed. See server logs for details.' });
      }
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/todos') {
    const meta = await readJson(META_FILE, {});
    const scanData = await scanRepos(config, meta);
    const results = [];
    await Promise.all(scanData.repos.map(async (repo) => {
      try {
        const out = await runGit(repo.path, ['grep', '-n', '-i', '-E', 'TODO:|FIXME:|HACK:']);
        if (out) {
          out.split(/\r?\n/).forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 3) {
              results.push({
                repo: repo.name,
                path: repo.path,
                file: parts[0],
                line: parts[1],
                content: parts.slice(2).join(':').trim()
              });
            }
          });
        }
      } catch { }
    }));
    sendJson(response, 200, { results: results.slice(0, 200) });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/aisync') {
    if (!config.aiApiKey) { sendJson(response, 401, { error: 'No AI API Key configured' }); return; }
    // ai_sync is a FREE feature available to all tiers — no license check required
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' });
      return;
    }
    try {
      await fs.access(repoPath);
      // Get combined diff (unstaged + staged)
      const diff1 = await runGit(repoPath, ['diff']);
      const diff2 = await runGit(repoPath, ['diff', '--staged']);
      const combinedDiff = (diff1 + '\n' + diff2).trim();

      if (!combinedDiff) {
        sendJson(response, 400, { error: 'No changes to commit' });
        return;
      }

      const prompt = `Write a concise 1-line professional git commit message for these changes. Return ONLY the commit message string, no quotes or markdown formatting.\n\nDiff:\n${combinedDiff.slice(0, 10000)}`;

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${config.aiApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await aiResponse.json();
      if (data.error) throw new Error(data.error.message);

      const message = (data.candidates?.[0]?.content?.parts?.[0]?.text || 'Auto-sync changes').trim();

      await runGit(repoPath, ['add', '-A']);
      await runGit(repoPath, ['commit', '-m', message]);
      await runGit(repoPath, ['push']);

      sendJson(response, 200, { ok: true, message });
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/wakatime') {
    if (!config.wakatimeApiKey) { sendJson(response, 401, { error: 'No WakaTime API Key configured' }); return; }
    try {
      // P8: AbortController timeout so a slow/down WakaTime never hangs the request
      const auth = Buffer.from(config.wakatimeApiKey).toString('base64');
      const wakaRes = await fetch(`https://wakatime.com/api/v1/users/current/stats/last_7_days`, {
        headers: { 'Authorization': `Basic ${auth}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await wakaRes.json();
      sendJson(response, wakaRes.status, data);
    } catch (err) { sendJson(response, 500, { error: err.name === 'TimeoutError' ? 'WakaTime request timed out' : err.message }); }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/github/repos') {
    if (!config.githubPat) { sendJson(response, 401, { error: 'No GitHub PAT configured' }); return; }
    try {
      const allRepos = [];
      let page = 1;
      const MAX_PAGES = 20;
      while (page <= MAX_PAGES) {
        const ghResponse = await fetch(
          `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
          {
            headers: { 'Authorization': `Bearer ${config.githubPat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoTracker' },
            signal: AbortSignal.timeout(15000),
          }
        );
        if (!ghResponse.ok) { const err = await ghResponse.json(); sendJson(response, ghResponse.status, err); return; }
        const batch = await ghResponse.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        allRepos.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      sendJson(response, 200, allRepos);
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/clone') {
    const body = await readRequestJson(request);
    const targetRoot = body.root ? path.resolve(body.root) : '';
    const cloneUrl = body.url;
    const repoName = body.name;

    if (!targetRoot || !cloneUrl || !repoName) {
      sendJson(response, 400, { error: 'Missing root, url, or name' });
      return;
    }
    if (!isValidHttpsUrl(cloneUrl)) {
      sendJson(response, 400, { error: 'Clone URL must use the https:// scheme' });
      return;
    }
    if (!isValidRepoName(repoName)) {
      sendJson(response, 400, { error: 'Invalid repository name' });
      return;
    }
    if (!(await isPathWithinRoots(targetRoot, config.roots))) {
      sendJson(response, 403, { error: 'Target root is outside configured roots' });
      return;
    }

    try {
      await fs.access(targetRoot);
    } catch (e) {
      sendJson(response, 400, { error: 'Target root directory does not exist or is inaccessible.' });
      return;
    }

    try {
      const targetPath = path.join(targetRoot, repoName);
      let realRoot;
      try {
        realRoot = await fs.realpath(targetRoot);
      } catch (err) {
        sendJson(response, 400, { error: `The target directory (${targetRoot}) does not exist. Please check your Workspace Settings.` });
        return;
      }
      if (!isPathInside(realRoot, path.resolve(targetPath))) {
        sendJson(response, 403, { error: 'Clone target escapes selected root' });
        return;
      }
      if (!ensureTaskCapacity(response)) return;
      const taskId = randomBytes(16).toString('hex');
      const gitCmd = process.platform === 'win32' ? 'git.exe' : 'git';
      const ptyProcess = pty.spawn(gitCmd, ['clone', '--progress', cloneUrl, targetPath], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: targetRoot,
        env: getSafeEnv()
      });
      activeTasks.set(taskId, ptyProcess);

      ptyProcess.onExit(() => {
        setTimeout(() => activeTasks.delete(taskId), 10000);
      });

      sendJson(response, 200, { ok: true, taskId });
    } catch (e) {
      sendJson(response, 500, { error: 'Failed to start git clone process' });
    }
    return;
  }


  // GET /api/team/status — return team mode status and active token count
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/team/status') {
    const teamMode = Boolean(process.env.REPOTRACKER_TEAM === '1' || process.argv?.includes?.('--team'));
    const teamUrl = teamMode ? `http://${(() => {
      const ifaces = Object.values(os.networkInterfaces());
      for (const list of ifaces) {
        for (const iface of (list || [])) {
          if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
      }
      return 'localhost';
    })()}:${config.port || 4177}` : null;
    const tokens = Array.isArray(config.teamTokens) ? config.teamTokens : [];
    sendJson(response, 200, { teamMode, teamUrl, tokenCount: tokens.length });
    return;
  }

  // POST /api/team/token — generate a new team invite token
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/team/token') {
    const body = await readRequestJson(request);
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : 'Teammate';
    const token = randomBytes(32).toString('hex'); // 256-bit
    const newToken = { token, label, createdAt: new Date().toISOString() };
    const tokens = Array.isArray(config.teamTokens) ? [...config.teamTokens, newToken] : [newToken];
    const updatedConfig = normalizeConfig({ ...config, teamTokens: tokens });
    await writeJson(CONFIG_FILE, updatedConfig);
    sendJson(response, 200, { ok: true, token: newToken });
    return;
  }

  // DELETE /api/team/token — revoke a team invite token
  if (request.method === 'DELETE' && requestUrl.pathname === '/api/v1/team/token') {
    const body = await readRequestJson(request);
    const tokenToRevoke = typeof body.token === 'string' ? body.token : '';
    const revokeHex = Buffer.from(tokenToRevoke, 'hex');
    const tokens = (config.teamTokens || []).filter(t => {
      try {
        const stored = Buffer.from(t.token, 'hex');
        return stored.length !== revokeHex.length || !timingSafeEqual(stored, revokeHex);
      } catch { return true; }
    });
    const updatedConfig = normalizeConfig({ ...config, teamTokens: tokens });
    await writeJson(CONFIG_FILE, updatedConfig);
    sendJson(response, 200, { ok: true });
    return;
  }

  // POST /api/team/workspace/init — configure and clone the workspace repo
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/team/workspace/init') {
    const body = await readRequestJson(request);
    const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl.trim() : '';
    
    if (!repoUrl) { sendJson(response, 400, { error: 'Repository URL is required.' }); return; }
    if (!config.githubPat || !config.userName) { sendJson(response, 400, { error: 'GitHub PAT and Username must be configured in settings first.' }); return; }

    try {
      const { initWorkspace, syncWorkspace } = await import('../sync.js');
      await initWorkspace(repoUrl, config.githubPat, config.userName);
      
      const updatedConfig = normalizeConfig({ ...config, workspaceRepo: repoUrl });
      await writeJson(CONFIG_FILE, updatedConfig);
      
      // Do an initial sync
      const syncRes = await syncWorkspace(updatedConfig);
      if (syncRes.ok) {
        const finalConfig = normalizeConfig({ ...updatedConfig, workspaceLastSync: syncRes.syncedAt });
        await writeJson(CONFIG_FILE, finalConfig);
      }

      sendJson(response, 200, { ok: true });
    } catch (err) {
      console.error(err);
      sendJson(response, 500, { error: 'Failed to initialize workspace' });
    }
    return;
  }

  // POST /api/team/workspace/sync — trigger a manual sync
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/team/workspace/sync') {
    if (!config.workspaceRepo) { sendJson(response, 400, { error: 'Workspace not configured' }); return; }
    try {
      const { syncWorkspace } = await import('../sync.js');
      const res = await syncWorkspace(config);
      if (res.ok) {
        const updatedConfig = normalizeConfig({ ...config, workspaceLastSync: res.syncedAt });
        await writeJson(CONFIG_FILE, updatedConfig);
        sendJson(response, 200, res);
      } else {
        sendJson(response, 500, res);
      }
    } catch (err) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  // GET /api/activity — return recent local activity log
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/activity') {
    const { getRecentActivity, getWeeklyStats } = await import('../activity.js');
    const [recent, weekly] = await Promise.all([getRecentActivity(50), getWeeklyStats()]);
    
    // Mix in workspace activity if configured and team mode is active
    if (config.workspaceRepo && (process.env.REPOTRACKER_TEAM === '1' || process.argv?.includes?.('--team'))) {
      try {
        const { getWorkspaceState } = await import('../sync.js');
        const wsState = await getWorkspaceState();
        
        // Merge and sort
        const combined = [...recent];
        for (const wsEvent of wsState.activity) {
          // simple dedupe
          if (!combined.some(e => e.timestamp === wsEvent.timestamp && e.repoName === wsEvent.repoName && e.action === wsEvent.action)) {
            combined.push(wsEvent);
          }
        }
        combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        sendJson(response, 200, { recent: combined.slice(0, 50), weekly, workspace: true });
        return;
      } catch (err) {
        console.error('Failed to get workspace state', err);
      }
    }

    sendJson(response, 200, { recent, weekly, workspace: false });
    return;
  }

  // POST /api/ping-optin — save the user's ping opt-in preference
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/ping-optin') {
    const body = await readRequestJson(request);
    const optIn = body.optIn === true;
    const updatedConfig = normalizeConfig({ ...config, pingOptIn: optIn });
    await writeJson(CONFIG_FILE, updatedConfig);
    sendJson(response, 200, { ok: true, pingOptIn: optIn });
    return;
  }

  // POST /api/repos/ai-review — AI code review for a repository
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/ai-review') {
    if (!config.aiApiKey) { sendJson(response, 401, { error: 'No AI API Key configured' }); return; }
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' }); return;
    }
    try {
      await fs.access(repoPath);
      const diff = (await runGit(repoPath, ['diff', 'HEAD~1', 'HEAD'])) || (await runGit(repoPath, ['diff'])) || '';
      if (!diff.trim()) { sendJson(response, 400, { error: 'No diff available to review' }); return; }
      const prompt = `You are an expert code reviewer. Review the following git diff and provide:
1. A brief summary of what changed (2-3 sentences)
2. Any potential bugs or issues found
3. Security concerns (if any)
4. Suggestions for improvement

Diff:
${diff.slice(0, 12000)}

Respond in concise markdown format.`;
      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${config.aiApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await aiResponse.json();
      if (data.error) throw new Error(data.error.message);
      const review = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No review generated.';
      sendJson(response, 200, { ok: true, review });
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  // POST /api/repos/ai-autofix — automatically generate and apply a code fix
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/ai-autofix') {
    if (!config.aiApiKey) { sendJson(response, 401, { error: 'No AI API Key configured' }); return; }

    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' }); return;
    }
    try {
      await fs.access(repoPath);
      // Get current unstaged and staged changes
      const diff = await runGit(repoPath, ['diff', 'HEAD']);
      if (!diff.trim()) { sendJson(response, 400, { error: 'No changes to fix.' }); return; }

      const prompt = `You are an expert AI code auto-fixer. Analyze the following diff, find any bugs or improvements, and output a valid Unified Diff (.patch format) that fixes them. 
Return ONLY the raw unified diff text. Do not wrap it in markdown code blocks. Do not add any conversational text.

Diff:
${diff.slice(0, 15000)}`;

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${config.aiApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await aiResponse.json();
      if (data.error) throw new Error(data.error.message);
      
      let patchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      patchText = patchText.replace(/^\`\`\`(diff|patch)?/m, '').replace(/\`\`\`$/m, '').trim();

      if (!patchText) throw new Error('AI did not generate a patch.');

      // Write patch to a temp file and apply
      const patchFile = path.join(os.tmpdir(), `repotracker-autofix-${Date.now()}.patch`);
      await fs.writeFile(patchFile, patchText + '\n');
      
      try {
        await runGit(repoPath, ['apply', patchFile]);
        sendJson(response, 200, { ok: true, message: 'Fix applied successfully!' });
      } catch (applyErr) {
        throw new Error('Failed to apply AI patch: ' + applyErr.message);
      } finally {
        await fs.unlink(patchFile).catch(()=>{});
      }
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  // POST /api/repos/ai-chat — Context-aware chat with your codebase
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/ai-chat') {
    if (!config.aiApiKey) { sendJson(response, 401, { error: 'No AI API Key configured' }); return; }
    
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    const message = typeof body.message === 'string' ? body.message : '';
    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' }); return;
    }
    try {
      await fs.access(repoPath);
      // Collect context: repo structure + recent diff
      const tree = await runGit(repoPath, ['ls-tree', '-r', 'HEAD', '--name-only']).catch(()=>'');
      const diff = await runGit(repoPath, ['diff', 'HEAD']).catch(()=>'');
      
      const prompt = `You are RepoTracker AI, an expert assistant for the developer's current repository.
Here is the context of the repository:
[FILE STRUCTURE]
${tree.slice(0, 5000)}

[CURRENT WORK IN PROGRESS (DIFF)]
${diff.slice(0, 5000)}

User: ${message}
Respond in concise markdown.`;

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${config.aiApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await aiResponse.json();
      if (data.error) throw new Error(data.error.message);
      
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
      sendJson(response, 200, { reply });
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  // POST /api/repos/branch — branch operations (list, checkout, create, merge, delete)
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/repos/branch') {
    const body = await readRequestJson(request);
    const repoPath = body.path ? path.resolve(body.path) : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const branchName = typeof body.branch === 'string' ? body.branch.trim() : '';

    if (!repoPath || !(await isPathWithinRoots(repoPath, config.roots))) {
      sendJson(response, 403, { error: 'Path outside configured roots' }); return;
    }
    // Validate branch name to prevent injection
    if (branchName && !/^[a-zA-Z0-9._\-/]{1,100}$/.test(branchName)) {
      sendJson(response, 400, { error: 'Invalid branch name' }); return;
    }
    try {
      await fs.access(repoPath);
      if (action === 'list') {
        const out = await runGit(repoPath, ['branch', '-a', '--format=%(refname:short)|%(HEAD)']);
        const branches = (out || '').split(/\r?\n/).filter(Boolean).map(line => {
          const [name, current] = line.split('|');
          return { name: name.trim(), current: current === '*' };
        });
        sendJson(response, 200, { branches });
      } else if (action === 'checkout') {
        if (!branchName) { sendJson(response, 400, { error: 'Branch name required' }); return; }
        await runGit(repoPath, ['checkout', branchName]);
        sendJson(response, 200, { ok: true });
      } else if (action === 'create') {
        if (!branchName) { sendJson(response, 400, { error: 'Branch name required' }); return; }
        await runGit(repoPath, ['checkout', '-b', branchName]);
        sendJson(response, 200, { ok: true });
      } else if (action === 'merge') {
        if (!branchName) { sendJson(response, 400, { error: 'Branch name required' }); return; }
        await runGit(repoPath, ['merge', branchName]);
        sendJson(response, 200, { ok: true });
      } else if (action === 'delete') {
        if (!branchName) { sendJson(response, 400, { error: 'Branch name required' }); return; }
        await runGit(repoPath, ['branch', '-d', branchName]);
        sendJson(response, 200, { ok: true });
      } else {
        sendJson(response, 400, { error: 'Unknown branch action' });
      }
    } catch (err) { sendJson(response, 500, { error: err.message }); }
    return;
  }

  // ── Feature 1: Gist Config Sync ──────────────────────────────────────────────

  // POST /api/config/sync-to-gist — serialize config and push to a GitHub Gist
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/config/sync-to-gist') {
    if (!config.githubPat) { sendJson(response, 401, { error: 'No GitHub PAT configured. Add one in Settings.' }); return; }
    try {
      // Build a sanitized snapshot — no secrets, no password hash
      const snapshot = {
        _meta: { app: 'RepoTracker', version: process.env.npm_package_version || '0.0.0', syncedAt: new Date().toISOString() },
        roots:            config.roots,
        maxDepth:         config.maxDepth,
        userName:         config.userName,
        // NOTE: secrets (githubPat, aiApiKey, wakatimeApiKey) are intentionally omitted
      };
      const content = JSON.stringify(snapshot, null, 2);
      const gistPayload = {
        description: 'RepoTracker Config Sync',
        public: false,
        files: { 'repotracker-config.json': { content } },
      };

      let gistId = config.gistSyncId || '';
      let gistRes;

      if (gistId) {
        // Update existing Gist
        gistRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${config.githubPat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoTracker', 'Content-Type': 'application/json' },
          body: JSON.stringify(gistPayload),
          signal: AbortSignal.timeout(10000),
        });
      } else {
        // Create new Gist
        gistRes = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.githubPat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoTracker', 'Content-Type': 'application/json' },
          body: JSON.stringify(gistPayload),
          signal: AbortSignal.timeout(10000),
        });
      }

      if (!gistRes.ok) {
        const err = await gistRes.json();
        sendJson(response, gistRes.status, { error: err.message || 'GitHub Gist API error' });
        return;
      }

      const gistData = await gistRes.json();
      gistId = gistData.id;

      // Persist the gist ID and sync timestamp
      const updatedConfig = normalizeConfig({ ...config, gistSyncId: gistId, lastGistSync: new Date().toISOString() });
      await writeJson(CONFIG_FILE, updatedConfig);

      sendJson(response, 200, { ok: true, gistId, gistUrl: gistData.html_url, syncedAt: updatedConfig.lastGistSync });
    } catch (err) {
      sendJson(response, 500, { error: err.name === 'TimeoutError' ? 'GitHub request timed out' : err.message });
    }
    return;
  }

  // POST /api/config/restore-from-gist — fetch config snapshot from a GitHub Gist and merge
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/config/restore-from-gist') {
    if (!config.githubPat) { sendJson(response, 401, { error: 'No GitHub PAT configured. Add one in Settings.' }); return; }
    const body = await readRequestJson(request);
    const gistId = typeof body.gistId === 'string' ? body.gistId.trim() : '';
    if (!gistId) { sendJson(response, 400, { error: 'Gist ID is required.' }); return; }

    try {
      const gistRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
        headers: { 'Authorization': `Bearer ${config.githubPat}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'RepoTracker' },
        signal: AbortSignal.timeout(10000),
      });

      if (!gistRes.ok) {
        const err = await gistRes.json();
        sendJson(response, gistRes.status, { error: err.message || 'Gist not found or not accessible.' });
        return;
      }

      const gistData = await gistRes.json();
      const fileContent = gistData.files?.['repotracker-config.json']?.content;
      if (!fileContent) { sendJson(response, 400, { error: 'No RepoTracker config found in this Gist.' }); return; }

      let snapshot;
      try { snapshot = JSON.parse(fileContent); } catch { sendJson(response, 400, { error: 'Gist content is not valid JSON.' }); return; }

      if (snapshot._meta?.app !== 'RepoTracker') {
        sendJson(response, 400, { error: 'This Gist does not appear to be a RepoTracker config.' }); return;
      }

      // Merge snapshot into current config — only safe fields, preserve secrets
      const merged = normalizeConfig({
        ...config,
        roots:     Array.isArray(snapshot.roots)    ? snapshot.roots    : config.roots,
        maxDepth:  typeof snapshot.maxDepth === 'number' ? snapshot.maxDepth : config.maxDepth,
        userName:  typeof snapshot.userName === 'string' ? snapshot.userName : config.userName,
        gistSyncId:  gistId,
        lastGistSync: new Date().toISOString(),
      });
      await writeJson(CONFIG_FILE, merged);

      sendJson(response, 200, { ok: true, restoredAt: merged.lastGistSync, roots: merged.roots });
    } catch (err) {
      sendJson(response, 500, { error: err.name === 'TimeoutError' ? 'GitHub request timed out' : err.message });
    }
    return;
  }

  // ── Insight Charts & AI Standup ──────────────────────────────────────────
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/insights/activity') {
    try {
      const meta = await readJson(META_FILE, {});
      const scanData = await scanRepos(config, meta);
      const allPaths = scanData.repos.map(r => r.path);
      
      const results = await Promise.all(
        allPaths.map(p => getCommitActivity(p, 90))
      );
      
      const counts = {};
      results.flat().forEach(date => {
        counts[date] = (counts[date] || 0) + 1;
      });
      
      sendJson(response, 200, counts);
    } catch (err) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/ai/standup') {
    if (!config.aiApiKey) {
      sendJson(response, 400, { error: 'AI API Key is missing. Please configure it in Settings.' });
      return;
    }
    try {
      const meta = await readJson(META_FILE, {});
      const scanData = await scanRepos(config, meta);
      const allPaths = scanData.repos.map(r => r.path);
      
      const results = await Promise.all(
        allPaths.map(p => getStandupData(p, 7))
      );
      
      const activeRepos = results.filter(Boolean);
      
      if (!activeRepos.length) {
        sendJson(response, 200, { standup: 'No recent activity found across your repositories in the last 7 days.' });
        return;
      }

      let promptContext = 'Here is my local git activity across multiple repositories from the last 7 days:\\n\\n';
      for (const repo of activeRepos) {
        promptContext += `Repository: ${repo.name}\\n`;
        if (repo.commits.length) {
          promptContext += `Recent Commits:\\n${repo.commits.map(c => `  - ${c}`).join('\\n')}\\n`;
        }
        if (repo.status.length) {
          promptContext += `Uncommitted Changes (git status --short):\\n${repo.status.map(s => `  - ${s}`).join('\\n')}\\n`;
        }
        promptContext += '\\n';
      }

      promptContext += `\\nAct as a brilliant engineering manager doing a weekly standup review for me. 
Based on this raw data, write a beautifully formatted markdown summary of:
1. What I accomplished this week.
2. What is currently left hanging (uncommitted work).
Keep it encouraging, concise, and professional.`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.aiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptContext }] }],
          generationConfig: { temperature: 0.4 }
        })
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        throw new Error(geminiData.error?.message || 'Gemini API failed');
      }

      const standupText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
      sendJson(response, 200, { standup: standupText });
    } catch (err) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  // GET /api/health — unauthenticated health check for monitoring
  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/health') {
    sendJson(response, 200, {
      ok: true,
      version: process.env.npm_package_version || '0.0.0',
      uptime: Math.floor(process.uptime()),
    });
    return;
  }

  sendJson(response, 404, { error: 'Unknown API route' });
}
