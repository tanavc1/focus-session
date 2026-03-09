import axios from 'axios';
import type { SessionReport } from '../../shared/types';
import { formatDuration, focusScore } from '../analytics/sessionAnalyzer';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

// ─── Ollama client ────────────────────────────────────────────────────────────

export async function checkOllamaStatus(endpoint: string): Promise<boolean> {
  try {
    const response = await axios.get(`${endpoint}/api/tags`, { timeout: 3000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function listOllamaModels(endpoint: string): Promise<string[]> {
  try {
    const response = await axios.get(`${endpoint}/api/tags`, { timeout: 3000 });
    return (response.data?.models ?? []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/**
 * Call Ollama generate endpoint with a prompt.
 * Returns the generated text or null on failure.
 */
export async function generate(
  endpoint: string,
  model: string,
  prompt: string,
  maxTokens = 400
): Promise<string | null> {
  try {
    const payload: OllamaGenerateRequest = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: maxTokens,
      },
    };

    const response = await axios.post<OllamaGenerateResponse>(
      `${endpoint}/api/generate`,
      payload,
      { timeout: 60_000 }
    );

    return response.data?.response?.trim() ?? null;
  } catch (err) {
    console.error('[Ollama] Generate failed:', err);
    return null;
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

/**
 * Build a concise session summary prompt.
 * Kept short to work well with smaller 7-8B models.
 */
export function buildSummaryPrompt(
  report: Omit<SessionReport, 'llm_summary' | 'coaching_suggestions'>
): string {
  const score = focusScore(report);
  const topApps = report.top_apps
    .slice(0, 5)
    .map((a) => `${a.name} (${formatDuration(a.seconds)}, ${a.classification})`)
    .join(', ');

  const topDistractors = report.diversion_moments
    .slice(0, 3)
    .map((d) => `${d.app_name ?? d.browser_domain ?? 'Unknown'} for ${formatDuration(d.duration_seconds)}`)
    .join(', ');

  return `You are a productivity coach. A user just finished a work session. Summarize it briefly and provide 2-3 actionable coaching tips.

SESSION DATA:
- Title: ${report.session.title}
- Goal: ${report.session.goal}
- Duration: ${formatDuration(report.total_duration_seconds)}
- Focus score: ${score}/100
- Focused time: ${formatDuration(report.focused_seconds)}
- Distracted time: ${formatDuration(report.distracted_seconds)}
- Idle time: ${formatDuration(report.idle_seconds)}
- Context switches: ${report.context_switch_count}
- Longest focus streak: ${formatDuration(report.longest_focus_streak_seconds)}
- Top apps: ${topApps || 'None'}
- Main distractions: ${topDistractors || 'None'}

Write a 2-3 sentence summary of the session, then list 2-3 specific coaching suggestions as bullet points. Be concise and direct. Do not use markdown headers.`;
}

/**
 * Parse the LLM response into a summary + suggestions array.
 */
export function parseLlmResponse(response: string): {
  summary: string;
  suggestions: string[];
} {
  const lines = response.split('\n').map((l) => l.trim()).filter(Boolean);

  const summaryLines: string[] = [];
  const suggestions: string[] = [];

  for (const line of lines) {
    // Detect bullet points
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line)) {
      const cleaned = line.replace(/^[•\-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (cleaned) suggestions.push(cleaned);
    } else {
      summaryLines.push(line);
    }
  }

  return {
    summary: summaryLines.join(' ').trim(),
    suggestions,
  };
}
