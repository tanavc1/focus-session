# Focus

**A local-first macOS productivity tracker.** Automatically tracks your active apps and websites, detects distraction, measures flow state, and generates AI-powered coaching reports — all running privately on your Mac.

No accounts. No cloud. No subscription. Free and open source.

---

## ⬇️ Download

### **[Focus.dmg — Latest Build](https://github.com/tanavc1/focus-session/releases/latest/download/Focus.dmg)**

> macOS 12 (Monterey) or later · Apple Silicon & Intel

### Install

1. Open `Focus.dmg` → drag **Focus** into Applications
2. First launch: right-click → **Open** → click **Open** again _(one-time Gatekeeper bypass for unsigned apps)_
3. Grant **Accessibility** permission when prompted → **System Settings → Privacy & Security → Accessibility**

---

## What it does

**During a session:**
- Polls active app, window title, and browser URL every 3 seconds
- Classifies activity as productive / neutral / distracting / idle
- Detects flow state (25+ consecutive minutes of focused work)
- Shows a live timer and status in the macOS menu bar
- Sends a desktop notification if you've been distracted for ~1 minute

**After each session:**
- Generates a focus score (0–100) and activity timeline
- Lists top apps, distracting sites, and flow periods
- Uses AI (Ollama, Claude, or OpenAI) to write a personalised coaching summary
- Vision analysis: periodic screenshots are described by an AI vision model to understand *what* you were working on, not just *where*

**Planning:**
- Set daily goals and a focus target each morning
- Plan tomorrow the night before (suggested after 6pm)
- Incomplete goals carry forward as session starters

---

## Screenshots

> Start a session in one click. See exactly what you're doing as it happens.

---

## Privacy

| What Focus does | What Focus never does |
|---|---|
| Stores data in a local SQLite DB | Send data to any server |
| Reads active app name and window title | Log keystrokes or passwords |
| Reads browser URL (if permitted) | Store screenshots |
| Takes screen snapshots for AI analysis then discards them | Require an account |

**Data lives at:** `~/Library/Application Support/focus-session/focus-session.db`

---

## macOS Permissions

| Permission | Required | Purpose |
|---|---|---|
| **Accessibility** | ✅ Yes | Read active app and window title |
| **Automation → Browser** | Optional | Read current browser URL |
| **Screen Recording** | Optional | Powers Vision AI analysis |

Grant in **System Settings → Privacy & Security** or accept when prompted.

---

## AI Coaching

Three options — all optional:

### Ollama (local, free, private)
```bash
brew install ollama
ollama serve
ollama pull phi4-mini          # text summaries (~2.5 GB)
ollama pull minicpm-v:2.6      # vision analysis — reads screen text accurately (~5.5 GB)
```
Configure in **Settings → AI**. No API key needed.

> **Lighter alternative:** `ollama pull llava-phi3` (~2.9 GB) if disk space is tight. Less accurate at reading on-screen text but usable.

### Claude (Anthropic)
Add your API key in **Settings → AI → Claude**. Uses `claude-sonnet-4-6` by default.

### OpenAI
Add your API key in **Settings → AI → OpenAI**. Uses `gpt-4o-mini` by default.

---

## Build from source

```bash
git clone https://github.com/tanavc1/focus-session.git
cd focus-session
npm install        # also rebuilds native SQLite module for Electron
npm start          # dev mode with hot reload
npm run make       # produces Focus.dmg in out/make/
```

**Requirements:** Node.js 20+, macOS

---

## Troubleshooting

**App doesn't detect what I'm working on**
→ Grant Accessibility permission in System Settings → restart the app.

**Browser domain not showing**
→ Grant Automation permission for your browser (System Settings → Privacy & Security → Automation → Focus → enable your browser).

**"Apple cannot verify that Focus is safe" / "cannot be opened"**
→ macOS blocks unsigned apps by default. Two ways to fix it (one-time only):

**Option A** — System Settings:
1. Try to open Focus (it will be blocked)
2. Open **System Settings → Privacy & Security**
3. Scroll down — you'll see _"Focus was blocked"_ → click **Open Anyway**
4. Enter your Mac password → **Open**

**Option B** — Terminal (fastest):
```bash
xattr -dr com.apple.quarantine /Applications/Focus.app
```
Then double-click Focus normally. You'll never see the warning again.

**Vision analysis not working**
→ Make sure Ollama is running (`ollama serve`) and the vision model is pulled (`ollama pull minicpm-v:2.6`). Check **Settings → AI → Test Connection**. If you see the model listed there, click it to set it as your vision model.

**AI report not generating**
→ For Ollama: ensure it's running. For Claude/OpenAI: verify your API key format (Claude: `sk-ant-...`, OpenAI: `sk-...`).

---

## Tech stack

- **Electron 31** + **React 18** + **TypeScript**
- **SQLite** (better-sqlite3) — all data local
- **Tailwind CSS** — UI styling
- **Ollama / Anthropic SDK / OpenAI SDK** — AI providers
- **AppleScript** — active app and browser URL detection
- **macOS powerMonitor** — idle detection (zero subprocess overhead)

---

## Releases

Every push to `main` builds a new DMG automatically via GitHub Actions and updates the [latest release](https://github.com/tanavc1/focus-session/releases/tag/latest). The download URL never changes.
