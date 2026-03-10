import type {
  ActivityEvent,
  ActivityBlock,
  ClassificationType,
  SessionReport,
  Session,
  TopApp,
  TopDomain,
} from '../../shared/types';
import { classifyActivity, goalAwareReclassify } from './distractionClassifier';

// Minimum time (seconds) for a block to be considered significant
const MIN_BLOCK_DURATION_S = 5;

// ─── Event → Block conversion ─────────────────────────────────────────────────

/**
 * Convert raw activity events (polling snapshots) into grouped blocks.
 *
 * Events are grouped when consecutive events share the same:
 *   - app_name
 *   - browser_domain (or both null)
 *   - idle state
 *
 * Each block represents a continuous stretch of the same activity.
 */
export function groupEventsIntoBlocks(
  events: ActivityEvent[],
  sessionId: string,
  goal: string
): ActivityBlock[] {
  if (events.length === 0) return [];

  const blocks: ActivityBlock[] = [];
  let blockStart = events[0];
  let blockEnd = events[0];

  for (let i = 1; i < events.length; i++) {
    const current = events[i];
    const prev = events[i - 1];

    // New block if app, domain, idle state, or window title changed
    const sameApp = current.app_name === prev.app_name;
    const sameDomain = current.browser_domain === prev.browser_domain;
    const sameIdle = current.is_idle === prev.is_idle;
    // Split on title change when there's no domain (e.g. editor switching files)
    // Keep same block when domain is present (browser title changes too often)
    const sameTitle =
      !!current.browser_domain || // browser: don't split on title (split on domain instead)
      current.window_title === prev.window_title;

    if (sameApp && sameDomain && sameIdle && sameTitle) {
      blockEnd = current;
    } else {
      // Commit the current block
      const block = makeBlock(blockStart, blockEnd, sessionId, goal);
      if (block.duration_seconds >= MIN_BLOCK_DURATION_S) {
        blocks.push(block);
      }
      blockStart = current;
      blockEnd = current;
    }
  }

  // Commit the last block
  const lastBlock = makeBlock(blockStart, blockEnd, sessionId, goal);
  if (lastBlock.duration_seconds >= MIN_BLOCK_DURATION_S) {
    blocks.push(lastBlock);
  }

  return blocks;
}

function makeBlock(
  startEvent: ActivityEvent,
  endEvent: ActivityEvent,
  sessionId: string,
  goal: string
): ActivityBlock {
  const duration_seconds = Math.max(
    1,
    Math.round((endEvent.timestamp - startEvent.timestamp) / 1000)
  );

  const isIdle = startEvent.is_idle === 1;
  let classification = classifyActivity(
    startEvent.app_name,
    startEvent.browser_domain,
    startEvent.window_title,
    isIdle
  );

  // Apply goal-aware nudge for ambiguous blocks
  classification = goalAwareReclassify(
    classification,
    startEvent.app_name,
    startEvent.browser_domain,
    goal
  );

  return {
    session_id: sessionId,
    started_at: startEvent.timestamp,
    ended_at: endEvent.timestamp,
    app_name: startEvent.app_name,
    window_title: startEvent.window_title,
    browser_domain: startEvent.browser_domain,
    classification,
    duration_seconds,
  };
}

// ─── Report computation ───────────────────────────────────────────────────────

/**
 * Compute a full session report from blocks + session metadata.
 */
