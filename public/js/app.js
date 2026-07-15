import { api, localIpcToken } from './api.js';
import { escapeHtml, escapeAttribute, safeUrl, renderChip, emptySmall } from './components.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  repos: [],
  config: null,
  query: '',
  filter: 'all',
  loading: false,
  timeline: []
};

// ─── DOM References ───────────────────────────────────────────────────────────
const el = {
  shell: document.querySelector('.shell'),
  wizard: document.querySelector('#wizard'),

  // Wizard
  wizardEl: document.querySelector('#wizard'),
  wizardStepLabel: document.querySelector('#wizardStepLabel'),
  wizardDots: document.querySelectorAll('.wizard-dot'),
  wizardSteps: document.querySelectorAll('.wizard-step'),
  // Step 1
  wizStep1Next: document.querySelector('#wizStep1Next'),
  wizName: document.querySelector('#wiz-name'),
  wizPw: document.querySelector('#wiz-pw'),
  wizPwConfirm: document.querySelector('#wiz-pw-confirm'),
  wizPwError: document.querySelector('#wizPwError'),
  wizSkipPwCheck: document.querySelector('#wizSkipPwCheck'),
  // Step 2
  wizStep2Back: document.querySelector('#wizStep2Back'),
  wizStep2Next: document.querySelector('#wizStep2Next'),
  wizStep2Skip: document.querySelector('#wizStep2Skip'),
  wizFolderList: document.querySelector('#wizFolderList'),
  wizAddFolderBtn: document.querySelector('#wizAddFolderBtn'),
  // Step 3
  wizStep3Back: document.querySelector('#wizStep3Back'),
  wizStep3Next: document.querySelector('#wizStep3Next'),
  wizStep3Skip: document.querySelector('#wizStep3Skip'),
  wizGhToken: document.querySelector('#wizGhToken'),
  wizVerifyBtn: document.querySelector('#wizVerifyBtn'),
  wizTokenStatus: document.querySelector('#wizTokenStatus'),
  // Step 4
  wizStep4Back: document.querySelector('#wizStep4Back'),
  wizFinishBtn: document.querySelector('#wizFinishBtn'),
  wizSkipAllBtn: document.querySelector('#wizSkipAllBtn'),
  wizAiKey: document.querySelector('#wizAiKey'),
  wizWakaKey: document.querySelector('#wizWakaKey'),

  // Auth
  authDialog: document.querySelector('#authDialog'),
  authForm: document.querySelector('#authForm'),
  authPasswordInput: document.querySelector('#authPasswordInput'),
  authGreeting: document.querySelector('#authGreeting'),

  // Update Banner
  systemUpdateBanner: document.querySelector('#systemUpdateBanner'),
  updateBannerText: document.querySelector('#updateBannerText'),
  applyUpdateBtn: document.querySelector('#applyUpdateBtn'),

  // Topbar
  scanButton: document.querySelector('#scanButton'),
  themeToggleBtn: document.querySelector('#themeToggleBtn'),
  feedbackBtn: document.querySelector('#feedbackBtn'),
  logoutBtn: document.querySelector('#logoutBtn'),

  // Repos tab
  scanMeta: document.querySelector('#scanMeta'),
  spotlight: document.querySelector('#spotlight'),
  metricsGrid: document.querySelector('#metricsGrid'),
  searchInput: document.querySelector('#searchInput'),
  filterRow: document.querySelector('#filterRow'),
  repoGrid: document.querySelector('#repoGrid'),
  resultCount: document.querySelector('#resultCount'),

  // Templates
  repoCardTemplate: document.getElementById('repoCardTemplate'),

  // Insights tab
  attentionList: document.querySelector('#attentionList'),
  languageList: document.querySelector('#languageList'),
  timelineList: document.querySelector('#timelineList'),
  todoList: document.querySelector('#todoList'),
  standupButton: document.querySelector('#standupButton'),
  standupDialog: document.querySelector('#standupDialog'),
  standupContent: document.querySelector('#standupContent'),

  // Feedback tab
  feedbackDialog: document.querySelector('#feedbackDialog'),
  feedbackForm: document.querySelector('#feedbackForm'),
  feedbackText: document.querySelector('#feedbackText'),

  // Settings tab
  rootsInput: document.querySelector('#rootsInput'),
  settingsBrowseBtn: document.querySelector('#settingsBrowseBtn'),
  depthInput: document.querySelector('#depthInput'),
  userNameInput: document.querySelector('#userNameInput'),
  patInput: document.querySelector('#patInput'),
  aiKeyInput: document.querySelector('#aiKeyInput'),
  wakaKeyInput: document.querySelector('#wakaKeyInput'),
  appPasswordInput: document.querySelector('#appPasswordInput'),
  slackWebhookInput: document.querySelector('#slackWebhookInput'),
  linearKeyInput: document.querySelector('#linearKeyInput'),
  jiraDomainInput: document.querySelector('#jiraDomainInput'),
  jiraEmailInput: document.querySelector('#jiraEmailInput'),
  jiraTokenInput: document.querySelector('#jiraTokenInput'),
  saveSettingsButton: document.querySelector('#saveSettingsButton'),

  // Integrations UI
  myTicketsBtn: document.querySelector('#myTicketsBtn'),
  myTicketsDialog: document.querySelector('#myTicketsDialog'),
  myTicketsList: document.querySelector('#myTicketsList'),
  myTicketsCloseBtn: document.querySelector('#myTicketsCloseBtn'),
  postToSlackBtn: document.querySelector('#postToSlackBtn'),
  updateReadyBtn: document.querySelector('#updateReadyBtn'),

  // Modals
  searchDialog: document.querySelector('#searchDialog'),
  globalSearchInput: document.querySelector('#globalSearchInput'),
  searchResults: document.querySelector('#searchResults'),
  cloneDialog: document.querySelector('#cloneDialog'),
  cloneDestSelect: document.querySelector('#cloneDestSelect'),
  confirmCloneButton: document.querySelector('#confirmCloneButton'),

  // Shelby Terminal
  shelbyTerminal: document.querySelector('#shelbyTerminal'),
  shelbyResizer: document.querySelector('#shelbyResizer'),
  shelbyStatus: document.querySelector('#shelbyStatus'),
  shelbyCloseBtn: document.querySelector('#shelbyCloseBtn'),
  shelbyAbortBtn: document.querySelector('#shelbyAbortBtn'),
};

// ─── Shelby Terminal ──────────────────────────────────────────────────────────
let activeShelbyTask = null;
let shelbyWs = null;
let shelbyTerminalInstance = null;
let shelbyFitAddon = null;

function initTerminal() {
  if (shelbyTerminalInstance) return;
  const container = document.getElementById('terminal-container');
  
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg-card').split(',')[0].replace('linear-gradient(145deg', '').replace('(', '').trim() || 'transparent'; // Fallback if parsing fails
  const text = style.getPropertyValue('--text').trim() || '#fdfdfd';
  const accent = style.getPropertyValue('--accent').trim() || '#ff66a3';

  shelbyTerminalInstance = new Terminal({
    theme: {
      background: 'transparent',
      foreground: text,
      cursor: accent,
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255, 102, 163, 0.3)',
      black: '#1e212b',
      red: '#ff4a4a',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: text
    },
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 14,
    cursorBlink: true
  });
  shelbyFitAddon = new FitAddon.FitAddon();
  shelbyTerminalInstance.loadAddon(shelbyFitAddon);
  shelbyTerminalInstance.open(container);
  
  shelbyTerminalInstance.onData(data => {
    if (shelbyWs && shelbyWs.readyState === WebSocket.OPEN) {
      shelbyWs.send(data);
    }
  });

  window.addEventListener('resize', () => {
    if (!el.shelbyTerminal.classList.contains('hidden') && shelbyFitAddon) {
      shelbyFitAddon.fit();
      if (shelbyWs && shelbyWs.readyState === WebSocket.OPEN) {
        shelbyWs.send(JSON.stringify({ type: 'resize', cols: shelbyTerminalInstance.cols, rows: shelbyTerminalInstance.rows }));
      }
    }
  });
}

function openShelby(title, taskId) {
  el.shelbyStatus.textContent = `— ${title}`;
  el.shelbyTerminal.classList.remove('hidden');
  el.shelbyAbortBtn.classList.remove('hidden');
  activeShelbyTask = taskId;

  initTerminal();
  shelbyTerminalInstance.clear();
  // slightly delay fit to ensure DOM is updated
  setTimeout(() => { shelbyFitAddon.fit(); }, 50);

  if (shelbyWs) shelbyWs.close();

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const tokenParam = localIpcToken ? `&token=${localIpcToken}` : '';
  shelbyWs = new WebSocket(`${protocol}//${location.host}/api/v1/tasks/stream?taskId=${taskId}${tokenParam}`);

  shelbyWs.onopen = () => {
    shelbyWs.send(JSON.stringify({ type: 'resize', cols: shelbyTerminalInstance.cols, rows: shelbyTerminalInstance.rows }));
  };

  shelbyWs.onmessage = (e) => {
    shelbyTerminalInstance.write(e.data);
  };

  shelbyWs.onclose = () => {
    shelbyTerminalInstance.write('\r\n[Stream disconnected]\r\n');
    el.shelbyAbortBtn.classList.add('hidden');
    activeShelbyTask = null;
  };
}

if (el.shelbyCloseBtn) {
  el.shelbyCloseBtn.addEventListener('click', () => {
    el.shelbyTerminal.classList.add('hidden');
  });
}

// Resizer Logic
let isResizingShelby = false;
if (el.shelbyResizer) {
  el.shelbyResizer.addEventListener('mousedown', (e) => {
    isResizingShelby = true;
    document.body.style.cursor = 'ns-resize';
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isResizingShelby) return;
  const newHeight = window.innerHeight - e.clientY;
  if (newHeight > 100 && newHeight < window.innerHeight - 100) {
    el.shelbyTerminal.style.height = `${newHeight}px`;
    if (shelbyFitAddon) {
      shelbyFitAddon.fit();
      if (shelbyWs && shelbyWs.readyState === WebSocket.OPEN) {
        shelbyWs.send(JSON.stringify({ type: 'resize', cols: shelbyTerminalInstance.cols, rows: shelbyTerminalInstance.rows }));
      }
    }
  }
});

window.addEventListener('mouseup', () => {
  if (isResizingShelby) {
    isResizingShelby = false;
    document.body.style.cursor = '';
  }
});

if (el.shelbyAbortBtn) {
  el.shelbyAbortBtn.addEventListener('click', async () => {
    if (activeShelbyTask) {
      el.shelbyAbortBtn.disabled = true;
      el.shelbyAbortBtn.textContent = 'Killing...';
      try {
        await api('/api/v1/tasks/kill', { method: 'POST', body: JSON.stringify({ taskId: activeShelbyTask }) });
        shelbyTerminalInstance?.write('\r\n[Process killed by user]\r\n');
      } catch {
        showToast('Failed to kill process', 'error');
      }
      el.shelbyAbortBtn.textContent = 'Abort';
      el.shelbyAbortBtn.disabled = false;
      el.shelbyAbortBtn.classList.add('hidden');
    }
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

// ─── Self-Updater ─────────────────────────────────────────────────────────────
let _updateDownloadUrl = null; // stored for the button click handler

if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable((info) => {
    console.log('Electron Update available:', info);
  });

  window.electronAPI.onUpdateDownloaded((info) => {
    console.log('Electron Update downloaded:', info);
    if (el.updateReadyBtn) {
      el.updateReadyBtn.classList.remove('hidden');
    }
  });

  if (el.updateReadyBtn) {
    el.updateReadyBtn.addEventListener('click', () => {
      window.electronAPI.restartToUpdate();
    });
  }
}

if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable((info) => {
    console.log('Electron Update available:', info);
  });

  window.electronAPI.onUpdateDownloaded((info) => {
    console.log('Electron Update downloaded:', info);
    if (el.updateReadyBtn) {
      el.updateReadyBtn.classList.remove('hidden');
    }
  });

  if (el.updateReadyBtn) {
    el.updateReadyBtn.addEventListener('click', () => {
      window.electronAPI.restartToUpdate();
    });
  }
}

async function checkForAppUpdates() {
  try {
    const res = await api('/api/v1/system/check-update');
    if (!res.updateAvailable) return;

    el.systemUpdateBanner.classList.remove('hidden');

    if (res.isExe) {
      // ── Packaged .exe: show a download link ───────────────────────────
      _updateDownloadUrl = res.downloadUrl;
      el.updateBannerText.textContent = `✨ RepoTracker ${res.latestVersion} is available! (you have ${res.currentVersion})`;
      if (el.applyUpdateBtn) {
        el.applyUpdateBtn.textContent = `Download ${res.latestVersion}`;
        el.applyUpdateBtn.dataset.exeUpdate = '1'; // flag for click handler
      }
    } else {
      // ── Git clone: show commit count and apply-update button ───────────────
      el.updateBannerText.textContent = `A new update for RepoTracker is available! (${res.commitsBehind} commit${res.commitsBehind !== 1 ? 's' : ''} behind)`;
      if (el.applyUpdateBtn) el.applyUpdateBtn.textContent = 'Update Now';
    }
  } catch (err) {
    console.error('Failed to check for system updates', err);
  }
}

el.applyUpdateBtn?.addEventListener('click', async () => {
  const btn = el.applyUpdateBtn;

  // ── .exe path: open GitHub Releases page in browser ─────────────────────────
  if (btn.dataset.exeUpdate === '1' && _updateDownloadUrl) {
    window.open(_updateDownloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // ── git-clone path: apply update server-side ─────────────────────────────
  const originalText = btn.textContent;
  btn.textContent = 'Updating...';
  btn.disabled = true;
  try {
    await api('/api/v1/system/apply-update', { method: 'POST', body: JSON.stringify({}) });
    btn.textContent = 'Success!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      alert('Update successful! Please restart your terminal/server to apply the changes.');
      location.reload();
    }, 500);
  } catch (err) {
    btn.textContent = originalText;
    btn.disabled = false;
    showToast('Failed to apply update.', 'error');
  }
});

// ─── Toast Notifications (L1: replaces all alert() calls) ────────────────────
const _toastQueue = [];
let _toastVisible = false;

function showToast(message, type = 'info') {
  _toastQueue.push({ message, type });
  if (!_toastVisible) _drainToast();
}

function _drainToast() {
  if (!_toastQueue.length) { _toastVisible = false; return; }
  _toastVisible = true;
  const { message, type } = _toastQueue.shift();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); _drainToast(); }, 320);
  }, type === 'error' ? 5000 : 3500);
}

