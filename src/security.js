/**
 * security.js — Rate limiting, security headers, Host-guard, CSRF,
 *               password hashing (PBKDF2), and session management.
 *
 * Sessions are persisted to data/sessions.json so they survive server
 * restarts. All writes are atomic (tmp-rename pattern).
 *
 * Zero external dependencies — Node.js built-ins only.
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { DATA_DIR } from './constants.js';

const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

export const LOCAL_IPC_TOKEN = randomBytes(32).toString('hex');

// ── Password Hashing (PBKDF2-SHA512, 100 000 iterations) ─────────────────────

/**
 * Hash a plaintext password and return a storable "salt:hash" string.
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 310_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function isHashValid(stored) {
  if (!stored) return false;
  const parts = stored.split(':');
  return parts.length === 2 && parts[0].length === 32 && parts[1].length === 128;
}

/**
 * Verify a plaintext password against a stored "salt:hash" string.
 * Uses timingSafeEqual to prevent timing attacks.
 * @param {string} password
 * @param {string} stored  — "salt:hash" from config
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  try {
    const [salt, storedHash] = stored.split(':');
    if (!salt || !storedHash) return false;
    const derived = pbkdf2Sync(password, salt, 310_000, 64, 'sha512').toString('hex');
    return timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

// ── Session Store ─────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** token → expiresAt (ms) */
const _sessions = new Map();

// ── Session Persistence ───────────────────────────────────────────────────────

/**
 * Atomically write the current session map to disk.
 * Uses tmp-file + rename to prevent data corruption on crash.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function persistSessions() {
  try {
    const obj = Object.fromEntries(_sessions);
    const tmp = SESSION_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
    await fs.rename(tmp, SESSION_FILE);
  } catch (err) {
    console.warn('⚠️  Failed to persist sessions:', err.message);
  }
}

/**
 * Load sessions from disk on startup. Prunes already-expired tokens.
 * Call once during server boot before accepting requests.
 */
export async function loadSessions() {
  try {
    const raw = JSON.parse(await fs.readFile(SESSION_FILE, 'utf8'));
    const now = Date.now();
    let loaded = 0;
    let pruned = 0;
    for (const [token, exp] of Object.entries(raw)) {
      if (typeof exp === 'number' && exp > now) {
        _sessions.set(token, exp);
        loaded++;
      } else {
        pruned++;
      }
    }
    if (loaded > 0 || pruned > 0) {
      console.log(`✅ Sessions restored: ${loaded} active, ${pruned} expired pruned.`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('⚠️  Could not load sessions file:', err.message);
    }
    // ENOENT is normal on first run — no sessions yet
  }
}

/**
 * Create a new cryptographically random session token, valid for 7 days.
 * Persists the updated session store to disk.
 * @returns {string}
 */
export function createSession() {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  _sessions.set(tokenHash, Date.now() + SESSION_TTL_MS);
  persistSessions(); // fire-and-forget
  return token;
}

export function destroySession(token) {
  if (token) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    if (_sessions.has(tokenHash)) {
      _sessions.delete(tokenHash);
      persistSessions(); // fire-and-forget
    }
  }
}

// ── Team Invite Tokens ─────────────────────────────────────────────────────────
/**
 * Generate a new team invite token (256-bit random hex).
 * The token is stored in config.teamTokens by the caller.
 * @param {string} label  Human-readable label for this token (e.g. 'Alice')
 * @returns {{ token: string, label: string, createdAt: string }}
 */