export function computeSessionReport(
  session: Session,
  blocks: ActivityBlock[]
): Omit<SessionReport, 'llm_summary' | 'coaching_suggestions'> {
  const now = Date.now();
  const totalMs = (session.ended_at ?? now) - session.started_at;
  const total_duration_seconds = Math.round(totalMs / 1000);

  // Time by classification
  const timeMap: Record<ClassificationType, number> = {
    productive: 0,
    neutral: 0,
    distracting: 0,
    idle: 0,
    unknown: 0,
  };

  for (const block of blocks) {
    timeMap[block.classification] = (timeMap[block.classification] ?? 0) + block.duration_seconds;
  }

  // Context switches: count transitions between non-idle, non-same app blocks
  const contextSwitches = countContextSwitches(blocks);

  // Longest focus streak (consecutive productive blocks)
  const longest_focus_streak_seconds = longestFocusStreak(blocks);

  // Top apps
  const top_apps = computeTopApps(blocks);

  // Top domains
  const top_domains = computeTopDomains(blocks);

  // Diversion moments: distracting blocks > 30s
  const diversion_moments = blocks.filter(
    (b) => b.classification === 'distracting' && b.duration_seconds > 30
  );

  return {
    session,
    total_duration_seconds,
    focused_seconds: timeMap.productive,
    distracted_seconds: timeMap.distracting,
    idle_seconds: timeMap.idle,
    neutral_seconds: timeMap.neutral + timeMap.unknown,
    context_switch_count: contextSwitches,
    longest_focus_streak_seconds,
    top_apps,
    top_domains,
    activity_blocks: blocks,
    diversion_moments,
  };
}

function countContextSwitches(blocks: ActivityBlock[]): number {
  // Count every time app_name changes between non-idle blocks
  const nonIdle = blocks.filter((b) => b.classification !== 'idle');
  let switches = 0;
  for (let i = 1; i < nonIdle.length; i++) {
    if (nonIdle[i].app_name !== nonIdle[i - 1].app_name) {
      switches++;
    }
  }
  return switches;
}

function longestFocusStreak(blocks: ActivityBlock[]): number {
  let longest = 0;
  let current = 0;

  for (const block of blocks) {
    if (block.classification === 'productive') {
      current += block.duration_seconds;
      longest = Math.max(longest, current);
    } else if (block.classification !== 'idle') {
      current = 0;
    }
    // idle doesn't break the streak
  }

  return longest;
}

function computeTopApps(blocks: ActivityBlock[]): TopApp[] {
  const appMap = new Map<string, { seconds: number; classification: ClassificationType }>();

  for (const block of blocks) {
    if (!block.app_name || block.classification === 'idle') continue;
    const existing = appMap.get(block.app_name);
    if (existing) {
      existing.seconds += block.duration_seconds;
      // Upgrade classification priority: distracting > productive > neutral > unknown
      if (classificationPriority(block.classification) > classificationPriority(existing.classification)) {
        existing.classification = block.classification;
      }
    } else {
      appMap.set(block.app_name, {
        seconds: block.duration_seconds,
        classification: block.classification,
      });
    }
  }

  return Array.from(appMap.entries())
    .map(([name, { seconds, classification }]) => ({ name, seconds, classification }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);
}

function computeTopDomains(blocks: ActivityBlock[]): TopDomain[] {
  const domainMap = new Map<string, { seconds: number; classification: ClassificationType }>();

  for (const block of blocks) {
    if (!block.browser_domain || block.classification === 'idle') continue;
    const existing = domainMap.get(block.browser_domain);
    if (existing) {
      existing.seconds += block.duration_seconds;
    } else {
      domainMap.set(block.browser_domain, {
        seconds: block.duration_seconds,
        classification: block.classification,
      });
    }
  }

  return Array.from(domainMap.entries())
    .map(([domain, { seconds, classification }]) => ({ domain, seconds, classification }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);
}

function classificationPriority(c: ClassificationType): number {
  const priorities: Record<ClassificationType, number> = {
    distracting: 4,
    productive: 3,
    neutral: 2,
    unknown: 1,
    idle: 0,
  };
  return priorities[c] ?? 0;
}

// ─── Utility: format seconds to human-readable ────────────────────────────────

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

export function focusScore(report: Omit<SessionReport, 'llm_summary' | 'coaching_suggestions'>): number {
  const { total_duration_seconds, focused_seconds, distracted_seconds, idle_seconds } = report;
  if (total_duration_seconds === 0) return 0;

  const activeSeconds = total_duration_seconds - idle_seconds;
  if (activeSeconds === 0) return 0;

  // Score = (focused - distracted/2) / active * 100, clamped 0–100
  const raw = ((focused_seconds - distracted_seconds * 0.5) / activeSeconds) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}