function relativeTime(timestamp) {
  if (!timestamp) return 'No commits yet';
  const targetDate = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.round((targetDate.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (Math.abs(diffDays) < 45) return relativeFormatter.format(diffDays, 'day');
  return relativeFormatter.format(Math.round(diffDays / 30), 'month');
}

function normalizeRemote(url) {
  if (!url) return '';
  if (url.startsWith('git@github.com:')) return `https://github.com/${url.replace('git@github.com:', '').replace(/\.git$/, '')}`;
  return url.replace(/\.git$/, '');
}

// ─── Config ───────────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    state.config = await api('/api/v1/config');
    el.rootsInput.value = (state.config.roots || []).join('\n');
    el.depthInput.value = state.config.maxDepth || 4;
    el.userNameInput.value = state.config.userName || '';
    // C2: API keys arrive masked ('••• (saved)') or as empty string
    el.patInput.value = state.config.githubPat || '';
    el.aiKeyInput.value = state.config.aiApiKey || '';
    el.wakaKeyInput.value = state.config.wakatimeApiKey || '';
    // C2: password hash never arrives from server; use appPasswordSet boolean
    el.appPasswordInput.value = '';
    el.appPasswordInput.placeholder = state.config.appPasswordSet
      ? 'Password set \u2014 leave blank to keep, type to change'
      : 'Leave blank for no password';
    el.logoutBtn.classList.toggle('hidden', !state.config.appPasswordSet);

    if (state.config.isDocker) {
      document.getElementById('settingsBrowseBtn')?.classList.add('hidden');
      document.getElementById('settingsSuggestBtn')?.classList.remove('hidden');
      document.getElementById('settingsDockerNotice')?.classList.remove('hidden');
    } else {
      document.getElementById('settingsBrowseBtn')?.classList.remove('hidden');
      document.getElementById('settingsSuggestBtn')?.classList.add('hidden');
      document.getElementById('settingsDockerNotice')?.classList.add('hidden');
    }

    return true;
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      el.authGreeting.textContent = err.data?.userName ? `Welcome back, ${err.data.userName}` : 'Locked';
      el.shell.style.display = 'none';
      el.authDialog.showModal();
      return false;
    }
    console.error('loadConfig error:', err);
    return false;
  }
}

// ─── Scanning ─────────────────────────────────────────────────────────────────
async function scanRepos() {
  state.loading = true;
  el.scanButton.disabled = true;
  el.scanButton.textContent = 'Scanning...';
  el.scanMeta.textContent = 'Scanning folders and reading Git state...';

  try {
    const data = await api('/api/v1/repos');
    // API returns a plain array of repos (not { repos: [...] })
    const repos = Array.isArray(data) ? data : (data.repos || []);
    state.repos = repos;
    if (data.roots)     state.config = { ...state.config, roots: data.roots, maxDepth: data.maxDepth };
    const scannedAt = data.scannedAt ? ` · ${dateFormatter.format(new Date(data.scannedAt))}` : '';
    el.scanMeta.textContent = `${repos.length} repos found${scannedAt}`;
    if (data.errors?.length) el.scanMeta.textContent += ` · ${data.errors.join('; ')}`;
    render();
    fetchGithubRepos();
    fetchTimeline();
    fetchTodos();
    fetchWakatimeStats();
    checkForAppUpdates();
    if (typeof populateEcosystemTab === 'function') populateEcosystemTab();
  } catch (err) {
    el.scanMeta.textContent = err.message;
    if (err.message === 'UNAUTHORIZED') {
      el.shell.style.display = 'none';
      el.authDialog.showModal();
    }
  } finally {
    state.loading = false;
    el.scanButton.disabled = false;
    el.scanButton.textContent = 'Scan repos';
  }
}

// ─── Render Helpers ───────────────────────────────────────────────────────────
function isStale(repo) {
  if (!repo.lastCommit?.timestamp) return true;
  return Date.now() - repo.lastCommit.timestamp > 30 * 86_400_000;
}

function matchesFilter(repo) {
  if (state.filter === 'all') return true;
  if (state.filter === 'pinned') return repo.pinned;

  // Cloud repos and repos with no local status don't apply to health filters
  if (repo.isCloud || !repo.status) return false;

  const map = {
    dirty:  repo.status.dirtyCount > 0,
    ahead:  repo.status.ahead > 0,
    behind: repo.status.behind > 0,
    stale:  isStale(repo),
    clean:  !repo.status.dirtyCount && !repo.status.ahead && !repo.status.behind,
    risk:   isStale(repo) || repo.status.behind > 10 || repo.status.dirtyCount > 10 || repo.github?.ci === 'failure'
  };
  return Boolean(map[state.filter]);
}

function matchesQuery(repo) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [repo.name, repo.path, repo.branch, repo.remoteUrl, repo.note, ...(repo.tags || []), ...(repo.languages || []).map(l => l.name)]
    .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
}

function getVisibleRepos() {
  return state.repos
    .filter(r => matchesFilter(r) && matchesQuery(r))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      return a.name.localeCompare(b.name);
    });
}

function render() {
  const visible = getVisibleRepos();
  renderMetrics();
  renderSpotlight();
  renderInsights();
  renderRepos(visible);
  if (typeof populateEcosystemTab === 'function') populateEcosystemTab();
  el.resultCount.textContent = `${visible.length} shown`;
}

function renderMetrics() {
  const repos = state.repos;
  const items = [
    ['Total repos',     repos.length],
    ['Need attention',  repos.filter(r => r.health < 75 || r.status?.dirtyCount || r.status?.behind).length],
    ['Dirty worktrees', repos.filter(r => r.status?.dirtyCount > 0).length],
    ['Sync drift',      repos.filter(r => r.status?.ahead || r.status?.behind).length]
  ];
  el.metricsGrid.replaceChildren(...items.map(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'metric';
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    return card;
  }));
}

function renderSpotlight() {
  const [repo] = [...state.repos].sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    return a.health - b.health || (b.status?.dirtyCount || 0) - (a.status?.dirtyCount || 0);
  });
  if (!repo) {
    el.spotlight.innerHTML = '<span class="muted">Spotlight appears after scanning.</span>';
    return;
  }
  const remote = normalizeRemote(repo.remoteUrl);
  el.spotlight.innerHTML = `
    <div>
      <p class="eyebrow">Spotlight</p>
      <h3>${escapeHtml(repo.name)}</h3>
      <p class="path" title="${escapeAttribute(repo.path)}">${escapeHtml(repo.path)}</p>
      <div class="chips">
        ${renderChip(`Health ${repo.health}`, repo.health < 70 ? 'danger' : repo.health < 86 ? 'warn' : '')}
        ${renderChip(repo.branch || 'detached', 'info')}
        ${repo.status?.dirtyCount ? renderChip(`${repo.status.dirtyCount} changed`, 'warn') : renderChip('clean')}
      </div>
    </div>
    <div>
      <p class="muted">${escapeHtml((repo.attention || []).join(' - '))}</p>
      <div class="card-actions">
        <button class="ghost" type="button" data-open-spotlight="${escapeAttribute(repo.path)}">Open folder</button>
        ${remote && /^https:\/\//.test(remote) ? `<a class="remote-link" href="${safeUrl(remote)}" target="_blank" rel="noreferrer">Remote</a>` : ''}
      </div>
    </div>
  `;
}

