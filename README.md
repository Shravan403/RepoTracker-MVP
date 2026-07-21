![Deploy to AWS EC2](https://github.com/Shravan403/RepoTracker-MVP/actions/workflows/deploy.yml/badge.svg)
<div align="center">

<img src="./assets/banner.png" alt="RepoTracker Banner" width="100%">

<br/>

<img src="https://img.shields.io/badge/RepoTracker-v1.0.9-6366f1?style=for-the-badge&logoColor=white" alt="RepoTracker v1.0.9">

**Your intelligent, local-first Git mission control.**

RepoTracker automatically discovers, monitors, and manages every Git repository on your machine — from a single, stunning `localhost` dashboard. No cloud. No subscription. No tracking. Your code stays on your computer.

<p>
  <a href="https://github.com/Vinit080/repotracker/releases"><img src="https://img.shields.io/badge/version-1.0.9-blueviolet?style=flat-square" alt="Version"></a>
  <a href="https://github.com/Vinit080/repotracker/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-source--available-orange?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=node.js" alt="Node.js"></a>
  <a href="https://github.com/Vinit080/repotracker/stargazers"><img src="https://img.shields.io/github/stars/Vinit080/repotracker?style=flat-square&color=gold" alt="GitHub Stars"></a>
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/security-audited-blue?style=flat-square" alt="Security Audited"></a>
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Flucky-dream-377a.coolboychakane08.workers.dev%2Fstats&query=total&label=installs&color=6366f1&style=flat-square" alt="Install Count">
</p>
<p>
  <img src="https://img.shields.io/badge/Windows-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux">
</p>

</div>

---

## ✨ Features

### 📸 Screenshots & Gallery

<details>
<summary><strong>🎛️ Local-First Dashboard</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-dashboard.png" alt="RepoTracker Dashboard" width="100%">
<em>See every working repo, what needs attention, and where your momentum is.</em>
</details>

<details>
<summary><strong>🗂️ Repository Overview</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-repos.png" alt="Repository Management" width="100%">
<em>Manage multiple repos, check health scores, and clone to local with one click.</em>
</details>

<details>
<summary><strong>💻 Integrated Shelby Terminal</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-terminal.png" alt="Integrated Terminal" width="100%">
<em>Run commands directly from the dashboard without switching context.</em>
</details>

<details>
<summary><strong>⚙️ Scan Settings & GitHub Integration</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-settings.png" alt="Scan Settings" width="100%">
<em>Configure folders to scan, max depth, and integrate your GitHub PAT.</em>
</details>

<details>
<summary><strong>🤝 Team Workspace</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-team.png" alt="Team Workspace" width="100%">
<em>Connect to your team's shared workspace repository to sync dashboard data.</em>
</details>

<details>
<summary><strong>📊 Insights & Timeline</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-insights.png" alt="Insights and Timeline" width="100%">
<em>Track your 90-day contribution graph, view global timeline, and generate AI standups.</em>
</details>

<details>
<summary><strong>🌐 Ecosystem Overview</strong> (Click to expand)</summary>
<br/>
<img src="./assets/screenshot-ecosystem.png" alt="Ecosystem Overview" width="100%">
<em>A bird's-eye view of your entire GitHub ecosystem with one-click cloning.</em>
</details>

<br/>

### 🗂️ Repository Management
| Feature | Description |
|---|---|
| **📡 Auto Discovery** | Points at root folders and recursively maps every Git repo instantly |
| **❤️ Health Scoring** | Repos scored 0–100 on dirty files, unpushed commits, staleness, and CI status |
| **🌿 Branch Manager** | Create, checkout, merge, and delete branches from the UI — no terminal needed |
| **🔎 Global Search** | Fast `git grep` across all repos at once. Find every `TODO` in seconds |
| **📈 Contribution Graph** | GitHub-style 90-day local commit activity grid across all your projects |
| **🔔 Smart Alerts** | Desktop notifications when repos fall 5+ commits behind, have 20+ dirty files, or go stale |
| **🌐 GitHub Browser** | Browse all your GitHub repos (public + private) in the Ecosystem tab and clone with one click |

### 🤖 AI Features
| Feature | Description |
|---|---|
| **🪄 AI Git Sync** | Generate perfect commit messages via Gemini AI and push with one click |
| **🔍 AI Code Review** | Analyze uncommitted diffs for bugs, security issues, and quality problems *before* committing |
| **📋 Weekly Standup** | AI-generated standup report from your last 7 days of commits |

### ☁️ Sync & Config
| Feature | Description |
|---|---|
| **☁️ Gist Config Sync** | Sync your roots, settings, and tags to a private GitHub Gist. Restore on any machine in seconds |
| **📊 WakaTime** | See exactly how much time you spent coding per repo over the last 7 days |

### 🛠️ Tooling
| Feature | Description |
|---|---|
| **💻 Shelby Terminal** | Fully interactive embedded terminal powered by `xterm.js` and `node-pty` |
| **⏱ Pomodoro Timer** | Deep-work focus timer with desktop notifications — 4-session cycle with long breaks |
| **⚡ Task Runner** | Auto-parses `package.json`, `Makefile`, `Taskfile.yml`, `Dockerfile` for 1-click Quick Actions |
| **📋 Activity Log** | Local-first log of AI syncs, reviews, branch ops, and terminal sessions with relative timestamps |
| **🔄 Auto-Updater** | Polls GitHub Releases for new versions and updates in one click |

### 👥 Team Mode
| Feature | Description |
|---|---|
| **🌐 LAN Dashboard** | Run `npm run team` to broadcast your dashboard to teammates over your local network |
| **🔑 Invite Tokens** | Generate and revoke teammate invite tokens from the Team tab |
| **📢 Team Standup** | AI-generated standup report visible to all team members |

---

## 🚀 Quick Start

```bash
git clone https://github.com/Vinit080/repotracker.git
cd repotracker
npm install
npm run start:electron  # To run the full desktop app
# OR
npm start               # To run the headless web server only
```

Open **[http://localhost:4177](http://localhost:4177)** in your browser if running headless. The setup wizard handles everything else.

### Prerequisites

| Requirement | Details |
|---|---|
| [Node.js](https://nodejs.org/) **v20+** | Required |
| [Git](https://git-scm.com/) in your PATH | Required |
| [GitHub PAT](https://github.com/settings/tokens) | Optional — for GitHub browser, Gist sync, CI status |
| [Gemini API Key](https://aistudio.google.com/app/apikey) | Optional — for all AI features (free tier is sufficient) |
| [WakaTime API Key](https://wakatime.com/settings/api-key) | Optional — for per-repo coding time |

### Platform Compatibility

| Platform | Status | Notes |
|---|---|---|
| **Windows 10/11** | ✅ Full support | PowerShell for terminal & notifications |
| **macOS 12+** | ✅ Full support | Respects your default shell (zsh, bash, fish). Uses `osascript` for notifications & folder picker |
| **Linux (Desktop)** | ✅ Full support | Requires `zenity` for the folder browser dialog (`sudo apt install zenity`). Uses `notify-send` for notifications |
| **Linux (Headless)** | ⚠️ Partial | No folder picker or desktop notifications, but all core repo features, AI, terminal, and API work fine |

> **macOS note:** Shelby Terminal automatically uses your configured shell (`$SHELL`) — zsh, fish, or bash — whatever you normally use.

### GitHub Token Permissions

**Classic PAT** — enable: `repo`, `gist`, `read:user`

**Fine-grained PAT** — enable: `Contents (read)`, `Metadata (read)`, `Gists (read/write)`

---

## 🔑 Licensing

RepoTracker is **100% free and open-source**. All features, including AI Code Review, Team Mode, and Gist Sync, are unlocked and available to use up to your potential.

---

## ⚙️ Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Purpose | Required |
|---|---|---|
| `PORT` | Server port (default: `4177`) | Optional |
| `REPOTRACKER_TEAM` | Set to `1` to enable LAN Team Mode | Optional |
| `PING_URL` | Anonymous install counter endpoint | Optional |

---

## 🛠️ Development

```bash
npm run dev      # nodemon watch mode — auto-restarts on file changes
npm start        # headless production server
npm run start:electron # desktop app production mode
npm run team     # Team Mode (LAN broadcast on 0.0.0.0)
```

### Project Structure

```
repotracker/
├── src/
│   ├── server.js          # HTTP server, .env loader, static file serving, sessions
│   ├── routes/api.js      # All 37 API route handlers
│   ├── git.js             # Git command execution & repo scanning
│   ├── security.js        # PBKDF2 hashing, session tokens, rate limiting, CSP
│   ├── activity.js        # Local-first activity log (no cloud)
│   ├── export.js          # Self-contained HTML dashboard export
│   ├── notify.js          # Desktop notification dispatch (Win/Mac/Linux)
│   ├── constants.js       # DEFAULT_CONFIG, SKIP_DIRS, MIME_TYPES
│   └── utils.js           # Config normalization, sanitization, JSON helpers
├── public/
│   ├── index.html         # Single-page app shell
│   ├── js/app.js          # Frontend logic (~2,280 lines)
│   └── css/               # Design system & theme tokens
├── cloudflare-worker/
│   ├── ping-counter.js    # Anonymous opt-in install counter (Cloudflare Worker)
│   └── DEPLOY.md          # 5-minute deploy guide
├── data/                  # Runtime data (gitignored)
│   ├── config.json        # User config — roots, API keys
│   └── meta.json          # Repo metadata cache & notification cooldown state
├── .env                   # Server secrets (gitignored)
├── .env.example           # Template — safe to commit
└── docker-compose.yml     # Docker deployment
```

---

## 🐳 Docker Setup

```bash
docker compose up -d
```

Access at [http://localhost:4177](http://localhost:4177). All data is persisted in the `./data` volume.

### Volume Mounting (Required for scanning)

Docker containers cannot access host directories by default. To allow RepoTracker to scan your repositories, you **must mount your host directories** as volumes in your `docker-compose.yml`.

Example `docker-compose.yml` configuration:
```yaml
services:
  repotracker:
    image: vinit080/repotracker:latest
    ports:
      - "4177:4177"
    volumes:
      - ./data:/app/data
      # Mount your host code directory to a container path
      - C:\Users\YourName\Code:/repos
```

### Configuring Scan Roots

When setting up RepoTracker in the UI, **do not use your host path** (like `C:\Users\YourName\Code`). Instead, you must use the **mounted container path** (e.g., `/repos`). RepoTracker will automatically detect it is running in Docker and help suggest common mounted paths.

**Team Mode via Docker:**
```bash
REPOTRACKER_TEAM=1 docker compose up -d
```


---

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for the full threat model and vulnerability reporting process.

**Key protections:**
- PBKDF2-SHA512 password hashing (100,000 iterations, random salt per user)
- Cryptographically random 256-bit session tokens, persisted across restarts
- Host + Origin header validation — blocks DNS rebinding and CSRF attacks
- Content-Security-Policy headers on every response
- All shell inputs validated with allowlist regex — no raw string interpolation, ever
- API keys stored server-side only — only masked sentinels (`••• (saved)`) sent to browser
- Path traversal guards on all file read/write operations

---

## 🗺️ Roadmap

| Version | Status | Focus |
|---|---|---|
| **v0.1.0** | ✅ Released | Core dashboard, health scoring, AI sync, Shelby terminal, WakaTime |
| **v0.2.0** | ✅ Released | AI Code Review, Branch Manager, Gist Sync, Pomodoro, Ecosystem tab, GitHub browser, Smart notifications, full security audit |
| **v0.3.0** | 🔜 Planned | Custom workflow pipelines — chain Setup → Test → Build → Commit into 1-click automations. Compiled binary distribution (`.exe`, `.dmg`) |
| **v0.4.0** | 🔜 Planned | Global Dependency Graph — force-directed visual map of cross-repo dependencies and shared packages |
| **v1.0.0** | ✅ Released | The stable API v1 release. Formal API versioning (`/api/v1/`), gracefully handling AI load, maximum security audit pass, completely free pricing. |
| **v1.0.6** | ✅ Released | Full native cross-platform binaries (Windows .exe, macOS .dmg, Linux .AppImage) via `electron-builder` and GitHub Actions pipeline. |
| **v1.0.9** | ✅ Released | Security hardenings, token parsing priority fixes, frontend DOMPurify integration, and env var scrubbing. |

> ⭐ [Star us on GitHub](https://github.com/Vinit080/repotracker) · 💬 [Discussions](https://github.com/Vinit080/repotracker/discussions) · 🐛 [Issues](https://github.com/Vinit080/repotracker/issues)

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome.

1. Fork the repo
2. Create your branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 License

MIT License. Free and open source. Use it up to your potential!

© 2026 [Vinzone](https://github.com/Vinit080) — Built with ❤️ for developers who care about their Git hygiene.