export function generateTeamToken(label = 'Team Member') {
  return {
    token: randomBytes(32).toString('hex'),
    label: String(label).slice(0, 64),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check whether a raw Authorization Bearer token is a valid team invite token.
 * Accepts the teamTokens array from config.
 * @param {string} raw               - The raw token string from the Authorization header
 * @param {Array}  teamTokens        - config.teamTokens array
 * @returns {boolean}
 */
export function isValidTeamToken(raw, teamTokens) {
  if (!raw || !Array.isArray(teamTokens) || !teamTokens.length) return false;
  return teamTokens.some(entry => {
    try {
      const a = Buffer.from(raw, 'hex');
      const b = Buffer.from(entry.token, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch { return false; }
  });
}

/**
 * Validate a session token — returns true if valid and not expired.
 * Removes and persists if expired.
 * @param {string} token
 * @returns {boolean}
 */
export function isValidSession(token) {
  if (!token) return false;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const exp = _sessions.get(tokenHash);
  if (!exp) return false;
  if (Date.now() > exp) {
    _sessions.delete(tokenHash);
    persistSessions(); // fire-and-forget
    return false;
  }
  // Slide the TTL forward on each valid check (keeps active users logged in)
  _sessions.set(tokenHash, Date.now() + SESSION_TTL_MS);
  persistSessions();
  return true;
}

// ── Periodic Cleanup ──────────────────────────────────────────────────────────

/**
 * Remove expired rate-limit windows and expired session tokens.
 * Call on a periodic interval (e.g. every 5 minutes) to prevent
 * the Maps growing without bound on long-running processes (M7).
 */
export function cleanupExpired() {
  const now = Date.now();
  let sessionsPruned = 0;

  for (const [key, entry] of _windows) {
    if (now - entry.windowStart > entry.windowMs) _windows.delete(key);
  }

  for (const [token, exp] of _sessions) {
    if (now > exp) {
      _sessions.delete(token);
      sessionsPruned++;
    }
  }

  // Only write to disk if we actually removed something
  if (sessionsPruned > 0) persistSessions();
}

// ── Rate Limiting (fixed-window counter per IP) ───────────────────────────────

const _windows = new Map(); // key: `${limiterKey}:${ip}` → { count, windowStart }

/**
 * Check whether the given IP has exceeded the rate limit for the named bucket.
 * Returns true (allow) or false (reject).
 *
 * @param {string} limiterKey  Logical bucket name (e.g. 'general', 'login')
 * @param {string} ip          Client IP address
 * @param {number} maxRequests Maximum requests allowed within the window
 * @param {number} windowMs    Window size in milliseconds
 */
export function checkRateLimit(limiterKey, ip, maxRequests, windowMs) {
  const key = `${limiterKey}:${ip}`;
  const now = Date.now();
  let entry = _windows.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now, windowMs };
  }

  entry.count += 1;
  entry.windowMs = windowMs;
  _windows.set(key, entry);
  return entry.count <= maxRequests;
}

// ── Security Response Headers ─────────────────────────────────────────────────

/**
 * Attach security-relevant HTTP response headers to every response.
 * Must be called before writeHead / sendJson / sendText.
 * @param {import('node:http').ServerResponse} response
 */
export function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cdnjs.cloudflare.com https://formspree.io https://api.github.com https://gist.github.com https://api.gist.github.com https://generativelanguage.googleapis.com https://api.linear.app https://hooks.slack.com https://*.atlassian.net https://wakatime.com"
  );
}

// ── Host / DNS-rebinding Guard ────────────────────────────────────────────────

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// In team mode, allow any IP address (DNS-rebinding relies on domains, so IPs are safe)
function isTeamModeIp(host) {
  return isIP(host) !== 0;
}

/**
 * Returns true if the Host header is allowed.
 * In solo mode: localhost only (DNS-rebinding protection).
 * In team mode: also allows any IP addresses.
 * Explicitly allows domains from REPOTRACKER_ALLOWED_HOSTS.
 * @param {import('node:http').IncomingMessage} request
 */
export function isAllowedHost(request) {
  if (process.env.REPOTRACKER_DISABLE_HOST_CHECK === 'true' || process.env.REPOTRACKER_DISABLE_HOST_CHECK === '1') return true;

  const rawHost = request.headers.host || '';
  const host = rawHost.replace(/:\d+$/, '').toLowerCase();

  const customHosts = process.env.REPOTRACKER_ALLOWED_HOSTS;
  if (customHosts && customHosts.split(',').map(s => s.trim().toLowerCase()).includes(host)) return true;

  if (ALLOWED_HOSTS.has(host)) return true;
  // Team mode: allow IP addresses so teammates can access the dashboard
  const teamMode = process.env.REPOTRACKER_TEAM === '1' || process.argv.includes('--team');
  if (teamMode && isTeamModeIp(host)) return true;
  return false;
}

export function isAllowedOrigin(request) {
  if (process.env.REPOTRACKER_DISABLE_HOST_CHECK === 'true' || process.env.REPOTRACKER_DISABLE_HOST_CHECK === '1') return true;

  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);

    const customHosts = process.env.REPOTRACKER_ALLOWED_HOSTS;
    if (customHosts && customHosts.split(',').map(s => s.trim().toLowerCase()).includes(hostname)) return true;

    if (ALLOWED_HOSTS.has(hostname)) return true;
    const teamMode = process.env.REPOTRACKER_TEAM === '1' || process.argv.includes('--team');
    if (teamMode && isTeamModeIp(hostname)) return true;
    return false;
  } catch { return false; }
}

/**
 * Build a Set-Cookie header value for the session token.
 * Adds the Secure flag when not running on localhost.
 * @param {string} token
 * @param {import('node:http').IncomingMessage} [request]
 * @returns {string}
 */
export function makeSessionCookie(token, request) {
  const host = request?.headers?.host?.replace(/:\d+$/, '') || 'localhost';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isIp = isTeamModeIp(host);
  // Allow insecure cookies for IP addresses (for EC2 testing) or if explicitly requested
  const allowInsecure = isLocalhost || isIp || process.env.REPOTRACKER_INSECURE_COOKIES === 'true';
  const secureFlag = allowInsecure ? '' : '; Secure';
  return `repo_auth=${token}; HttpOnly; SameSite=Strict; Path=/${secureFlag}`;
}