function renderInsights() {
  const attention = [...state.repos]
    .filter(r => r.health < 85 || r.status?.dirtyCount || r.status?.behind)
    .slice(0, 6);

  el.attentionList.replaceChildren(
    ...(attention.length
      ? attention.map(r => {
        const d = document.createElement('div');
        d.className = 'attention-item';
        d.innerHTML = `<span>${escapeHtml(r.name)}</span><strong>${r.health}</strong>`;
        return d;
      })
      : [emptySmall('Everything looks calm.')])
  );

  const langCounts = new Map();
  for (const r of state.repos) {
    for (const l of (r.languages || [])) {
      langCounts.set(l.name, (langCounts.get(l.name) || 0) + 1);
    }
  }
  const langItems = [...langCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  el.languageList.replaceChildren(
    ...(langItems.length
      ? langItems.map(([lang, count]) => {
        const d = document.createElement('div');
        d.className = 'language-pill';
        d.innerHTML = `<span>${escapeHtml(lang)}</span><strong>${count}</strong>`;
        return d;
      })
      : [emptySmall('No language data yet.')])
  );
}

function renderRepos(repos) {
  if (!repos.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.repos.length
      ? 'No repositories match the current view.'
      : 'No Git repositories found. Add a root folder in Settings and scan.';
    el.repoGrid.replaceChildren(empty);
    return;
  }
  el.repoGrid.replaceChildren(...repos.map(repo => {
    const fragment = renderRepoCard(repo);
    // Wire new feature buttons after the card is built
    if (!repo.isRemoteOnly) {
      const aiRevBtn = fragment.querySelector('.ai-review-button');
      // P6: use licenseKeySet, not the masked key string, to detect if AI is configured
      if (aiRevBtn && repo.status?.dirtyCount > 0 && state.config?.aiApiKey && state.config.aiApiKey !== '') {
        wireAiReviewButton(aiRevBtn, repo);
      }
      
      const aiChatBtn = fragment.querySelector('.ai-chat-button');
      if (aiChatBtn && state.config?.aiApiKey && state.config.aiApiKey !== '') {
        aiChatBtn.addEventListener('click', () => openAiChat(repo));
      }

      const branchBtn = fragment.querySelector('.branch-button');
      if (branchBtn) wireBranchButton(branchBtn, repo);
    }
    return fragment;
  }));
}

function renderRepoCard(repo) {
  const fragment = el.repoCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.repo-card');
  const title = fragment.querySelector('h4');
  const pathText = fragment.querySelector('.path');
  const pinButton = fragment.querySelector('.pin-button');
  const ring = fragment.querySelector('.health-ring');
  const ringText = fragment.querySelector('.health-ring span');
  
  ring.addEventListener('click', () => {
    document.getElementById('healthInfoDialog').showModal();
  });
  const chips = fragment.querySelector('.chips');
  const ghStats = fragment.querySelector('.github-stats');
  const wakaStats = fragment.querySelector('.wakatime-stats');
  const statusLine = fragment.querySelector('.status-line');
  const commitLine = fragment.querySelector('.commit-line');
  const tagInput = fragment.querySelector('.tag-editor input');
  const note = fragment.querySelector('.note');
  const openButton = fragment.querySelector('.open-button');
  const remoteLink = fragment.querySelector('.remote-link');
  const qaDropdown = fragment.querySelector('.quick-actions-dropdown');
  const qaMenu = qaDropdown?.querySelector('.dropdown-menu');
  const auditBtn = fragment.querySelector('.audit-button');
  const setupBtn = fragment.querySelector('.setup-button');
  const aisyncBtn = fragment.querySelector('.aisync-button');
  const shelbyBtn = fragment.querySelector('.shelby-pro-btn');
  const cloneBtn = fragment.querySelector('.clone-button');

  title.textContent = repo.name;
  pathText.textContent = repo.path;
  pathText.title = repo.path;
  pinButton.classList.toggle('active', repo.pinned);
  ring.style.setProperty('--score', `${repo.health}%`);
  ringText.textContent = repo.health;

  chips.innerHTML = [
    repo.isRemoteOnly ? renderChip('☁️ Cloud', 'info') : '',
    !repo.isRemoteOnly ? renderChip(repo.branch || 'detached', 'info') : '',
    repo.status?.dirtyCount ? renderChip(`${repo.status.dirtyCount} changed`, 'warn') : (!repo.isRemoteOnly ? renderChip('clean') : ''),
    repo.status?.ahead  ? renderChip(`ahead ${repo.status.ahead}`, 'warn') : '',
    repo.status?.behind ? renderChip(`behind ${repo.status.behind}`, 'danger') : '',
    ...(repo.tags || []).map(tag => renderChip(tag))
  ].join('');

  // GitHub stats
  if (repo.github) {
    ghStats.classList.remove('hidden');
    const ci = repo.github.ci === 'failure' ? '<span class="chip danger">CI Failing</span>'
      : repo.github.ci === 'success' ? '<span class="chip info">CI Passing</span>' : '';
    ghStats.innerHTML = `<div class="gh-metrics">
      <span class="gh-stat" title="Stars">★ ${Number(repo.github.stars) || 0}</span>
      <span class="gh-stat" title="Open Issues">⨀ ${Number(repo.github.issues) || 0}</span>
      <span class="gh-stat" title="Pull Requests">⎇ ${Number(repo.github.prs) || 0}</span>
      ${ci}
    </div>`;
  }

  // WakaTime stats
  if (repo.wakatime) {
    wakaStats.classList.remove('hidden');
    wakaStats.innerHTML = `<span>⏱ ${repo.wakatime.hours}h this week</span>`;
  }

  const langText = (repo.languages || []).map(l => l.name).join(', ') || 'No language signal';
  if (repo.isRemoteOnly) {
    statusLine.innerHTML = `<span>${escapeHtml(langText)}</span><span>Remote Repository</span>`;
    commitLine.innerHTML = `<span>Not downloaded</span><span></span>`;
  } else {
    statusLine.innerHTML = `<span>${escapeHtml(langText)}</span><span>${Number(repo.commitCount) || 0} commits</span>`;
    commitLine.innerHTML = repo.lastCommit
      ? `<span title="${escapeAttribute(repo.lastCommit.subject)}">${escapeHtml(repo.lastCommit.hash)} ${escapeHtml(repo.lastCommit.subject)}</span><span>${relativeTime(repo.lastCommit.timestamp)}</span>`
      : '<span>No commits yet</span><span></span>';
  }

  tagInput.value = (repo.tags || []).join(', ');
  // M4 Contract: notes are stored raw and must only be rendered via .value or .textContent, never via innerHTML
  note.value = repo.note || '';

  // Quick actions (Shelby)
  if (repo.scripts?.length && qaDropdown && qaMenu) {
    qaDropdown.classList.remove('hidden');
    qaMenu.innerHTML = repo.scripts.map((s, i) => 
      `<button type="button" class="dropdown-item" data-idx="${i}">
         <span class="muted">[${escapeHtml(s.runner)}]</span> ${escapeHtml(s.name)}
       </button>`
    ).join('');
    
    qaMenu.querySelectorAll('.dropdown-item').forEach(btn => {
      btn.addEventListener('click', async e => {
        qaDropdown.removeAttribute('open');
        const idx = btn.getAttribute('data-idx');
        const scriptObj = repo.scripts[idx];
        try {
          const res = await api('/api/v1/repos/action', { method: 'POST', body: JSON.stringify({ path: repo.path, scriptCmd: scriptObj.cmd }) });
          openShelby(scriptObj.cmd, res.taskId);
        }
        catch (err) { showToast(`Failed to start: ${err.message}`, 'error'); }
      });
    });
  }

  // Pin
  pinButton.addEventListener('click', () => updateRepoMeta(repo, { pinned: !repo.pinned }));

  // Note
  note.addEventListener('change', () => updateRepoMeta(repo, { note: note.value }));

  // Tags
  tagInput.addEventListener('change', () => {
    const tags = tagInput.value.split(',').map(t => t.trim()).filter(Boolean);
    updateRepoMeta(repo, { tags });
  });

  if (repo.isRemoteOnly) {
    setupBtn.classList.add('hidden');
    auditBtn.classList.add('hidden');
    openButton.classList.add('hidden');
    cloneBtn.classList.remove('hidden');
    cloneBtn.addEventListener('click', () => {
      const roots = state.config?.roots || [];
      if (roots.length === 0) {
        showToast('Please configure at least one folder in Settings to clone repositories into.', 'warn');
        return;
      }
      el.cloneDestSelect.innerHTML = roots
        .map(r => `<option value="${escapeAttribute(r)}">${escapeHtml(r)}</option>`).join('');
      el.confirmCloneButton.onclick = async () => {
        el.confirmCloneButton.disabled = true;
        el.confirmCloneButton.textContent = 'Cloning...';
        try {
          const res = await api('/api/v1/repos/clone', { method: 'POST', body: JSON.stringify({ root: el.cloneDestSelect.value, url: repo.remoteUrl, name: repo.name }) });
          el.cloneDialog.close();
          openShelby(`Clone ${repo.name}`, res.taskId);
        } catch (e) { showToast('Clone failed: ' + e.message, 'error'); }
        finally { el.confirmCloneButton.disabled = false; el.confirmCloneButton.textContent = 'Clone'; }
      };
      el.cloneDialog.showModal();
    });
  } else {
    // L3: only show Audit button when repo has a package.json (scripts !== null)
    if (!repo.scripts) auditBtn.classList.add('hidden');

    setupBtn.addEventListener('click', async () => {
      try {
        const res = await api('/api/v1/repos/setup', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
        openShelby('Auto-Setup', res.taskId);
      } catch (err) { showToast(`Auto-setup failed: ${err.message}`, 'error'); }
    });

    if (shelbyBtn) {
      shelbyBtn.classList.remove('hidden');
      shelbyBtn.addEventListener('click', async () => {
        try {
          const res = await api('/api/v1/repos/terminal', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
          openShelby('Terminal', res.taskId);
        } catch (err) { showToast(`Failed to start: ${err.message}`, 'error'); }
      });
    }

    auditBtn.addEventListener('click', async () => {
      auditBtn.textContent = 'Auditing...';
      try {
        const res = await api('/api/v1/repos/audit', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
        const v = res.metadata?.vulnerabilities;
        if (v && (v.high > 0 || v.critical > 0)) {
          showToast(`⚠️ Vulnerabilities in ${repo.name}! High: ${v.high}, Critical: ${v.critical}`, 'warn');
        } else {
          showToast(`✅ Audit passed for ${repo.name} — no high/critical issues.`, 'success');
        }
      } catch (err) { showToast(`Audit failed: ${err.message}`, 'error'); }
      finally { auditBtn.textContent = 'Audit'; }
    });

    if (repo.status?.dirtyCount > 0) {
      aisyncBtn.classList.remove('hidden');
      aisyncBtn.classList.add('accent');
      aisyncBtn.addEventListener('click', async () => {
        aisyncBtn.disabled = true;
        aisyncBtn.textContent = 'Syncing...';
        try {
          const res = await api('/api/v1/repos/aisync', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
          showToast(`✅ Synced! Commit: "${res.message}"`, 'success');
          scanRepos();
        } catch (err) { showToast(`AI Sync failed: ${err.message}`, 'error'); }
        finally { aisyncBtn.disabled = false; aisyncBtn.textContent = 'AI Sync 🪄'; }
      });
    }

    openButton.addEventListener('click', () => {
      api('/api/v1/repos/open', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
    });
  }

  // M3: validate remote is a real https:// URL before assigning to href
  let remote = repo.remoteUrl;
  if (remote && remote.startsWith('git@github.com:')) {
    remote = 'https://github.com/' + remote.slice(15).replace(/\.git$/, '');
  }
  if (remote && /^https:\/\//.test(remote)) {
    remoteLink.href = remote;
  } else {
    remoteLink.classList.add('hidden');
  }

  card.dataset.path = repo.path;
  return fragment;
}

// ─── Repo Meta (pin/note/tags) ────────────────────────────────────────────────
async function updateRepoMeta(repo, patch) {
  const next = { path: repo.path, pinned: repo.pinned, note: repo.note, tags: repo.tags, ...patch };
  await api('/api/v1/repos/meta', { method: 'PATCH', body: JSON.stringify(next) });
  Object.assign(repo, next);
  render();
}

// ─── Open Repo Folder ─────────────────────────────────────────────────────────
async function openRepo(repoPath) {
  await api('/api/v1/repos/open', { method: 'POST', body: JSON.stringify({ path: repoPath }) });
}

// ─── Save Settings ────────────────────────────────────────────────────────────
async function saveSettings(event) {
  if (event) event.preventDefault();
  const roots = el.rootsInput.value.split(/\r?\n/).map(r => r.trim()).filter(Boolean);

  if (state.config?.isDocker) {
    const hasWindowsPath = roots.some(r => /^[a-zA-Z]:\\/.test(r) || /^\\\\/.test(r) || /^[a-zA-Z]:\//.test(r));
    if (hasWindowsPath) {
      showToast('Docker Error: Do not use Windows host paths (e.g. C:\\...). Use the mounted container path (e.g. /repos).', 'error');
      return;
    }
  }

  const maxDepth = parseInt(el.depthInput.value, 10) || 4;
  const userName = el.userNameInput.value.trim();
  const githubPat = el.patInput.value.trim();
  const aiApiKey = el.aiKeyInput.value.trim();
  const wakatimeApiKey = el.wakaKeyInput.value.trim();
  const appPassword = el.appPasswordInput.value.trim();
  const slackWebhookUrl = el.slackWebhookInput.value.trim();
  const linearApiKey = el.linearKeyInput.value.trim();
  const jiraDomain = el.jiraDomainInput.value.trim();
  const jiraEmail = el.jiraEmailInput.value.trim();
  const jiraApiToken = el.jiraTokenInput.value.trim();

  // L2: Only trigger a scan when the filesystem-affecting settings change
  const rootsChanged = JSON.stringify(roots) !== JSON.stringify(state.config?.roots || []);
  const depthChanged = maxDepth !== (state.config?.maxDepth || 4);
  const shouldRescan = rootsChanged || depthChanged;

  el.saveSettingsButton.textContent = 'Saving...';
  el.saveSettingsButton.disabled = true;

  try {
    state.config = await api('/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify({ 
        roots, maxDepth, userName, githubPat, aiApiKey, wakatimeApiKey, appPassword,
        slackWebhookUrl, linearApiKey, jiraDomain, jiraEmail, jiraApiToken
      })
    });
    // Update password-related UI after save
    el.appPasswordInput.value = '';
    el.appPasswordInput.placeholder = state.config.appPasswordSet
      ? 'Password set \u2014 leave blank to keep, type to change'
      : 'Leave blank for no password';
    if (appPassword) {
      // After setting a new password, the user gets a new session token on next login.
      await _refreshSession(appPassword);
      el.logoutBtn.classList.remove('hidden');
    } else if (!state.config.appPasswordSet) {
      el.logoutBtn.classList.add('hidden');
    }
    el.saveSettingsButton.textContent = 'Saved!';
    showToast('Settings saved.', 'success');
    setTimeout(() => { el.saveSettingsButton.textContent = 'Save and scan'; el.saveSettingsButton.disabled = false; }, 2000);
    if (shouldRescan) await scanRepos();
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
    el.saveSettingsButton.textContent = 'Save and scan';
    el.saveSettingsButton.disabled = false;
  }
}

/** After changing the password, get a fresh session token silently. */
async function _refreshSession(newPassword) {
  try {
    await fetch('/api/v1/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });
  } catch { /* ignore */ }
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
async function fetchTimeline() {
  try {
    const commits = await api('/api/v1/timeline');
    state.timeline = commits;
    el.timelineList.replaceChildren(...commits.map(c => {
      const d = document.createElement('div');
      d.className = 'timeline-item';
      d.innerHTML = `
        <div class="timeline-meta"><strong>${escapeHtml(c.repoName)}</strong> <span class="muted">${relativeTime(c.timestamp)}</span></div>
        <div class="timeline-subject" title="${escapeAttribute(c.subject)}">${escapeHtml(c.subject)}</div>
        <div class="timeline-author muted">${escapeHtml(c.author)}</div>
      `;
      return d;
    }));
    if (!commits.length) el.timelineList.replaceChildren(emptySmall('No commits in history.'));
  } catch { el.timelineList.replaceChildren(emptySmall('Could not load timeline.')); }
}

// ─── TODOs ────────────────────────────────────────────────────────────────────
async function fetchTodos() {
  try {
    const data = await api('/api/v1/todos');
    const todos = data.results || [];
    el.todoList.replaceChildren(...todos.map(t => {
      const d = document.createElement('div');
      d.className = 'timeline-item';
      d.style.cursor = 'pointer';
      d.onclick = () => openRepo(t.path);
      d.innerHTML = `
        <div class="timeline-meta"><strong>${escapeHtml(t.repo)}</strong> <span class="muted">${escapeHtml(t.file)}:${escapeHtml(t.line)}</span></div>
        <div class="timeline-subject" style="font-family:monospace;white-space:normal" title="${escapeAttribute(t.content)}">${escapeHtml(t.content)}</div>
      `;
      return d;
    }));
    if (!todos.length) el.todoList.replaceChildren(emptySmall('No TODOs found! 🎉'));
  } catch { el.todoList.replaceChildren(emptySmall('Could not load TODOs.')); }
}

// ─── GitHub Repos ─────────────────────────────────────────────────────────────
async function fetchGithubRepos() {
  if (!state.config?.githubPat) return;
  try {
    const data = await api('/api/v1/github/repos');
    if (!Array.isArray(data)) return;
    for (const ghRepo of data) {
      const local = state.repos.find(r => {
        if (!r.remoteUrl) return false;
        const n = s => s.toLowerCase().replace(/\.git$/, '');
        return n(r.remoteUrl) === n(ghRepo.clone_url) || n(r.remoteUrl) === n(ghRepo.ssh_url) || n(r.remoteUrl).includes(ghRepo.full_name.toLowerCase());
      });
      const ghData = { stars: ghRepo.stargazers_count || 0, issues: ghRepo.open_issues_count || 0, prs: 0, ci: null };
      if (local) {
        local.github = ghData;
      } else {
        state.repos.push({
          name: ghRepo.name, path: `Remote: ${ghRepo.full_name}`, remoteUrl: ghRepo.clone_url,
          pinned: false, health: 100, status: { dirtyCount: 0, ahead: 0, behind: 0 },
          tags: [], languages: ghRepo.language ? [{ name: ghRepo.language }] : [],
          attention: [], isRemoteOnly: true, github: ghData
        });
      }
    }
    state.repos.sort((a, b) => a.isRemoteOnly ? 1 : b.isRemoteOnly ? -1 : 0);
    render();
  } catch (e) { console.warn('GitHub fetch failed:', e); }
}

// ─── WakaTime ─────────────────────────────────────────────────────────────────
async function fetchWakatimeStats() {
  if (!state.config?.wakatimeApiKey) return;
  try {
    const data = await api('/api/v1/wakatime');
    // L6: guard against unexpected response shape (e.g. WakaTime API error object)
    if (!Array.isArray(data?.data)) {
      console.warn('WakaTime: unexpected response', data?.error || data);
      return;
    }
    const projects = {};
    for (const day of data.data) {
      for (const p of (day.projects || [])) projects[p.name] = (projects[p.name] || 0) + p.total_seconds;
    }
    for (const repo of state.repos) {
      if (projects[repo.name]) repo.wakatime = { hours: (projects[repo.name] / 3600).toFixed(1) };
    }
    render();
  } catch (e) { console.warn('WakaTime fetch failed:', e); }
}

// ─── Global Search ────────────────────────────────────────────────────────────
let searchTimeout;
el.globalSearchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { el.searchResults.innerHTML = ''; return; }
  const hits = state.repos.filter(r => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
  
  el.searchResults.innerHTML = hits.map(r => `
    <div class="search-result-item" data-path="${r.path}" style="padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:600;">${r.name}</div>
        <div style="font-size:0.8rem;color:var(--muted);">${r.path}</div>
      </div>
      ${renderChip(r.status.branch, 'accent')}
    </div>
  `).join('');

  el.searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      el.globalSearchDialog.close();
      const path = item.dataset.path;
      const card = el.repoGrid.querySelector(`[data-path="${path.replace(/\\/g, '\\\\')}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.animation = 'highlight 2s ease';
      }
    });
  });
});

// My Tickets Dialog
if (el.myTicketsBtn) {
  let _allTickets = [];
  let _activeFilter = 'all';

  // Map raw state strings to chip class names
  function getStateClass(state) {
    const s = (state || '').toLowerCase();
    if (s.includes('progress') || s.includes('doing') || s.includes('active')) return 'progress';
    if (s.includes('review') || s.includes('testing')) return 'review';
    if (s.includes('todo') || s.includes('backlog') || s.includes('to do')) return 'todo';
    return 'open';
  }

  function getSourceKey(src) {
    if (src === 'Jira') return 'jira';
    if (src === 'Linear') return 'linear';
    return 'github';
  }

  function getSourceAbbr(src) {
    if (src === 'Jira') return 'JR';
    if (src === 'Linear') return 'LN';
    return 'GH';
  }

  function renderTickets(tickets) {
    const list = document.getElementById('myTicketsList');
    if (!list) return;
    if (!tickets.length) {
      list.innerHTML = `
        <div class="tickets-empty">
          <div class="tickets-empty-icon">🎉</div>
          <div class="tickets-empty-title">No open tickets${_activeFilter !== 'all' ? ` in ${_activeFilter}` : ''}!</div>
          <div class="tickets-empty-sub">You're all caught up. Enjoy the moment.</div>
        </div>`;
      return;
    }
    list.innerHTML = tickets.map((issue, i) => `
      <a href="${safeUrl(issue.url)}" target="_blank" rel="noreferrer" class="ticket-row" style="animation-delay:${i * 40}ms">
        <span class="ticket-source-badge ${getSourceKey(issue.source)}" title="${escapeAttribute(issue.source)}">${escapeHtml(getSourceAbbr(issue.source))}</span>
        <div class="ticket-body">
          <div class="ticket-title">${escapeHtml(issue.title)}</div>
          <div class="ticket-meta">
            <span class="ticket-id">${escapeHtml(issue.id)}</span>
            <span>·</span>
            <span class="ticket-state-chip ${getStateClass(issue.state)}">${escapeHtml(issue.state)}</span>
          </div>
        </div>
        <svg class="ticket-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </a>
    `).join('');
  }

  function updateCounts(allIssues) {
    const bySource = { Jira: 0, Linear: 0, GitHub: 0 };
    allIssues.forEach(i => { if (bySource[i.source] !== undefined) bySource[i.source]++; });
    document.getElementById('ticketCountAll').textContent = allIssues.length;
    document.getElementById('ticketCountJira').textContent = bySource.Jira;
    document.getElementById('ticketCountLinear').textContent = bySource.Linear;
    document.getElementById('ticketCountGitHub').textContent = bySource.GitHub;
  }

  function applyFilter(filter) {
    _activeFilter = filter;
    document.querySelectorAll('#ticketsFilters .ticket-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    const filtered = filter === 'all' ? _allTickets : _allTickets.filter(t => t.source === filter);
    renderTickets(filtered);
  }

  // Filter pill click handlers
  document.getElementById('ticketsFilters')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-filter]');
    if (pill) applyFilter(pill.dataset.filter);
  });

  el.myTicketsBtn.addEventListener('click', async () => {
    el.myTicketsDialog.showModal();
    _allTickets = [];
    _activeFilter = 'all';

    // Reset filter pills
    document.querySelectorAll('#ticketsFilters .ticket-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
    ['ticketCountAll','ticketCountJira','ticketCountLinear','ticketCountGitHub'].forEach(id => {
      const el2 = document.getElementById(id);
      if (el2) el2.textContent = '0';
    });

    // Shimmer skeletons
    const list = document.getElementById('myTicketsList');
    if (list) {
      list.innerHTML = [1, 2, 3].map(() => `<div class="ticket-skeleton"></div>`).join('');
    }

    try {
      const { issues } = await api('/api/v1/integrations/issues');
      _allTickets = issues || [];
      updateCounts(_allTickets);
      renderTickets(_allTickets);
    } catch (e) {
      if (list) {
        list.innerHTML = `
          <div class="tickets-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Failed to load tickets: ${escapeHtml(e.message)}
          </div>`;
      }
    }
  });

  if (el.myTicketsCloseBtn) {
    el.myTicketsCloseBtn.addEventListener('click', () => {
      el.myTicketsDialog.close();
    });
  }
}


// ─── Event Listeners ──────────────────────────────────────────────────────────

// Scan button
el.scanButton.addEventListener('click', scanRepos);

// Save settings
el.saveSettingsButton.addEventListener('click', saveSettings);

// Inline search
el.searchInput.addEventListener('input', e => { state.query = e.target.value; render(); });

// Filter buttons
el.filterRow.addEventListener('click', e => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  el.filterRow.querySelectorAll('.filter').forEach(f => f.classList.toggle('active', f === btn));
  render();
});

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    btn.classList.add('active');
    const pane = document.getElementById(btn.dataset.target);
    pane.classList.remove('hidden');
    pane.classList.add('active');
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    el.searchDialog.showModal();
    el.globalSearchInput.focus();
  } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    el.searchInput.focus();
  }
});

// M4: Scope data-open handler to known containers only (not the whole document)
el.spotlight.addEventListener('click', e => {
  const opener = e.target.closest('[data-open-spotlight]');
  if (opener) openRepo(opener.dataset.openSpotlight);
});
el.searchResults.addEventListener('click', e => {
  const opener = e.target.closest('[data-open]');
  if (opener) openRepo(opener.dataset.open);
});

// Auth dialog — prevent escape closing it
el.authDialog.addEventListener('cancel', e => e.preventDefault());

// Login form
el.authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const password = el.authPasswordInput.value;
  try {
    const res = await fetch('/api/v1/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      el.authDialog.close();
      el.shell.style.display = '';
      el.authPasswordInput.value = '';
      if (await loadConfig()) await scanRepos();
    } else {
      showToast('Incorrect password', 'error');
      el.authPasswordInput.value = '';
    }
  } catch { showToast('Login error. Is the server running?', 'error'); }
});

// Logout
el.logoutBtn.addEventListener('click', async () => {
  await api('/api/v1/logout', { method: 'POST', body: JSON.stringify({}) });
  location.reload();
});

// ─── Feedback Form ────────────────────────────────────────────────────────────
el.feedbackBtn.addEventListener('click', () => {
  el.feedbackDialog.classList.remove('hidden');
  el.feedbackText.value = '';
  el.feedbackText.focus();
});

el.feedbackForm.addEventListener('submit', async e => {
  e.preventDefault();
  const text = el.feedbackText.value.trim();
  if (!text) return;

  const submitBtn = el.feedbackForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  // Formspree IDs removed for security
  const FORMSPREE_ID_1 = '';
  const FORMSPREE_ID_2 = '';
  const FORMSPREE_ID_3 = '';

  try {
    const promises = [];
    if (FORMSPREE_ID_1 && FORMSPREE_ID_1 !== 'YOUR_FORMSPREE_ID_1') {
      promises.push(fetch(`https://formspree.io/f/${FORMSPREE_ID_1}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      }));
    }
    if (FORMSPREE_ID_2 && FORMSPREE_ID_2 !== 'YOUR_FORMSPREE_ID_2') {
      promises.push(fetch(`https://formspree.io/f/${FORMSPREE_ID_2}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      }));
    }
    if (FORMSPREE_ID_3 && FORMSPREE_ID_3 !== 'YOUR_FORMSPREE_ID_3') {
      promises.push(fetch(`https://formspree.io/f/${FORMSPREE_ID_3}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      }));
    }

    if (promises.length === 0) {
      showToast('Formspree IDs are not configured in code.', 'error');
    } else {
      await Promise.all(promises);
      showToast('Suggestion sent successfully!', 'success');
      el.feedbackDialog.classList.add('hidden');
    }
  } catch (err) {
    showToast('Failed to send suggestion.', 'error');
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send Suggestion';
});

// ─── Dialog Pickers ───────────────────────────────────────────────────────────
async function handleFolderBrowse(textareaElement) {
  try {
    const res = await api('/api/v1/dialog/folder', { method: 'POST', body: JSON.stringify({}) });
    if (res.path) {
      const current = textareaElement.value;
      textareaElement.value = current ? current.replace(/[\r\n]+$/, '') + '\n' + res.path : res.path;
      showToast('Folder added', 'success');
    }
  } catch (e) {
    if (e.message !== 'Canceled') showToast('Browse failed: ' + e.message, 'error');
  }
}

el.settingsBrowseBtn.addEventListener('click', () => handleFolderBrowse(el.rootsInput));

const settingsSuggestBtn = document.getElementById('settingsSuggestBtn');
if (settingsSuggestBtn) {
  settingsSuggestBtn.addEventListener('click', async () => {
    try {
      const res = await api('/api/v1/suggest-roots');
      if (res.suggestions?.length) {
        const current = el.rootsInput.value;
        const toAdd = res.suggestions.filter(s => !current.includes(s));
        if (toAdd.length) {
          el.rootsInput.value = current ? current.replace(/[\r\n]+$/, '') + '\n' + toAdd.join('\n') : toAdd.join('\n');
          showToast(`Added ${toAdd.length} mounted folders`, 'success');
        } else {
          showToast('No new mounted folders found.', 'info');
        }
      } else {
        showToast('No mounted folders detected.', 'info');
      }
    } catch (e) {
      showToast('Failed to suggest roots: ' + e.message, 'error');
    }
  });
}


// ── Onboarding Wizard ────────────────────────────────────────────────────────

/** All transient wizard state — discarded after completeWizard() is called. */
const wizard = {
  step: 1,
  password: '',   // non-empty only if user set one (and it matched confirmation)
  roots: [],      // [{ path }]
  githubToken: '', // only set if wizard.githubUser !== null
  githubUser: null, // { login, name } — set by successful verification
  aiKey: '',
  wakaKey: '',
};

/** Update progress dots and step label. */
function goToStep(n, back = false) {
  el.wizardSteps.forEach(s => {
    s.classList.remove('active', 'slide-back');
  });
  el.wizardDots.forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === n);
    dot.classList.toggle('done', i + 1 < n);
  });
  const target = document.querySelector(`#wizardStep${n}`);
  if (target) {
    if (back) target.classList.add('slide-back');
    target.classList.add('active');
  }
  el.wizardStepLabel.textContent = `Step ${n} of 4`;
  wizard.step = n;
}

/** Render the folder chip list for step 2. */
function renderWizFolders() {
  el.wizFolderList.replaceChildren(
    ...wizard.roots.map(({ path }) => {
      const chip = document.createElement('div');
      chip.className = 'wizard-folder-chip';
      chip.innerHTML = `
        <span style="font-size:1.1rem">📁</span>
        <span class="folder-path" title="${escapeAttribute(path)}">${escapeHtml(path)}</span>
        <span class="folder-count">(added)</span>
        <button class="wizard-folder-remove" type="button" aria-label="Remove folder">✕</button>
      `;
      chip.querySelector('.wizard-folder-remove').addEventListener('click', () => {
        wizard.roots = wizard.roots.filter(r => r.path !== path);
        renderWizFolders();
      });
      return chip;
    })
  );
}

/** Show the wizard and optionally pre-populate root suggestions. */
async function showWizard() {
  el.wizard.classList.add('active');
  el.shell.style.display = 'none';

  if (state.config?.isDocker) {
    document.getElementById('wizDockerNotice')?.classList.remove('hidden');
    document.getElementById('wizAddFolderBtn')?.classList.add('hidden');
    document.getElementById('wizSuggestFolderBtn')?.classList.remove('hidden');
  } else {
    document.getElementById('wizDockerNotice')?.classList.add('hidden');
    document.getElementById('wizAddFolderBtn')?.classList.remove('hidden');
    document.getElementById('wizSuggestFolderBtn')?.classList.add('hidden');
    // Hide the wizard auto-suggestion button entirely in Docker now since we use the inline Add Selected UI
    if (state.config?.isDocker) {
      document.getElementById('wizSuggestFolderBtn')?.classList.add('hidden');
    }
  }

  // Pre-populate suggestions as auto-added folders on step 2
  try {
    const res = await api('/api/v1/suggest-roots');
    if (res.suggestions?.length) {
      if (!state.config?.isDocker) {
        wizard.roots = res.suggestions.map(p => ({ path: p }));
        renderWizFolders();
      }
    }

    if (state.config?.isDocker) {
      const container = document.getElementById('wizDockerMountsContent');
      if (res.suggestions?.length) {
        container.innerHTML = `
          <div style="font-weight: 500; margin-bottom: 8px;">Detected mounted folders</div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
            ${res.suggestions.map(s => `<label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;"><input type="checkbox" value="${escapeAttribute(s)}" class="docker-mount-cb" checked> <span style="font-family: monospace;">${escapeHtml(s)}</span></label>`).join('')}
          </div>
          <button type="button" class="primary" id="wizDockerAddSelectedBtn" style="font-size: 0.85rem; padding: 4px 12px;">Add Selected</button>
        `;
        document.getElementById('wizDockerAddSelectedBtn').addEventListener('click', () => {
          const cbs = container.querySelectorAll('.docker-mount-cb:checked');
          let added = 0;
          cbs.forEach(cb => {
            if (!wizard.roots.find(r => r.path === cb.value)) {
              wizard.roots.push({ path: cb.value });
              added++;
            }
          });
          if (added > 0) {
            renderWizFolders();
            showToast(`Added ${added} folders`, 'success');
          }
        });
      } else {
        container.innerHTML = `
          <p style="margin: 0 0 12px; font-size: 0.85rem; line-height: 1.4;">No host repositories are currently mounted into this container. You must mount your host directories as volumes.</p>
          <pre style="background: var(--bg); padding: 8px; border-radius: 4px; font-size: 0.75rem; margin: 0; color: var(--text);"><code>volumes:
  - C:\\Users\\YourName\\Code:/repos</code></pre>
        `;
      }
    }
  } catch { /* no suggestions — fine */ }
}

/** Single exit point — called by Finish and all Skip paths. */
async function completeWizard() {
  // Disable all finish/skip buttons to prevent double-submit
  [el.wizFinishBtn, el.wizSkipAllBtn].forEach(b => { if (b) b.disabled = true; });

  const roots = wizard.roots.map(r => r.path);
  const userName = el.wizName?.value.trim() || '';
  // Only save a GitHub token if it was successfully verified
  const githubPat = wizard.githubUser ? wizard.githubToken : '';
  const aiApiKey = wizard.aiKey;
  // Capture ping opt-in from wizard checkbox
  const pingOptIn = document.getElementById('wizPingOptIn')?.checked === true;
  if (pingOptIn !== (state.config?.pingOptIn === true)) {
    api('/api/v1/ping-optin', { method: 'POST', body: JSON.stringify({ optIn: pingOptIn }) }).catch(() => {});
  }
  const wakatimeApiKey = wizard.wakaKey;
  const appPassword = wizard.password;

  const payload = {
    ...state.config,
    roots,
    ...(userName ? { userName } : {}),
    ...(githubPat ? { githubPat } : {}),
    ...(aiApiKey ? { aiApiKey } : {}),
    ...(wakatimeApiKey ? { wakatimeApiKey } : {}),
    ...(appPassword ? { appPassword } : {}),
    onboardingComplete: true,  // must-fix: prevents infinite loop on skip
  };

  try {
    state.config = await api('/api/v1/config', { method: 'PUT', body: JSON.stringify(payload) });
    // Sync settings panel fields
    if (el.userNameInput) el.userNameInput.value = state.config.userName || '';
    if (el.rootsInput) el.rootsInput.value = (state.config.roots || []).join('\n');
    if (el.patInput) el.patInput.value = state.config.githubPat || '';
    if (el.aiKeyInput) el.aiKeyInput.value = state.config.aiApiKey || '';
    if (el.wakaKeyInput) el.wakaKeyInput.value = state.config.wakatimeApiKey || '';
    if (el.slackWebhookInput) el.slackWebhookInput.value = state.config.slackWebhookUrl || '';
    if (el.linearKeyInput) el.linearKeyInput.value = state.config.linearApiKey || '';
    if (el.jiraDomainInput) el.jiraDomainInput.value = state.config.jiraDomain || '';
    if (el.jiraEmailInput) el.jiraEmailInput.value = state.config.jiraEmail || '';
    if (el.jiraTokenInput) el.jiraTokenInput.value = state.config.jiraApiToken || '';

    el.appPasswordInput.value = '';
    if (appPassword) {
      await _refreshSession(appPassword);
      el.logoutBtn.classList.remove('hidden');
    } else if (!state.config.appPasswordSet) {
      await _refreshSession('');
      el.logoutBtn.classList.add('hidden');
    }
    // Enter the dashboard
    el.wizard.classList.remove('active');
    el.shell.style.display = '';
    await scanRepos();
  } catch (err) {
    showToast('Setup failed: ' + err.message, 'error');
    [el.wizFinishBtn, el.wizSkipAllBtn].forEach(b => { if (b) b.disabled = false; });
  }
}

// ── Wizard event listeners ────────────────────────────────────────────────────

// Step 1 — password validation
el.wizPw?.addEventListener('input', validatePwFields);
el.wizPwConfirm?.addEventListener('input', validatePwFields);
el.wizSkipPwCheck?.addEventListener('change', validatePwFields);

function validatePwFields() {
  const pw = el.wizPw.value;
  const confirm = el.wizPwConfirm.value;
  const skipping = el.wizSkipPwCheck.checked;
  el.wizPwError.textContent = '';
  if (skipping) {
    el.wizPw.value = '';
    el.wizPwConfirm.value = '';
    el.wizStep1Next.disabled = false;
    return;
  }
  if (pw && confirm && pw !== confirm) {
    el.wizPwError.textContent = 'Passwords do not match.';
    el.wizStep1Next.disabled = true;
    return;
  }
  el.wizStep1Next.disabled = false;
}

el.wizStep1Next?.addEventListener('click', () => {
  const pw = el.wizPw.value;
  const confirm = el.wizPwConfirm.value;
  const skipping = el.wizSkipPwCheck.checked;

  if (!skipping && pw && pw !== confirm) {
    el.wizPwError.textContent = 'Passwords do not match.';
    return;
  }
  if (!skipping && pw && !confirm) {
    el.wizPwError.textContent = 'Please confirm your password.';
    return;
  }

  wizard.password = (!skipping && pw === confirm) ? pw : '';
  goToStep(2);
});

// Step 2 — folder management
el.wizStep2Back?.addEventListener('click', () => goToStep(1, true));

el.wizAddFolderBtn?.addEventListener('click', async () => {
  try {
    const res = await api('/api/v1/dialog/folder', { method: 'POST', body: JSON.stringify({}) });
    if (res.path && !wizard.roots.find(r => r.path === res.path)) {
      wizard.roots.push({ path: res.path });
      renderWizFolders();
    }
  } catch (e) {
    if (e.message !== 'Canceled') showToast('Browse failed: ' + e.message, 'error');
  }
});

const wizSuggestFolderBtn = document.getElementById('wizSuggestFolderBtn');
if (wizSuggestFolderBtn) {
  wizSuggestFolderBtn.addEventListener('click', async () => {
    try {
      const res = await api('/api/v1/suggest-roots');
      if (res.suggestions?.length) {
        let added = 0;
        for (const s of res.suggestions) {
          if (!wizard.roots.find(r => r.path === s)) {
            wizard.roots.push({ path: s });
            added++;
          }
        }
        if (added > 0) {
          renderWizFolders();
          showToast(`Added ${added} mounted folders`, 'success');
        } else {
          showToast('No new mounted folders found.', 'info');
        }
      } else {
        showToast('No mounted folders detected.', 'info');
      }
    } catch (e) {
      showToast('Failed to suggest roots: ' + e.message, 'error');
    }
  });
}

el.wizStep2Next?.addEventListener('click', () => {
  if (state.config?.isDocker) {
    const hasWindowsPath = wizard.roots.some(r => /^[a-zA-Z]:\\/.test(r.path) || /^\\\\/.test(r.path) || /^[a-zA-Z]:\//.test(r.path));
    if (hasWindowsPath) {
      showToast('Docker Error: Do not use Windows host paths (e.g. C:\\...). Use the mounted container path (e.g. /repos).', 'error');
      return;
    }
  }
  goToStep(3);
});
el.wizStep2Skip?.addEventListener('click', () => goToStep(3));

// Step 3 — GitHub token verification
el.wizStep3Back?.addEventListener('click', () => goToStep(2, true));

el.wizVerifyBtn?.addEventListener('click', async () => {
  const token = el.wizGhToken.value.trim();
  if (!token) {
    el.wizTokenStatus.className = 'wizard-token-status error';
    el.wizTokenStatus.textContent = 'Please paste a token first.';
    return;
  }
  el.wizVerifyBtn.disabled = true;
  el.wizVerifyBtn.textContent = 'Verifying...';
  el.wizTokenStatus.className = 'wizard-token-status';
  el.wizTokenStatus.textContent = '';

  try {
    const res = await api('/api/v1/verify-github-token', { method: 'POST', body: JSON.stringify({ token }) });
    if (res.ok) {
      wizard.githubToken = token;
      wizard.githubUser = { login: res.login, name: res.name };
      el.wizTokenStatus.className = 'wizard-token-status success';
      el.wizTokenStatus.textContent = `✅ Token verified — connected as @${res.login}`;
    } else {
      wizard.githubToken = '';
      wizard.githubUser = null;
      el.wizTokenStatus.className = 'wizard-token-status error';
      el.wizTokenStatus.textContent = `❌ ${res.error || 'Token verification failed'}`;
    }
  } catch (err) {
    wizard.githubToken = '';
    wizard.githubUser = null;
    el.wizTokenStatus.className = 'wizard-token-status error';
    el.wizTokenStatus.textContent = `❌ ${err.message}`;
  } finally {
    el.wizVerifyBtn.disabled = false;
    el.wizVerifyBtn.textContent = 'Verify';
  }
});

el.wizStep3Next?.addEventListener('click', () => {
  const currentInput = el.wizGhToken.value.trim();
  if (currentInput !== wizard.githubToken) {
    wizard.githubToken = '';
    wizard.githubUser = null;
  }
  goToStep(4);
});
el.wizStep3Skip?.addEventListener('click', () => {
  wizard.githubToken = '';
  wizard.githubUser = null;
  goToStep(4);
});

// Step 4 — power-up keys
el.wizStep4Back?.addEventListener('click', () => goToStep(3, true));

el.wizFinishBtn?.addEventListener('click', () => {
  wizard.aiKey = el.wizAiKey?.value?.trim() || '';
  wizard.wakaKey = el.wizWakaKey?.value?.trim() || '';
  completeWizard();
});

el.wizSkipAllBtn?.addEventListener('click', () => {
  wizard.aiKey = '';
  wizard.wakaKey = '';
  completeWizard();
});

// AI Standup
el.standupButton.addEventListener('click', async () => {
  el.standupDialog.showModal();
  el.standupContent.textContent = 'Generating your AI Standup...';
  try {
    const data = await api('/api/v1/ai/standup', { method: 'POST', body: JSON.stringify({ commits: state.timeline }) });
    if (data.report) {
      el.standupContent.textContent = data.report;
      
      // If Slack is configured, show the button
      if (state.config.slackWebhookUrl) {
        el.postToSlackBtn.classList.remove('hidden');
        el.postToSlackBtn.onclick = async () => {
          el.postToSlackBtn.textContent = 'Posting...';
          el.postToSlackBtn.disabled = true;
          try {
            await api('/api/v1/integrations/slack', { method: 'POST', body: JSON.stringify({ text: data.report }) });
            el.postToSlackBtn.textContent = 'Posted!';
          } catch (e) {
            showToast('Failed to post to Slack', 'error');
            el.postToSlackBtn.textContent = 'Post to Slack';
            el.postToSlackBtn.disabled = false;
          }
        };
      } else {
        el.postToSlackBtn.classList.add('hidden');
      }
    } else {
      el.standupContent.textContent = data.report;
    }
  } catch (err) { el.standupContent.textContent = `Error: ${err.message}`; }
});

// Theme toggle
document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
    || (!document.documentElement.hasAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: light)').matches);
  const next = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('repo_theme', next);
});

// ─── AI Code Reviewer ─────────────────────────────────────────────────────────
function wireAiReviewButton(btn, repo) {
  btn.classList.remove('hidden');
  
  const autofixBtn = document.getElementById('aiAutoFixBtn');
  let currentReviewRepo = null;

  btn.addEventListener('click', async () => {
    const dialog = document.getElementById('aiReviewDialog');
    const content = document.getElementById('aiReviewContent');
    currentReviewRepo = repo;
    content.textContent = '🤖 Analyzing your changes with Gemini...';
    dialog.showModal();
    btn.disabled = true;
    if(autofixBtn) autofixBtn.disabled = true;
    try {
      const res = await api('/api/v1/repos/ai-review', { method: 'POST', body: JSON.stringify({ path: repo.path }) });
      content.textContent = res.review;
      if(autofixBtn) autofixBtn.disabled = false;
    } catch (err) {
      content.textContent = `❌ Review failed: ${err.message}`;
    } finally { btn.disabled = false; }
  });

  if (autofixBtn && !autofixBtn.dataset.wired) {
    autofixBtn.dataset.wired = "true";
    autofixBtn.addEventListener('click', async () => {
      if (!currentReviewRepo) return;
      const content = document.getElementById('aiReviewContent');
      const oldText = content.textContent;
      content.textContent = '✨ Generating and applying Auto-Fix patch...';
      autofixBtn.disabled = true;
      try {
        const res = await api('/api/v1/repos/ai-autofix', { method: 'POST', body: JSON.stringify({ path: currentReviewRepo.path }) });
        content.textContent = `✅ ${res.message}\n\nReviewing updated code...`;
        // Refresh repo view explicitly
        if (window.loadActivity) window.loadActivity();
      } catch (err) {
        content.textContent = `❌ Auto-Fix failed: ${err.message}\n\n---\n\n${oldText}`;
      } finally {
        autofixBtn.disabled = false;
      }
    });
  }
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
let currentChatRepo = null;
function openAiChat(repo) {
  currentChatRepo = repo;
  const modal = document.getElementById('aiChatModal');
  const history = document.getElementById('aiChatHistory');
  
  // Reset if opening a different repo
  if (modal.dataset.repoPath !== repo.path) {
    history.innerHTML = `
      <div style="background: var(--panel-strong); padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; align-self: flex-start; max-width: 85%; line-height: 1.4;">
        Hi! I have read your <strong>repository structure</strong> and your <strong>current git diff</strong> for <code>${repo.name}</code>. What would you like to know?
      </div>
    `;
    modal.dataset.repoPath = repo.path;
  }
  
  modal.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('aiChatForm');
  if (!chatForm) return;
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentChatRepo) return;
    
    const input = document.getElementById('aiChatInput');
    const msg = input.value.trim();
    if (!msg) return;
    
    const history = document.getElementById('aiChatHistory');
    const submitBtn = document.getElementById('aiChatSubmitBtn');
    
    // Add User message
    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'background: var(--accent); color: white; padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; align-self: flex-end; max-width: 85%; line-height: 1.4;';
    userBubble.textContent = msg;
    history.appendChild(userBubble);
    history.scrollTop = history.scrollHeight;
    
    input.value = '';
    input.disabled = true;
    submitBtn.disabled = true;
    
    // Add placeholder AI message
    const aiBubble = document.createElement('div');
    aiBubble.style.cssText = 'background: var(--panel-strong); padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; align-self: flex-start; max-width: 85%; line-height: 1.4;';
    aiBubble.textContent = 'Thinking...';
    history.appendChild(aiBubble);
    history.scrollTop = history.scrollHeight;
    
    try {
      const res = await api('/api/v1/repos/ai-chat', {
        method: 'POST',
        body: JSON.stringify({ path: currentChatRepo.path, message: msg })
      });
      const parsed = window.marked ? window.marked.parse(res.reply) : res.reply.replace(/\n/g, '<br>');
      aiBubble.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
    } catch (err) {
      aiBubble.textContent = '❌ Error: ' + err.message;
      aiBubble.style.color = 'var(--danger)';
    } finally {
      input.disabled = false;
      submitBtn.disabled = false;
      input.focus();
      history.scrollTop = history.scrollHeight;
    }
  });
});

// ─── Branch Manager ───────────────────────────────────────────────────────────
let _branchManagerRepo = null;
function wireBranchButton(btn, repo) {
  btn.classList.remove('hidden');
  btn.addEventListener('click', () => openBranchManager(repo));
}
async function openBranchManager(repo) {
  _branchManagerRepo = repo;
  document.getElementById('branchManagerRepoName').textContent = repo.name;
  document.getElementById('branchManagerDialog').showModal();
  await refreshBranchList(repo.path);
}
async function refreshBranchList(repoPath) {
  const list = document.getElementById('branchList');
  list.innerHTML = '<span class="muted">Loading branches...</span>';
  try {
    const res = await api(`/api/v1/repos/branches?path=${encodeURIComponent(repoPath)}`);
    list.replaceChildren(...res.branches.map(b => {
      const d = document.createElement('div');
      d.className = 'attention-item';
      d.style.cssText = 'padding:10px 12px;align-items:center;gap:8px;';
      d.innerHTML = `
        <span style="flex:1;font-weight:${b.isCurrent?'700':'400'};color:${b.isCurrent?'var(--accent)':'var(--text)'};font-family:monospace;">
          ${b.isCurrent ? '● ' : ''}${escapeHtml(b.name)}${b.isRemote?` <span style="color:var(--muted);font-size:0.78rem;">[remote]</span>`:''}
        </span>
        <span class="muted" style="font-size:0.8rem;">${escapeHtml(b.date||'')}</span>
        ${!b.isRemote&&!b.isCurrent?`
          <button class="ghost" style="font-size:0.78rem;padding:3px 8px;" data-action="checkout" data-branch="${escapeAttribute(b.name)}">Checkout</button>
          <button class="ghost" style="font-size:0.78rem;padding:3px 8px;color:var(--warn);" data-action="merge" data-branch="${escapeAttribute(b.name)}">Merge</button>
          <button class="ghost" style="font-size:0.78rem;padding:3px 8px;color:var(--danger);" data-action="delete" data-branch="${escapeAttribute(b.name)}">Delete</button>
        `:''}
      `;
      d.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const origText = btn.textContent;
          btn.disabled = true; btn.textContent = '...';
          try {
            await api('/api/v1/repos/branch', { method: 'POST', body: JSON.stringify({ path: repoPath, action: btn.dataset.action, branch: btn.dataset.branch }) });
            showToast(`✅ ${btn.dataset.action} → ${btn.dataset.branch}`, 'success');
            await refreshBranchList(repoPath);
            if (btn.dataset.action !== 'delete') scanRepos();
          } catch (err) { showToast(`Failed: ${err.message}`, 'error'); btn.disabled = false; btn.textContent = origText; }
        });
      });
      return d;
    }));
    if (!res.branches.length) list.innerHTML = '<span class="muted">No branches found.</span>';
  } catch (err) { list.innerHTML = `<span class="muted">Error: ${escapeHtml(err.message)}</span>`; }
}
document.getElementById('createBranchBtn')?.addEventListener('click', async () => {
  if (!_branchManagerRepo) return;
  const name = document.getElementById('newBranchInput')?.value.trim();
  const from = document.getElementById('newBranchFrom')?.value.trim();
  if (!name) { showToast('Enter a branch name', 'warn'); return; }
  try {
    await api('/api/v1/repos/branch', { method: 'POST', body: JSON.stringify({ path: _branchManagerRepo.path, action: 'create', branch: name, from: from||undefined }) });
    showToast(`✅ Created branch: ${name}`, 'success');
    document.getElementById('newBranchInput').value = '';
    document.getElementById('newBranchFrom').value = '';
    await refreshBranchList(_branchManagerRepo.path);
  } catch (err) { showToast(`Failed: ${err.message}`, 'error'); }
});

// ─── Pomodoro Timer ───────────────────────────────────────────────────────────
const POMO_PHASES = [
  {label:'FOCUS',dur:25*60,color:'var(--accent)'},{label:'SHORT BREAK',dur:5*60,color:'var(--success)'},
  {label:'FOCUS',dur:25*60,color:'var(--accent)'},{label:'SHORT BREAK',dur:5*60,color:'var(--success)'},
  {label:'FOCUS',dur:25*60,color:'var(--accent)'},{label:'SHORT BREAK',dur:5*60,color:'var(--success)'},
  {label:'FOCUS',dur:25*60,color:'var(--accent)'},{label:'LONG BREAK',dur:15*60,color:'var(--info)'},
];
let _pomoPhase=0,_pomoSecs=POMO_PHASES[0].dur,_pomoRunning=false,_pomoInterval=null;
function updatePomodoroUI(){
  const p=POMO_PHASES[_pomoPhase];
  const m=String(Math.floor(_pomoSecs/60)).padStart(2,'0'),s=String(_pomoSecs%60).padStart(2,'0');
  const timeEl=document.getElementById('pomodoroTime'),phaseEl=document.getElementById('pomodoroPhase'),cycleEl=document.getElementById('pomodoroCycle'),startEl=document.getElementById('pomodoroStartBtn');
  if(timeEl)timeEl.textContent=`${m}:${s}`;
  if(phaseEl){phaseEl.textContent=p.label;phaseEl.style.color=p.color;}
  if(cycleEl)cycleEl.textContent=`Session ${Math.min(Math.floor(_pomoPhase/2)+1,4)} of 4`;
  if(startEl)startEl.textContent=_pomoRunning?'⏸ Pause':'▶ Start';
  document.title=_pomoRunning?`${m}:${s} — ${p.label} | RepoTracker`:'RepoTracker — Git Mission Control';
  [1,2,3,4].forEach(i=>{const d=document.getElementById(`pomoDot${i}`);if(d)d.style.background=i*2-2<_pomoPhase?'var(--accent)':'var(--border)';});
}
document.getElementById('pomodoroStartBtn')?.addEventListener('click',()=>{
  if(_pomoRunning){clearInterval(_pomoInterval);_pomoRunning=false;}else{
    _pomoRunning=true;
    _pomoInterval=setInterval(()=>{
      _pomoSecs--;
      if(_pomoSecs<=0){
        clearInterval(_pomoInterval);_pomoRunning=false;
        const f=POMO_PHASES[_pomoPhase];
        if(Notification.permission==='granted')new Notification(`RepoTracker — ${f.label} complete!`,{body:_pomoPhase%2===0?'Time for a break 🎉':'Back to work! 💪',icon:'/logo.svg'});
        _pomoPhase=(_pomoPhase+1)%POMO_PHASES.length;
        _pomoSecs=POMO_PHASES[_pomoPhase].dur;
      }
      updatePomodoroUI();
    },1000);
  }
  updatePomodoroUI();
});
document.getElementById('pomodoroResetBtn')?.addEventListener('click',()=>{
  clearInterval(_pomoInterval);_pomoRunning=false;_pomoPhase=0;_pomoSecs=POMO_PHASES[0].dur;
  document.title='RepoTracker — Git Mission Control';updatePomodoroUI();
});
document.getElementById('pomodoroDialog')?.addEventListener('close',()=>{
  // Always clear the interval and reset title on dialog close (even if running — user dismissed it)
  clearInterval(_pomoInterval);
  _pomoRunning=false;
  document.title='RepoTracker — Git Mission Control';
  updatePomodoroUI();
});
document.getElementById('pomodoroBtn')?.addEventListener('click',()=>{
  if(Notification.permission==='default')Notification.requestPermission();
  document.getElementById('pomodoroDialog').showModal();updatePomodoroUI();
});

// ─── Gist Config Sync ─────────────────────────────────────────────────────────
document.getElementById('gistSyncBtn')?.addEventListener('click',async()=>{
  const btn=document.getElementById('gistSyncBtn'),status=document.getElementById('gistSyncStatus');
  btn.disabled=true;btn.textContent='Syncing...';
  try{
    const res=await api('/api/v1/config/sync-to-gist',{method:'POST',body:JSON.stringify({})});
    status.textContent=`✅ Synced at ${new Date(res.syncedAt).toLocaleTimeString()}`;
    const g=document.getElementById('gistIdInput');if(g)g.value=res.gistId;
    showToast('Config synced to GitHub Gist! ☁️','success');
  }catch(err){showToast('Gist sync failed: '+err.message,'error');}
  finally{btn.disabled=false;btn.textContent='☁️ Sync to Gist';}
});
document.getElementById('gistRestoreBtn')?.addEventListener('click',async()=>{
  const gistId=document.getElementById('gistIdInput')?.value.trim();
  if(!gistId){showToast('Enter a Gist ID first','warn');return;}
  const btn=document.getElementById('gistRestoreBtn');btn.disabled=true;btn.textContent='Restoring...';
  try{
    const res=await api('/api/v1/config/restore-from-gist',{method:'POST',body:JSON.stringify({gistId})});
    showToast(`✅ Config restored — ${res.restored.roots.length} roots`,'success');
    await loadConfig();await scanRepos();
  }catch(err){showToast('Restore failed: '+err.message,'error');}
  finally{btn.disabled=false;btn.textContent='⬇️ Restore from Gist';}
});

// ─── Activity / Team Tab ──────────────────────────────────────────────────────
const EVENT_LABELS={'repo_scan':'🔍 Repo Scan','ai_sync':'🤖 AI Sync','ai_review':'🔍 AI Review','terminal_open':'💻 Terminal','search':'🔎 Search','standup':'📋 Standup','clone':'📥 Clone','branch_op':'🌿 Branch Op','gist_sync':'☁️ Gist Sync','gist_restore':'⬇️ Gist Restore'};
async function loadTeamTab(){
  try {
    const res=await api('/api/v1/activity');
    const stats=res.weeklyStats||{},activity=res.activity||[];
    const statCards=[{label:'AI Syncs',key:'ai_sync',icon:'🤖'},{label:'AI Reviews',key:'ai_review',icon:'🔍'},{label:'Searches',key:'search',icon:'🔎'},{label:'Terminal Sessions',key:'terminal_open',icon:'💻'},{label:'Scans',key:'repo_scan',icon:'📡'},{label:'Branch Ops',key:'branch_op',icon:'🌿'}];
    const statsEl=document.getElementById('activityStats');
    if(statsEl)statsEl.replaceChildren(...statCards.map(c=>{const el=document.createElement('article');el.className='metric';el.innerHTML=`<span>${c.icon} ${c.label}</span><strong>${stats[c.key]||0}</strong>`;return el;}));
    const logEl=document.getElementById('activityLog');
    if(logEl){
      if(!activity.length){logEl.innerHTML='<span class="muted">No activity recorded yet.</span>';}else{
        logEl.replaceChildren(...activity.map(entry=>{
          const d=document.createElement('div');d.className='timeline-item';
          d.innerHTML=`<div class="timeline-meta"><strong>${escapeHtml(EVENT_LABELS[entry.event]||entry.event)}</strong> <span class="muted">${relativeTime(entry.ts||0)}</span></div>${entry.repoName?`<div class="muted" style="font-size:0.82rem;">${escapeHtml(entry.repoName)}</div>`:''}`;return d;
        }));
      }
    }
  }catch(err){console.warn('Activity fetch failed:',err);}
}
document.querySelectorAll('.tab-btn[data-target="tab-team"]').forEach(b=>b.addEventListener('click',loadTeamTab));

// ─── Ecosystem Tab ────────────────────────────────────────────────────────────
function populateEcosystemTab(){
  if(!state.repos||!state.repos.length)return;
  const repos=state.repos.filter(r=>!r.isCloud);
  const frameworkMap=new Map();
  for(const repo of repos)for(const lang of(repo.languages||[]))frameworkMap.set(lang.name,(frameworkMap.get(lang.name)||0)+1);
  const frameworkEl=document.getElementById('frameworkList');
  if(frameworkEl){
    const sorted=[...frameworkMap.entries()].sort((a,b)=>b[1]-a[1]);
    frameworkEl.replaceChildren(...sorted.map(([name,count])=>{
      const p=document.createElement('div');
      p.style.cssText='display:inline-flex;align-items:center;gap:6px;background:color-mix(in srgb,var(--accent) 12%,var(--bg-card));border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:99px;padding:6px 14px;font-size:0.85rem;font-weight:600;';
      p.innerHTML=`<span>${escapeHtml(name)}</span><span style="color:var(--accent);">${count}</span>`;return p;
    }));
    if(!sorted.length)frameworkEl.innerHTML='<span class="muted">Scan repos to see framework usage.</span>';
  }
  const withPkg=repos.filter(r=>r.scripts!==null).length,highRisk=repos.filter(r=>r.health<60).length;
  const metricsEl=document.getElementById('ecosystemMetrics');
  if(metricsEl){
    const items=[['Node.js Repos',withPkg],['High Risk Repos',highRisk],['Total Tracked',repos.length],['Languages Detected',frameworkMap.size]];
    metricsEl.replaceChildren(...items.map(([label,value])=>{const c=document.createElement('article');c.className='metric';c.innerHTML=`<span>${label}</span><strong>${value}</strong>`;return c;}));
  }
}
document.querySelectorAll('.tab-btn[data-target="tab-ecosystem"]').forEach(b=>b.addEventListener('click',populateEcosystemTab));

// ─── Star Nudge Banner ────────────────────────────────────────────────────────
function maybeShowStarNudge(){
  if(localStorage.getItem('rt_star_dismissed'))return;
  const count=parseInt(localStorage.getItem('rt_scan_count')||'0',10)+1;
  localStorage.setItem('rt_scan_count',String(count));
  if(count===3)setTimeout(()=>document.getElementById('starNudgeBanner')?.classList.remove('hidden'),2000);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  const savedTheme = localStorage.getItem('repo_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  el.scanMeta.textContent = 'Connecting to server...';
  const ok = await loadConfig();
  if (!ok) return;
  // Pre-populate Gist ID field if already synced
  if (state.config?.gistSyncId) {
    const g = document.getElementById('gistIdInput'); if (g) g.value = state.config.gistSyncId;
    const gs = document.getElementById('gistSyncStatus');
    if (gs && state.config.lastGistSync) gs.textContent = `Last synced: ${new Date(state.config.lastGistSync).toLocaleString()}`;
  }
  if (!state.config.onboardingComplete) {
    await showWizard();
  } else {
    el.scanMeta.textContent = 'Ready. Click Scan repos to refresh.';
    el.wizard.classList.remove('active');
    el.shell.style.display = '';
    await scanRepos();
    maybeShowStarNudge();
  }
})();

// Close custom dropdowns when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.quick-actions-dropdown')) {
    document.querySelectorAll('.quick-actions-dropdown[open]').forEach(d => d.removeAttribute('open'));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INVESTOR-READY FEATURES — Sprint 1-4
// ══════════════════════════════════════════════════════════════════════════════



// ── Sprint 2: Team Status + Banner ─────────────────────────────────────────────
async function checkTeamStatus() {
  try {
    const status = await api('/api/v1/team/status');
    const banner = document.getElementById('teamModeBanner');
    const urlEl = document.getElementById('teamModeUrl');
    const copyBtn = document.getElementById('copyTeamUrlBtn');

    if (status.teamMode && status.teamUrl) {
      if (banner) { banner.classList.remove('hidden'); }
      if (urlEl) urlEl.textContent = status.teamUrl;
      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(status.teamUrl).then(() => showToast('Team URL copied!', 'success'));
      }, { once: true });
    }

    // Refresh team tokens list in settings
    renderTeamTokens(status);
  } catch { /* silent — server might be in solo mode */ }
}

async function generateTeamToken() {
  const label = prompt('Label for this token (e.g. teammate\'s name):');
  if (!label) return;
  try {
    const res = await api('/api/v1/team/token', { method: 'POST', body: JSON.stringify({ label }) });
    showToast(`✅ Token generated for ${res.token.label}`, 'success');
    // Show token in a prompt so user can copy it
    const tokenStr = `${res.token.token}`;
    const msg = `Share this token with ${res.token.label}:\n\n${tokenStr}\n\n(Copy it now — it won't be shown again)`;
    alert(msg);
    await checkTeamStatus();
  } catch (err) { showToast(`❌ ${err.message}`, 'error'); }
}

function renderTeamTokens(status) {
  const list = document.getElementById('teamTokensList');
  const empty = document.getElementById('teamTokensEmpty');
  if (!list) return;
  list.innerHTML = '';
  // We can only show count/label, not the raw token (stored server-side)
  if (!status?.tokenCount) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  // Token details come from /api/config teamTokens field — show labels
  const tokens = state.config?.teamTokens || [];
  tokens.forEach((t, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1e293b;';
    row.innerHTML = `<span>${escapeHtml(t.label)} <span class="muted" style="font-size:0.75rem;">${relativeTime(Math.floor(new Date(t.createdAt||0).getTime()/1000))}</span></span>
      <button class="ghost" style="padding:2px 8px;font-size:0.75rem;color:var(--danger);" data-token="${escapeAttribute(t.token)}">Revoke</button>`;
    row.querySelector('button')?.addEventListener('click', async (e) => {
      await api('/api/v1/team/token', { method: 'DELETE', body: JSON.stringify({ token: e.target.dataset.token }) });
      // Update local state
      state.config.teamTokens = state.config.teamTokens?.filter(tok => tok.token !== e.target.dataset.token);
      renderTeamTokens({ tokenCount: state.config.teamTokens?.length });
      showToast('Token revoked.', 'info');
    });
    list.appendChild(row);
  });
}

document.getElementById('generateTeamTokenBtn')?.addEventListener('click', generateTeamToken);

// ── Sprint 3: Export Dashboard ──────────────────────────────────────────────────
document.getElementById('exportDashboardBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('exportDashboardBtn');
  btn.textContent = '⏳ Exporting...'; btn.disabled = true;
  try {
    const res = await fetch('/export', { credentials: 'include' });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repotracker-${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Dashboard exported!', 'success');
  } catch (err) { showToast(`Export failed: ${err.message}`, 'error'); }
  finally { btn.textContent = '📤 Export'; btn.disabled = false; }
});

// ── Sprint 4: Ping Opt-In (wired from wizard) ──────────────────────────────────
// The ping checkbox is in wizard step 1 — we save the preference when wizard completes.
// The actual ping happens server-side on boot. We just need to record the opt-in.
const _wizPingCheck = document.getElementById('wizPingOptIn');
if (_wizPingCheck) {
  // Pre-check if already opted in (page reload after wizard)
  _wizPingCheck.checked = state.config?.pingOptIn === true;
}

// ── Boot: check team status on load ───────────────────────────────────────────
checkTeamStatus();



// ══════════════════════════════════════════════════════════════════════════════
// FIX #5 — UX: Keyboard shortcuts, team self-test, better error handling
// ══════════════════════════════════════════════════════════════════════════════

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // ? = show shortcuts help
  if (e.key === '?' && !e.target.matches('input,textarea,select')) {
    showToast(
      '⌨️  Shortcuts: S=Scan · F=Filter · T=Terminal · B=Branch · ?=Help',
      'info', 5000
    );
    return;
  }
  if (e.target.matches('input,textarea,select,dialog *')) return;
  // S = scan repos
  if (e.key === 's' || e.key === 'S') { scanRepos(); return; }
  // F = focus filter
  if (e.key === 'f' || e.key === 'F') {
    const f = document.getElementById('filterInput') || document.querySelector('input[type="search"]');
    f?.focus(); return;
  }
  // Escape = close any open dialog
  if (e.key === 'Escape') {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }
});

// ── Team Mode Self-Test ─────────────────────────────────────────────────────────
// When Team Mode banner is shown, do a quick connectivity test and update indicator
async function runTeamSelfTest(teamUrl) {
  const banner = document.getElementById('teamModeBanner');
  if (!banner) return;
  try {
    const res = await fetch(`${teamUrl}/api/team/ping`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        banner.style.background = 'linear-gradient(90deg,#065f46,#047857)';
        showToast('✅ Team Mode active — teammates can connect!', 'success');
      }
    }
  } catch {
    banner.style.background = 'linear-gradient(90deg,#7f1d1d,#991b1b)';
    showToast('⚠️ Team URL unreachable — check your firewall or LAN settings', 'error', 6000);
  }
}

// Augment checkTeamStatus to also run self-test
const _origCheckTeamStatus = checkTeamStatus;
// eslint-disable-next-line no-global-assign
window._teamSelfTestRan = false;
const _wrappedCheckTeam = async () => {
  try {
    const status = await api('/api/v1/team/status');
    if (status.teamMode && status.teamUrl && !window._teamSelfTestRan) {
      window._teamSelfTestRan = true;
      setTimeout(() => runTeamSelfTest(status.teamUrl), 1500);
    }
  } catch {}
};
_wrappedCheckTeam();

// ── Better error handler for Pro gate catches ──────────────────────────────────
function handleApiError(err, defaultMsg) {
  showToast(err.message || defaultMsg, 'error');
}
window.handleApiError = handleApiError;

// Clear "Unknown API route" error if present on boot
if (el.scanMeta && el.scanMeta.textContent.includes('Unknown API route')) {
    el.scanMeta.textContent = 'Ready to scan.';
}

// --- Dropdown Menu Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const dropdownMenu = document.getElementById('dropdownMenu');
  
  if (menuToggleBtn && dropdownMenu) {
    menuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('visible');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !menuToggleBtn.contains(e.target)) {
        dropdownMenu.classList.remove('visible');
      }
    });
  }
});


