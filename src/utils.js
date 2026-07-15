import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './constants.js';

export function isDocker() {
  return existsSync('/.dockerenv');
}

export async function writeJsonIfMissing(filePath, value) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  }
}

export async function readJson(filePath, fallback) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, value) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tmp, filePath);
}

export function normalizeConfig(input = {}) {
  const roots = Array.isArray(input.roots)
    ? input.roots.map((root) => String(root).trim()).filter(Boolean)
    : DEFAULT_CONFIG.roots;

  const maxDepth = Number.isFinite(Number(input.maxDepth))
    ? Math.min(Math.max(Number(input.maxDepth), 1), 8)
    : DEFAULT_CONFIG.maxDepth;

  const githubPat      = typeof input.githubPat      === 'string' ? input.githubPat      : DEFAULT_CONFIG.githubPat;
  const aiApiKey       = typeof input.aiApiKey        === 'string' ? input.aiApiKey        : DEFAULT_CONFIG.aiApiKey;
  const wakatimeApiKey = typeof input.wakatimeApiKey  === 'string' ? input.wakatimeApiKey  : DEFAULT_CONFIG.wakatimeApiKey;
  const userName       = typeof input.userName        === 'string' ? input.userName        : DEFAULT_CONFIG.userName;

  // Support both old plaintext field (migration) and new hash field
  const appPasswordHash = typeof input.appPasswordHash === 'string'
    ? input.appPasswordHash
    : DEFAULT_CONFIG.appPasswordHash;

  const onboardingComplete = Boolean(input.onboardingComplete);
  const gistSyncId    = typeof input.gistSyncId   === 'string' ? input.gistSyncId   : DEFAULT_CONFIG.gistSyncId;
  const lastGistSync  = input.lastGistSync || DEFAULT_CONFIG.lastGistSync;

  const teamTokens    = Array.isArray(input.teamTokens) ? input.teamTokens : DEFAULT_CONFIG.teamTokens;
  const workspaceRepo = typeof input.workspaceRepo === 'string' ? input.workspaceRepo : DEFAULT_CONFIG.workspaceRepo;
  const workspaceLastSync = input.workspaceLastSync || DEFAULT_CONFIG.workspaceLastSync;
  const pingOptIn     = input.pingOptIn !== undefined ? input.pingOptIn : DEFAULT_CONFIG.pingOptIn;
  
  const slackWebhookUrl = typeof input.slackWebhookUrl === 'string' ? input.slackWebhookUrl : DEFAULT_CONFIG.slackWebhookUrl;
  const linearApiKey = typeof input.linearApiKey === 'string' ? input.linearApiKey : DEFAULT_CONFIG.linearApiKey;
  const jiraDomain = typeof input.jiraDomain === 'string' ? input.jiraDomain : DEFAULT_CONFIG.jiraDomain;
  const jiraEmail = typeof input.jiraEmail === 'string' ? input.jiraEmail : DEFAULT_CONFIG.jiraEmail;
  const jiraApiToken = typeof input.jiraApiToken === 'string' ? input.jiraApiToken : DEFAULT_CONFIG.jiraApiToken;

  return {
    roots: roots.length ? [...new Set(roots.map((root) => path.resolve(root)))] : DEFAULT_CONFIG.roots,
    maxDepth,
    userName,
    githubPat,
    aiApiKey,
    wakatimeApiKey,
    appPasswordHash,
    onboardingComplete,
    gistSyncId,
    lastGistSync,

    teamTokens,
    workspaceRepo,
    workspaceLastSync,
    pingOptIn,
    slackWebhookUrl,
    linearApiKey,
    jiraDomain,
    jiraEmail,
    jiraApiToken,
  };
}

/**
 * Return a config object safe to send to the browser:
 * - API keys are masked to '••• (saved)' if set, empty string if not
 * - appPasswordHash is NEVER included; instead a boolean appPasswordSet is sent
 */
export function sanitizeConfigForResponse(config) {
  const MASK = '••• (saved)';
  return {
    roots:              config.roots,
    maxDepth:           config.maxDepth,
    userName:           config.userName,
    githubPat:          config.githubPat      ? MASK : '',
    aiApiKey:           config.aiApiKey       ? MASK : '',
    wakatimeApiKey:     config.wakatimeApiKey ? MASK : '',

    appPasswordSet:     Boolean(config.appPasswordHash),
    onboardingComplete: Boolean(config.onboardingComplete),
    gistSyncId:         config.gistSyncId || '',
    lastGistSync:       config.lastGistSync || null,
    pingOptIn:          config.pingOptIn ?? null,
    teamMode:           Boolean(process.env.REPOTRACKER_TEAM === '1' || process.argv?.includes?.('--team')),
    workspaceRepo:      config.workspaceRepo || '',
    workspaceLastSync:  config.workspaceLastSync || null,
    slackWebhookUrl:    config.slackWebhookUrl ? MASK : '',
    linearApiKey:       config.linearApiKey ? MASK : '',
    jiraDomain:         config.jiraDomain || '', // Safe to expose
    jiraEmail:          config.jiraEmail || '',  // Safe to expose
    jiraApiToken:       config.jiraApiToken ? MASK : '',
    isDocker:           isDocker(),
  };
}

export async function readRequestJson(request, maxBytes = 1_048_576 /* 1 MB */) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Request body too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON body');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

export function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  response.end(body);
}

export function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  response.end(text);
}
