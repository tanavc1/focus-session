import type { AppClassification, Settings } from '../../shared/types';

// Default application settings
export const DEFAULT_SETTINGS: Settings = {
  // Tracking
  tracking_interval_ms: 3000,     // poll every 3 seconds
  idle_threshold_seconds: 120,    // 2 minutes idle = idle state
  enable_browser_tracking: true,

  // Ollama (local)
  ollama_endpoint: 'http://localhost:11434',
  ollama_model: 'phi4-mini:latest',

  // AI provider
  ai_provider: 'ollama',
  claude_api_key: '',
  openai_api_key: '',
  language_model: 'claude-sonnet-4-6', // default for cloud providers
  enable_llm: true,

  // Vision (Ollama-based by default — free and local)
  // Screenshots are taken automatically: on every context change + every 3 min baseline.
  vision_enabled: true,
  vision_model: 'minicpm-v:2.6',  // best screen/text reading in its size class (~5.5 GB)

  // Notifications
  enable_focus_notifications: true,
  daily_focus_target_minutes: 120,

  onboarding_completed: false,

  // Appearance
  theme: 'system',
};

// ─── Default classification rules ─────────────────────────────────────────────
// pattern_type='app'    → matches against active application name
// pattern_type='domain' → matches against browser domain
// pattern_type='title'  → matches against window title (substring)