// ── Navbar Hamburger Dropdown ─────────────────────────────────────────────
(function() {
  const menuBtn = document.getElementById('menuToggleBtn');
  const menu    = document.getElementById('dropdownMenu');
  const upgradeModal = document.getElementById('upgradeModal');

  if (!menuBtn || !menu) return;

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== menuBtn) {
      menu.classList.remove('open');
    }
  });

  // Close when pressing Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') menu.classList.remove('open');
  });

  // Close menu after any item click
  menu.addEventListener('click', () => {
    setTimeout(() => menu.classList.remove('open'), 120);
  });
})();


// ── Team Workspace Status ──────────────────────────────────────────────────
(function initWorkspaceUi() {
  const setupPanel = document.getElementById('workspaceSetupPanel');
  const statusPanel = document.getElementById('workspaceStatusPanel');
  const repoInput = document.getElementById('workspaceRepoInput');
  const initBtn = document.getElementById('initWorkspaceBtn');
  const syncBtn = document.getElementById('syncWorkspaceBtn');
  const errorMsg = document.getElementById('workspaceSetupError');
  const lastSyncText = document.getElementById('workspaceLastSyncText');

  if (!setupPanel) return;

  function updateUi(config) {
    if (!config) return;
    if (config.workspaceRepo) {
      setupPanel.style.display = 'none';
      statusPanel.classList.remove('hidden');
      if (config.workspaceLastSync) {
        lastSyncText.textContent = `Last synced: ${new Date(config.workspaceLastSync).toLocaleTimeString()}`;
      }
    } else {
      setupPanel.style.display = 'block';
      statusPanel.classList.add('hidden');
    }
  }

  // Hook into config load
  const originalLoadConfig = window.loadConfig; // Or handle it gracefully if no hook
  
  // Refresh loop
  async function refresh() {
    try {
      const cfg = await api('/api/v1/config');
      if (cfg) updateUi(cfg);
    } catch {}
  }

  initBtn.addEventListener('click', async () => {
    initBtn.textContent = 'Connecting...';
    initBtn.disabled = true;
    errorMsg.style.display = 'none';
    try {
      const res = await fetch('/api/v1/team/workspace/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoInput.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      errorMsg.textContent = e.message;
      errorMsg.style.display = 'block';
    } finally {
      initBtn.textContent = 'Connect & Sync';
      initBtn.disabled = false;
    }
  });

  syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    syncBtn.disabled = true;
    try {
      await fetch('/api/v1/team/workspace/sync', { method: 'POST' });
      await refresh();
      // Reload activity explicitly
      if (window.loadActivity) window.loadActivity();
    } catch {} finally {
      syncBtn.textContent = 'Sync Now';
      syncBtn.disabled = false;
    }
  });

  refresh();
  setInterval(refresh, 60000);
})();


