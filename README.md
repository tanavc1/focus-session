# Focus

A local-first focus and productivity tracker for macOS. Tracks your active apps and websites, detects distraction, measures flow state, and generates AI-powered session reports — all running privately on your Mac.

---

## Download

**[⬇ Download the latest Focus.dmg](https://github.com/tanavc1/focus-session/releases/tag/latest)**

> macOS 12 (Monterey) or later · Apple Silicon and Intel both supported

### Install in 3 steps

1. Open the `.dmg` → drag **Focus** to your **Applications** folder
2. **Right-click** Focus in Applications → click **Open** (required once for unsigned builds)
3. Grant **Accessibility** permission when prompted

---

## macOS Permissions

| Permission | Why |
|---|---|
| **Accessibility** | Read the active app name and window title |
| **Automation → Browser** | Read the current URL in Safari / Chrome / Arc |

Grant them in **System Settings → Privacy & Security** if not prompted automatically.

---

## Features

- **Activity tracking** — polls active app, window title, and browser URL every 3 s
- **Distraction detection** — classifies activity as productive / neutral / distracting / idle
- **Flow state** — detects sustained focus (25+ min) with live in-session indicator and menu bar 🔥
- **Session reports** — focus score, flow periods, top apps, distracting sites, AI coaching
- **AI summaries** — works with Ollama (local), Claude API, or OpenAI API
- **Vision analysis** — optional screen snapshots for richer context (Ollama vision models)
- **Spotify integration** — shows now-playing track with album art during sessions
- **Menu bar** — live timer and quick start/stop without opening the window
- **Privacy first** — all data in local SQLite, nothing leaves your Mac

---

## Building from source

**Requirements:** Node.js 20+, macOS

```bash
git clone https://github.com/tanavc1/focus-session.git
cd focus-session
npm install        # also rebuilds native modules for Electron
npm start          # dev mode with hot reload
npm run make       # produces Focus.dmg in out/make/
```

---

## Optional: Local AI with Ollama

Install [Ollama](https://ollama.com) and pull a model:

```bash
brew install ollama
ollama serve
ollama pull phi4-mini          # language model — session summaries
ollama pull qwen2.5vl:7b       # vision model — optional screen analysis
```

Configure in **Settings → AI** inside the app. Claude and OpenAI APIs also supported.

---

## Data location

```
~/Library/Application Support/focus-session/focus-session.db
```

Delete this file to reset all data.

---

## Troubleshooting

**App doesn't detect activity** — Grant Accessibility in System Settings, then restart the app.

**Browser URL not detected** — Grant Automation permission for your browser (Firefox not supported).

**"Focus can't be opened" on first launch** — Right-click the app → Open. This is a one-time Gatekeeper bypass for unsigned apps.

---

## Automatic releases

Every push to `main` builds a new DMG via GitHub Actions and updates the [latest release](https://github.com/tanavc1/focus-session/releases/tag/latest) automatically. No manual steps needed.
