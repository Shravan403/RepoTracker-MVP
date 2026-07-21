import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { readFileSync, existsSync } from 'node:fs';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = path.join(__dirname, '..');
let packageVersion = '0.0.0';
try {
  packageVersion = JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version || packageVersion;
} catch {
  // Keep the fallback for unusual packaged/runtime environments.
}

export const APP_VERSION = process.env.npm_package_version || packageVersion;
export const DATA_DIR = existsSync('/.dockerenv') ? '/app/data' : path.join(os.homedir(), '.repotracker');
export const PUBLIC_DIR = path.join(__dirname, '..', 'public');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const META_FILE = path.join(DATA_DIR, 'repo-meta.json');
export const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
export const INSTALL_ID_FILE = path.join(DATA_DIR, 'install.json');
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace'); // Git backend for Team Workspace
export const PORT = Number(process.env.PORT || 4177);
export const DEFAULT_ROOT = os.homedir();

// Team mode: bind to all interfaces so LAN teammates can connect
export const TEAM_MODE = process.env.REPOTRACKER_TEAM === '1' || process.argv.includes('--team');
export const BIND_HOST = TEAM_MODE ? '0.0.0.0' : '127.0.0.1';

// Anonymous opt-in install counter — only active if PING_URL env var is set
export const PING_URL = process.env.PING_URL || '';

export const DEFAULT_CONFIG = {
  roots: [],
  maxDepth: 4,
  userName: '',
  githubPat: '',
  aiApiKey: '',
  wakatimeApiKey: '',
  appPasswordHash: '', // stored as "salt:hash" via PBKDF2, never plaintext
  onboardingComplete: false,
  gistSyncId: '',
  lastGistSync: null,
  teamTokens: [],           // Array of valid invite tokens for Team mode
  workspaceRepo: '',  // GitHub repo URL for Team Cloud Workspace
  workspaceLastSync: null,
  pingOptIn: null,    // null=not asked, true=opted in, false=opted out
  // Phase 3 Integrations
  slackWebhookUrl: '',
  linearApiKey: '',
  jiraDomain: '',
  jiraEmail: '',
  jiraApiToken: '',
};

export const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', '.next', '.nuxt', '.turbo', '.cache',
  'coverage', 'dist', 'build', 'out', 'node_modules', 'vendor',
  '.venv', 'venv', '__pycache__'
]);

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon'
};