// ── Wizard Token Type Tab Switcher ────────────────────────────────────────
(function() {
  const tabs = document.querySelectorAll('.wiz-token-tab');
  const panelClassic = document.getElementById('wizPanelClassic');
  const panelFine    = document.getElementById('wizPanelFinegrained');
  const tokenInput   = document.getElementById('wizGhToken');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const isClassic = tab.dataset.tab === 'classic';
      panelClassic.classList.toggle('hidden', !isClassic);
      panelFine.classList.toggle('hidden', isClassic);

      // Update placeholder to match chosen token type
      if (tokenInput) {
        tokenInput.placeholder = isClassic ? 'ghp_...' : 'github_pat_...';
      }

      // Clear any previous status
      const status = document.getElementById('wizTokenStatus');
      if (status) { status.textContent = ''; status.className = 'wizard-token-status'; }
    });
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — GitHub Repository Browser (Ecosystem Tab)
// ══════════════════════════════════════════════════════════════════════════════

let _ghRepos = [];       // all repos from GitHub
let _localPaths = [];    // repo paths scanned locally (basenames for comparison)

/** Render one GitHub repo row */
function renderGhRepoRow(repo) {
  // Determine if this repo is already cloned locally
  const isLocal = _localPaths.some(p =>
    p.toLowerCase() === repo.name.toLowerCase() ||
    p.toLowerCase() === repo.full_name.toLowerCase().replace('/', '_')
  );

  const row = document.createElement('div');
  row.dataset.repoName = repo.full_name.toLowerCase();
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-bottom:1px solid var(--border);transition:background 0.1s;';
  row.addEventListener('mouseenter', () => row.style.background = 'var(--panel-strong)');
  row.addEventListener('mouseleave', () => row.style.background = '');

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;flex:1;';

  // Visibility icon
  const visIcon = repo.private
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" title="Private"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" title="Public"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

  const info = document.createElement('div');
  info.style.cssText = 'min-width:0;flex:1;';
  info.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      ${visIcon}
      <a href="${safeUrl(repo.html_url)}" target="_blank" rel="noopener" style="font-size:13.5px;font-weight:600;color:var(--primary);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;" title="${escapeAttribute(repo.full_name)}">${escapeHtml(repo.full_name)}</a>
      ${repo.language ? `<span style="font-size:11px;padding:1px 7px;border-radius:99px;background:var(--panel-strong);color:var(--muted);border:1px solid var(--border);">${repo.language}</span>` : ''}
      ${repo.fork ? `<span style="font-size:11px;padding:1px 7px;border-radius:99px;background:#fef3c7;color:#92400e;">fork</span>` : ''}
    </div>
    ${repo.description ? `<p style="font-size:12px;color:var(--muted);margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">${repo.description}</p>` : ''}
  `;

  left.appendChild(info);

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px;';

  // Star count
  if (repo.stargazers_count > 0) {
    right.innerHTML += `<span style="font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:3px;">⭐ ${repo.stargazers_count.toLocaleString()}</span>`;
  }

  if (isLocal) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:11.5px;padding:3px 10px;border-radius:99px;background:#d1fae5;color:#065f46;font-weight:600;white-space:nowrap;';
    badge.textContent = '✓ Cloned';
    right.appendChild(badge);
  } else {
    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'btn-sm';
    cloneBtn.style.cssText = 'padding:5px 12px;font-size:12px;white-space:nowrap;';
    cloneBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Clone`;
    cloneBtn.addEventListener('click', () => {
      // Pre-fill clone dialog and open it
      const roots = state.config?.roots || [];
      if (!roots.length) { showToast('Configure at least one folder in Settings first.', 'warn'); return; }
      el.cloneDestSelect.innerHTML = roots.map(r => `<option value="${r}">${r}</option>`).join('');
      el.cloneDialog.showModal();
      el.confirmCloneButton.onclick = async () => {
        const dest = el.cloneDestSelect.value;
        if (!dest) return;
        el.confirmCloneButton.disabled = true;
        el.confirmCloneButton.textContent = 'Cloning…';
        try {
          const res = await api('/api/v1/repos/clone', {
            method: 'POST',
            body: JSON.stringify({ root: dest, url: repo.clone_url, name: repo.name }),
          });
          el.cloneDialog.close();
          openShelby(`Clone ${repo.name}`, res.taskId);
          // Mark as cloned
          _localPaths.push(repo.name);
          cloneBtn.replaceWith((() => {
            const b = document.createElement('span');
            b.style.cssText = 'font-size:11.5px;padding:3px 10px;border-radius:99px;background:#d1fae5;color:#065f46;font-weight:600;';
            b.textContent = '✓ Cloning…';
            return b;
          })());
        } catch (err) {
          showToast(`Clone failed: ${err.message}`, 'error');
          el.confirmCloneButton.disabled = false;
          el.confirmCloneButton.textContent = 'Clone';
        }
      };
    });
    right.appendChild(cloneBtn);
  }

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

