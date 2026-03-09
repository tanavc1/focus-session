# Focus Session

A local-first focus tracking desktop app for macOS. Track what you work on, detect distractions, and get an AI-generated session report — all running locally with zero cloud dependencies.

## Features

- **Activity Tracking**: Polls active app, window title, and browser domain every 3 seconds
- **Distraction Detection**: Rules-based classification (productive / neutral / distracting / idle)
- **Session Reports**: Charts, timeline, focus score, top apps/sites, longest streak
- **Local AI Summaries**: Ollama-powered session summaries and coaching suggestions
- **Privacy First**: All data stored locally in SQLite, no cloud sync, no keystrokes captured

## Prerequisites

- macOS (tested on macOS 13+)
- Node.js 18+ and npm
- Ollama (for AI summaries — optional but recommended)

## Setup

### 1. Install Node dependencies

```bash
cd "Focus App"
npm install
```

### 2. Rebuild native modules for Electron

```bash
npx electron-rebuild -f -w better-sqlite3
```

### 3. Install and start Ollama (optional, for AI summaries)

```bash
# Install Ollama
brew install ollama

# Start the Ollama server (run in a separate terminal)
ollama serve

# Pull a model (choose one):
ollama pull llama3.1:8b       # ~4.7GB — best quality
ollama pull phi3:mini          # ~2.3GB — faster, lighter
ollama pull llama3.2:3b        # ~2.0GB — good balance
```

### 4. Grant Accessibility permissions

Focus Session uses AppleScript to detect the active application and window title.

1. Open **System Settings → Privacy & Security → Accessibility**
2. Click **+** and add the **Focus Session** app (or your terminal during dev)
3. Do the same for **System Settings → Privacy & Security → Automation** if prompted

> **Note:** You may be prompted automatically the first time the app runs. Just approve the dialogs.

### 5. Run the app

```bash
npm start
```

## macOS Permissions Required

| Permission | Why |
|------------|-----|
| Accessibility | To read active app name and window title via AppleScript |
| Automation → Browsers | To read the current browser URL/domain (optional) |

The app will prompt for these on first run.

## Project Structure

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── index.ts             # App entry, BrowserWindow setup
│   ├── config/defaults.ts   # Default settings and classification rules
│   ├── database/db.ts       # SQLite CRUD via better-sqlite3
│   ├── tracking/
│   │   ├── macosTracker.ts  # AppleScript + idle detection
│   │   └── activityTracker.ts # Poll loop, event persistence
│   ├── analytics/
│   │   ├── distractionClassifier.ts # Rules-based classification
│   │   └── sessionAnalyzer.ts       # Event→block grouping, report computation
│   ├── llm/ollamaClient.ts  # Ollama HTTP client + prompt builders
│   └── ipc/handlers.ts      # All IPC handlers (session, settings, reports)
├── preload/index.ts         # Exposes safe API to renderer via contextBridge
├── renderer/                # React frontend
│   ├── App.tsx              # Router setup
│   ├── pages/               # Home, ActiveSession, Report, History, Settings
│   ├── components/          # Layout, modals, timeline, stat cards
│   ├── store/useStore.ts    # Zustand global state
│   └── hooks/useSession.ts  # Session control + activity subscription
└── shared/types.ts          # Shared TypeScript types
```

## Database Location

```
~/Library/Application Support/focus-session/focus-session.db
```

Delete this file to reset all data.

## Ollama Model Notes

| Model | Size | Notes |
|-------|------|-------|
| `llama3.1:8b` | ~4.7GB | Default. Best quality for summarization |
| `phi3:mini` | ~2.3GB | Faster, decent quality |
| `llama3.2:3b` | ~2.0GB | Good balance of speed and quality |

The model can be changed in **Settings → AI / Ollama**.

## What is tracked

- Active application name
- Window title (not content)
- Browser domain (not full URL, not page content)
- System idle time (seconds since last keyboard/mouse input)
- Timestamps of all activity changes

## What is NOT tracked

- Keystrokes
- Screenshots
- Window/page content
- Clipboard data
- Network traffic
- Personal information

## Tech Stack

- **Desktop**: Electron 31 + electron-forge
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Charts**: Recharts
- **Backend**: Node.js (in main process)
- **Database**: SQLite via better-sqlite3
- **State**: Zustand
- **LLM**: Ollama (local)
- **Build**: Vite

## Troubleshooting

### App doesn't detect activity
- Grant Accessibility permission in System Settings
- Restart the app after granting permission

### Browser domain not detected
- Grant Automation permission for your browser (Safari, Chrome, Arc, etc.)
- Firefox does not support AppleScript URL access; domain falls back to window title parsing

### AI summary not showing
- Ensure `ollama serve` is running in a terminal
- Check **Settings → AI / Ollama** that the endpoint is `http://localhost:11434`
- Make sure you've pulled a model: `ollama pull llama3.1:8b`

### Native module error on first run
```bash
npx electron-rebuild -f -w better-sqlite3
```