export const DEFAULT_CLASSIFICATIONS: Omit<AppClassification, 'id'>[] = [
  // ── Distracting domains ──────────────────────────────────────────────────
  { pattern: 'youtube.com',      pattern_type: 'domain', classification: 'distracting', reason: 'Video entertainment', is_default: 1 },
  { pattern: 'twitter.com',      pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'x.com',            pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'reddit.com',       pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'facebook.com',     pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'instagram.com',    pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'tiktok.com',       pattern_type: 'domain', classification: 'distracting', reason: 'Social media',       is_default: 1 },
  { pattern: 'netflix.com',      pattern_type: 'domain', classification: 'distracting', reason: 'Video streaming',    is_default: 1 },
  { pattern: 'twitch.tv',        pattern_type: 'domain', classification: 'distracting', reason: 'Video streaming',    is_default: 1 },
  { pattern: 'hulu.com',         pattern_type: 'domain', classification: 'distracting', reason: 'Video streaming',    is_default: 1 },
  { pattern: 'disneyplus.com',   pattern_type: 'domain', classification: 'distracting', reason: 'Video streaming',    is_default: 1 },
  { pattern: 'amazon.com',       pattern_type: 'domain', classification: 'distracting', reason: 'Online shopping',    is_default: 1 },
  { pattern: 'ebay.com',         pattern_type: 'domain', classification: 'distracting', reason: 'Online shopping',    is_default: 1 },
  { pattern: 'linkedin.com',     pattern_type: 'domain', classification: 'neutral',     reason: 'Professional social',is_default: 1 },
  { pattern: 'news.ycombinator.com', pattern_type: 'domain', classification: 'neutral', reason: 'Tech news',         is_default: 1 },

  // ── Productive domains ───────────────────────────────────────────────────
  { pattern: 'github.com',       pattern_type: 'domain', classification: 'productive', reason: 'Code hosting',       is_default: 1 },
  { pattern: 'gitlab.com',       pattern_type: 'domain', classification: 'productive', reason: 'Code hosting',       is_default: 1 },
  { pattern: 'stackoverflow.com',pattern_type: 'domain', classification: 'productive', reason: 'Developer Q&A',      is_default: 1 },
  { pattern: 'npmjs.com',        pattern_type: 'domain', classification: 'productive', reason: 'Package registry',   is_default: 1 },
  { pattern: 'docs.',            pattern_type: 'domain', classification: 'productive', reason: 'Documentation',      is_default: 1 },
  { pattern: 'developer.',       pattern_type: 'domain', classification: 'productive', reason: 'Developer docs',     is_default: 1 },
  { pattern: 'mdn',              pattern_type: 'domain', classification: 'productive', reason: 'Web docs',           is_default: 1 },
  { pattern: 'notion.so',        pattern_type: 'domain', classification: 'productive', reason: 'Notes & docs',       is_default: 1 },
  { pattern: 'linear.app',       pattern_type: 'domain', classification: 'productive', reason: 'Project management', is_default: 1 },
  { pattern: 'figma.com',        pattern_type: 'domain', classification: 'productive', reason: 'Design tool',        is_default: 1 },
  { pattern: 'vercel.com',       pattern_type: 'domain', classification: 'productive', reason: 'Deployment',         is_default: 1 },

  // ── AI assistants (highly productive when used for work) ─────────────────
  { pattern: 'chat.openai.com', pattern_type: 'domain', classification: 'productive', reason: 'AI assistant', is_default: 1 },
  { pattern: 'chatgpt.com',     pattern_type: 'domain', classification: 'productive', reason: 'AI assistant', is_default: 1 },
  { pattern: 'claude.ai',       pattern_type: 'domain', classification: 'productive', reason: 'AI assistant', is_default: 1 },
  { pattern: 'perplexity.ai',   pattern_type: 'domain', classification: 'productive', reason: 'AI research',  is_default: 1 },
  { pattern: 'gemini.google.com', pattern_type: 'domain', classification: 'productive', reason: 'AI assistant', is_default: 1 },
  { pattern: 'phind.com',       pattern_type: 'domain', classification: 'productive', reason: 'AI coding',    is_default: 1 },
  { pattern: 'cursor.sh',       pattern_type: 'domain', classification: 'productive', reason: 'AI coding',    is_default: 1 },
  // ── More productive domains ───────────────────────────────────────────────
  { pattern: 'loom.com',        pattern_type: 'domain', classification: 'productive', reason: 'Video communication', is_default: 1 },
  { pattern: 'excalidraw.com',  pattern_type: 'domain', classification: 'productive', reason: 'Diagramming', is_default: 1 },
  { pattern: 'miro.com',        pattern_type: 'domain', classification: 'productive', reason: 'Whiteboarding', is_default: 1 },
  { pattern: 'airtable.com',    pattern_type: 'domain', classification: 'productive', reason: 'Data management', is_default: 1 },
  { pattern: 'jira.atlassian',  pattern_type: 'domain', classification: 'productive', reason: 'Project management', is_default: 1 },
  { pattern: 'confluence',      pattern_type: 'domain', classification: 'productive', reason: 'Documentation', is_default: 1 },
  { pattern: 'trello.com',      pattern_type: 'domain', classification: 'productive', reason: 'Project management', is_default: 1 },
  { pattern: 'asana.com',       pattern_type: 'domain', classification: 'productive', reason: 'Task management', is_default: 1 },

  // ── Productive apps ───────────────────────────────────────────────────────
  { pattern: 'Code',             pattern_type: 'app', classification: 'productive', reason: 'VS Code',               is_default: 1 },
  { pattern: 'Visual Studio Code',pattern_type:'app', classification: 'productive', reason: 'VS Code',               is_default: 1 },
  { pattern: 'Cursor',           pattern_type: 'app', classification: 'productive', reason: 'AI Code Editor',        is_default: 1 },
  { pattern: 'Xcode',            pattern_type: 'app', classification: 'productive', reason: 'Apple IDE',             is_default: 1 },
  { pattern: 'Terminal',         pattern_type: 'app', classification: 'productive', reason: 'Command line',          is_default: 1 },
  { pattern: 'iTerm',            pattern_type: 'app', classification: 'productive', reason: 'Terminal emulator',     is_default: 1 },
  { pattern: 'iTerm2',           pattern_type: 'app', classification: 'productive', reason: 'Terminal emulator',     is_default: 1 },
  { pattern: 'Warp',             pattern_type: 'app', classification: 'productive', reason: 'Terminal emulator',     is_default: 1 },
  { pattern: 'PyCharm',          pattern_type: 'app', classification: 'productive', reason: 'Python IDE',            is_default: 1 },
  { pattern: 'IntelliJ',         pattern_type: 'app', classification: 'productive', reason: 'Java IDE',              is_default: 1 },
  { pattern: 'WebStorm',         pattern_type: 'app', classification: 'productive', reason: 'JS IDE',                is_default: 1 },
  { pattern: 'Sublime Text',     pattern_type: 'app', classification: 'productive', reason: 'Text editor',           is_default: 1 },
  { pattern: 'Obsidian',         pattern_type: 'app', classification: 'productive', reason: 'Notes',                 is_default: 1 },
  { pattern: 'Notion',           pattern_type: 'app', classification: 'productive', reason: 'Notes & docs',          is_default: 1 },
  { pattern: 'Bear',             pattern_type: 'app', classification: 'productive', reason: 'Notes',                 is_default: 1 },
  { pattern: 'Figma',            pattern_type: 'app', classification: 'productive', reason: 'Design tool',           is_default: 1 },
  { pattern: 'Sketch',           pattern_type: 'app', classification: 'productive', reason: 'Design tool',           is_default: 1 },
  { pattern: 'Postman',          pattern_type: 'app', classification: 'productive', reason: 'API testing',           is_default: 1 },
  { pattern: 'TablePlus',        pattern_type: 'app', classification: 'productive', reason: 'Database tool',         is_default: 1 },
  { pattern: 'Linear',           pattern_type: 'app', classification: 'productive', reason: 'Project management',    is_default: 1 },

  // ── Distracting apps ──────────────────────────────────────────────────────
  { pattern: 'Spotify',          pattern_type: 'app', classification: 'neutral',     reason: 'Music (neutral)',       is_default: 1 },
  { pattern: 'Music',            pattern_type: 'app', classification: 'neutral',     reason: 'Music app',            is_default: 1 },
  { pattern: 'Podcasts',         pattern_type: 'app', classification: 'neutral',     reason: 'Podcasts',             is_default: 1 },
  { pattern: 'Messages',         pattern_type: 'app', classification: 'neutral',     reason: 'Messaging',            is_default: 1 },
  { pattern: 'Slack',            pattern_type: 'app', classification: 'neutral',     reason: 'Work chat',            is_default: 1 },
  { pattern: 'Discord',          pattern_type: 'app', classification: 'neutral',     reason: 'Chat platform',        is_default: 1 },
  { pattern: 'Mail',             pattern_type: 'app', classification: 'neutral',     reason: 'Email',                is_default: 1 },

  // ── Neutral apps ─────────────────────────────────────────────────────────
  { pattern: 'Finder',           pattern_type: 'app', classification: 'neutral', reason: 'File manager',            is_default: 1 },
  { pattern: 'System Preferences',pattern_type:'app', classification: 'neutral', reason: 'System settings',         is_default: 1 },
  { pattern: 'System Settings',  pattern_type: 'app', classification: 'neutral', reason: 'System settings',         is_default: 1 },
  { pattern: 'Calculator',       pattern_type: 'app', classification: 'neutral', reason: 'Utility',                 is_default: 1 },
  { pattern: 'Calendar',         pattern_type: 'app', classification: 'neutral', reason: 'Calendar',                is_default: 1 },
];

// Known browser app names for special URL/domain handling
export const BROWSER_APP_NAMES = [
  'Google Chrome',
  'Safari',
  'Firefox',
  'Arc',
  'Brave Browser',
  'Microsoft Edge',
  'Opera',
  'Vivaldi',
];