/** Render the GitHub repo list, applying search filter */
function renderGhRepoList(filter = '') {
  const list = document.getElementById('ghRepoList');
  const badge = document.getElementById('ghRepoBadge');
  if (!list) return;

  const q = filter.toLowerCase().trim();
  const filtered = q ? _ghRepos.filter(r => r.full_name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)) : _ghRepos;

  list.innerHTML = '';
  if (!filtered.length) {
    list.innerHTML = `<div style="padding:32px;text-align:center;"><p class="muted" style="font-size:13px;">No repositories match "${filter}"</p></div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(r => frag.appendChild(renderGhRepoRow(r)));
  list.appendChild(frag);

  if (badge) {
    badge.style.display = '';
    const clonedCount = _ghRepos.filter(r => _localPaths.some(p => p.toLowerCase() === r.name.toLowerCase())).length;
    badge.textContent = `${_ghRepos.length} repos · ${clonedCount} cloned`;
  }
}

/** Load GitHub repos from API and render */
async function loadGhRepos(forceRefresh = false) {
  const loading = document.getElementById('ghRepoLoading');
  const empty   = document.getElementById('ghRepoEmpty');
  const errEl   = document.getElementById('ghRepoError');
  const list    = document.getElementById('ghRepoList');
  if (!list) return;

  if (loading) loading.style.display = 'block';
  if (empty)   empty.style.display = 'none';
  if (errEl)   errEl.style.display = 'none';
  list.innerHTML = '';

  try {
    const repos = await api('/api/v1/github/repos');
    _ghRepos = repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // Build list of locally known repo names from current state
    _localPaths = (state.repos || []).map(r => r.name);

    if (loading) loading.style.display = 'none';
    renderGhRepoList(document.getElementById('ghRepoSearch')?.value || '');
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (err.message?.toLowerCase().includes('pat') || err.message?.includes('401')) {
      if (empty) empty.style.display = 'block';
    } else {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = `⚠ ${err.message}`; }
    }
  }
}

// Wire search filter
document.getElementById('ghRepoSearch')?.addEventListener('input', e => {
  renderGhRepoList(e.target.value);
});

// Wire refresh button
document.getElementById('ghRepoRefreshBtn')?.addEventListener('click', () => loadGhRepos(true));

// Load when Ecosystem tab becomes active
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.target === 'tab-ecosystem' && _ghRepos.length === 0) {
      loadGhRepos();
    }
    if (btn.dataset.target === 'tab-insights') {
      loadInsights();
    }
  });
});

// ── INSIGHTS & AI STANDUP ──────────────────────────────────────────────────
let _insightsLoaded = false;
async function loadInsights() {
  if (_insightsLoaded) return;
  try {
    const res = await api('/api/v1/insights/activity');
    const graph = document.getElementById('contributionGraph');
    if (graph) {
      graph.innerHTML = '';
      
      const today = new Date();
      const days = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }
      
      const counts = Object.values(res);
      const maxCount = counts.length ? Math.max(...counts) : 1;
      
      for (const day of days) {
        const count = res[day] || 0;
        const cell = document.createElement('div');
        cell.title = `${count} commits on ${day}`;
        cell.style.width = '12px';
        cell.style.height = '12px';
        cell.style.borderRadius = '2px';
        
        if (count === 0) {
          cell.style.background = 'var(--border)';
        } else {
          const intensity = Math.max(0.3, Math.min(1, count / maxCount));
          if (intensity <= 0.3) cell.style.background = 'color-mix(in srgb, var(--accent) 30%, transparent)';
          else if (intensity <= 0.6) cell.style.background = 'color-mix(in srgb, var(--accent) 60%, transparent)';
          else if (intensity <= 0.85) cell.style.background = 'color-mix(in srgb, var(--accent) 85%, transparent)';
          else cell.style.background = 'var(--accent)';
        }
        graph.appendChild(cell);
      }
    }
    _insightsLoaded = true;
  } catch (err) {
    console.error('Failed to load insights', err);
  }
}

const standupBtn = document.getElementById('standupButton');
if (standupBtn) {
  standupBtn.addEventListener('click', async () => {
    standupBtn.disabled = true;
    standupBtn.textContent = 'Generating... (This takes a few seconds)';
    
    try {
      const res = await api('/api/v1/ai/standup', { method: 'POST' });
      const dialog = document.getElementById('standupDialog');
      const content = document.getElementById('standupContent');
      
      // Basic markdown to HTML
      let html = res.standup
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
        .replace(/\\n/g, '<br>');
        
      if (window.DOMPurify) html = window.DOMPurify.sanitize(html);
      content.innerHTML = `<div style="font-family: inherit; line-height: 1.6; color: var(--text);">${html}</div>`;
      dialog.showModal();
    } catch (err) {
      showToast(err.message, 'error');
      if (err.message.includes('API Key')) {
        document.querySelector('[data-target="tab-settings"]').click();
      }
    } finally {
      standupBtn.disabled = false;
      standupBtn.textContent = 'Generate AI Standup';
    }
  });
}

// ── Auto-Updater Integration ────────────────────────────────────────────────
if (window.electronAPI && el.updateReadyBtn) {
  window.electronAPI.onUpdateAvailable(() => {
    console.log('Update available, downloading...');
  });

  window.electronAPI.onUpdateDownloaded(() => {
    console.log('Update downloaded. Prompting user.');
    el.updateReadyBtn.classList.remove('hidden');
    // Animate button attention
    el.updateReadyBtn.style.animation = 'pulse 2s infinite';
    
    // Show the top banner
    const banner = document.getElementById('systemUpdateBanner');
    if (banner) banner.classList.remove('hidden');
  });

  const doUpdate = () => {
    el.updateReadyBtn.textContent = 'Restarting...';
    const applyBtn = document.getElementById('applyUpdateBtn');
    if (applyBtn) applyBtn.textContent = 'Restarting...';
    window.electronAPI.restartToUpdate();
  };

  el.updateReadyBtn.addEventListener('click', doUpdate);
  
  const applyBtn = document.getElementById('applyUpdateBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', doUpdate);
  }
}

// ── END ──────────────────────────────────────────────────────────────────────
