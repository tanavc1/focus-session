import type { ClassificationType, AppClassification } from '../../shared/types';
import { getAllClassifications } from '../database/db';

// ─── Classification cache ─────────────────────────────────────────────────────
// Reload classifications from DB at most once per minute to avoid constant reads.
let cachedClassifications: AppClassification[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

function getClassifications(): AppClassification[] {
  const now = Date.now();
  if (!cachedClassifications || now - cacheTimestamp > CACHE_TTL_MS) {
    cachedClassifications = getAllClassifications();
    cacheTimestamp = now;
  }
  return cachedClassifications;
}

/** Force invalidate the classification cache (call after user edits rules). */
export function invalidateClassificationCache(): void {
  cachedClassifications = null;
}

// ─── Core classification logic ────────────────────────────────────────────────

/**
 * Classify a single activity snapshot using the rules-based system.
 *
 * Priority order:
 *  1. Idle → always 'idle'
 *  2. Domain rule (exact match or starts-with)
 *  3. App name rule (exact match or contains)
 *  4. Window title rule (substring)
 *  5. Default heuristics
 *  6. 'unknown'
 */
export function classifyActivity(
  app_name: string | null,
  browser_domain: string | null,
  window_title: string | null,
  is_idle: boolean
): ClassificationType {
  if (is_idle) return 'idle';

  const rules = getClassifications();

  // 1. Try domain match
  if (browser_domain) {
    const domainResult = matchDomain(browser_domain, rules);
    if (domainResult) return domainResult;
  }

  // 2. Try app name match
  if (app_name) {
    const appResult = matchApp(app_name, rules);
    if (appResult) return appResult;
  }

  // 3. Try window title match
  if (window_title) {
    const titleResult = matchTitle(window_title, rules);
    if (titleResult) return titleResult;
  }

  // 4. Heuristic fallbacks
  if (app_name) {
    const heuristic = heuristicClassify(app_name, browser_domain, window_title);
    if (heuristic) return heuristic;
  }

  return 'unknown';
}

function matchDomain(
  domain: string,
  rules: AppClassification[]
): ClassificationType | null {
  const domainRules = rules.filter((r) => r.pattern_type === 'domain');

  // Exact match first
  for (const rule of domainRules) {
    if (domain === rule.pattern || domain === `www.${rule.pattern}`) {
      return rule.classification;
    }
  }

  // Starts-with / contains match
  for (const rule of domainRules) {
    if (domain.includes(rule.pattern) || rule.pattern.includes(domain)) {
      return rule.classification;
    }
  }

  return null;
}

function matchApp(
  app_name: string,
  rules: AppClassification[]
): ClassificationType | null {
  const appRules = rules.filter((r) => r.pattern_type === 'app');

  // Exact match first
  for (const rule of appRules) {
    if (app_name === rule.pattern) {
      return rule.classification;
    }
  }

  // Contains match (case-insensitive)
  const lower = app_name.toLowerCase();
  for (const rule of appRules) {
    if (lower.includes(rule.pattern.toLowerCase()) || rule.pattern.toLowerCase().includes(lower)) {
      return rule.classification;
    }
  }

  return null;
}

function matchTitle(
  title: string,
  rules: AppClassification[]
): ClassificationType | null {
  const titleRules = rules.filter((r) => r.pattern_type === 'title');
  const lower = title.toLowerCase();

  for (const rule of titleRules) {
    if (lower.includes(rule.pattern.toLowerCase())) {
      return rule.classification;
    }
  }

  return null;
}

/**
 * Heuristic fallbacks when no explicit rule matches.
 */
function heuristicClassify(
  app_name: string,
  browser_domain: string | null,
  window_title: string | null
): ClassificationType | null {
  const app = app_name.toLowerCase();

  // Common browser names without domain → neutral (domain determines classification)
  const browsers = ['safari', 'chrome', 'firefox', 'arc', 'brave', 'edge', 'opera', 'vivaldi'];
  if (browsers.some((b) => app.includes(b))) {
    // If we have no domain for a browser, mark as neutral
    return browser_domain ? null : 'neutral';
  }

  // Terminal-like apps → productive
  const terminals = ['terminal', 'iterm', 'warp', 'hyper', 'alacritty', 'kitty', 'bash', 'zsh', 'fish'];
  if (terminals.some((t) => app.includes(t))) {
    return 'productive';
  }

  // Code editors → productive
  const editors = ['code', 'vim', 'nvim', 'emacs', 'nano', 'sublime', 'atom', 'pycharm', 'webstorm', 'intellij', 'cursor', 'zed'];
  if (editors.some((e) => app.includes(e))) {
    return 'productive';
  }

  return null;
}

// ─── Session-goal-aware reclassification ─────────────────────────────────────

/**
 * Use the session goal to nudge classification of ambiguous ('neutral', 'unknown') blocks.
 * For example, if goal mentions "research", browser activity is less likely to be distracting.
 * This is a lightweight heuristic — not a full ML model.
 */
export function goalAwareReclassify(
  classification: ClassificationType,
  appName: string | null,
  domain: string | null,
  goal: string
): ClassificationType {
  if (classification !== 'neutral' && classification !== 'unknown') {
    return classification; // Don't touch definitive classifications
  }

  const goalLower = goal.toLowerCase();
  const goalKeywords = {
    research: ['research', 'study', 'learn', 'read', 'investigate'],
    design: ['design', 'figma', 'ui', 'ux', 'mockup', 'wireframe'],
    code: ['code', 'coding', 'develop', 'build', 'implement', 'fix', 'debug', 'feature'],
    write: ['write', 'writing', 'draft', 'document', 'blog', 'article', 'essay'],
    meeting: ['meeting', 'call', 'presentation', 'zoom', 'teams'],
  };

  // Check if goal is research-oriented → browser neutral becomes productive
  const isResearch = goalKeywords.research.some((k) => goalLower.includes(k));
  if (isResearch && domain && classification === 'neutral') {
    return 'productive';
  }

  return classification;
}
