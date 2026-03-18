/**
 * Multi-provider AI client for Focus Session.
 * Supports: Ollama (local, default), Anthropic Claude, OpenAI.
 * Handles both text (language) models and vision models.
 *
 * Vision works out-of-the-box via Ollama (minicpm-v:2.6 recommended — best screen/text reading).
 * Claude/OpenAI vision are optional overrides when API keys are configured.
 */

import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { SessionReport, Settings, AiProvider } from '../../shared/types';
import { formatDuration, focusScore } from '../analytics/sessionAnalyzer';

// ─── Vision prompt ────────────────────────────────────────────────────────────

const VISION_PROMPT =
  'Analyze this screenshot of a computer screen. Respond in 2-3 sentences that describe:\n' +
  '1. The exact application open and what the user is actively doing (be precise — e.g. "writing a React component in VS Code", not just "coding").\n' +
  '2. The specific content visible: file name, document title, article headline, video title, website name, or any readable text that identifies what they are working on.\n' +
  '3. Whether this looks productive, neutral, or distracting, and why.\n' +
  'Read visible text literally — titles, filenames, headlines, code identifiers — and include them in your answer. Be factual and concise.';

// ─── System prompt (language model) ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert productivity coach and behavioral analyst. You have deep expertise in:
- Focus and deep work methodologies (Cal Newport, Pomodoro, time-blocking)
- Cognitive science of attention, task-switching, and flow states
- Habit formation and behavior change
- Work pattern analysis and optimization

Your role is to analyze a user's work session data and provide:
1. An honest, insightful summary of the session (what went well, what didn't)
2. Specific, actionable coaching suggestions based on the actual data

Guidelines:
- Start your summary with 1-2 sentences describing specifically what the user worked on and accomplished, based on the available data.
- Be direct and data-driven. Reference specific numbers from the session.
- Don't be generic. Tailor advice to the specific patterns you see.
- If the session was good, say so clearly and explain why.
- If there were issues, name them specifically without being harsh.
- Coaching suggestions should be concrete and immediately actionable.
- Keep the summary to 3-4 sentences. Keep each suggestion to 1-2 sentences.`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildDetailedPrompt(
  report: Omit<SessionReport, 'llm_summary' | 'coaching_suggestions' | 'ai_provider_used'>,
  visionSnapshots?: string[]
): string {
  const score = focusScore(report);
  const isQuickSession = report.session.goal === 'Open session — capturing all activity';

  const topApps = report.top_apps
    .slice(0, 8)
    .map((a) => `  - ${a.name}: ${formatDuration(a.seconds)} (${a.classification})`)
    .join('\n');

  const topDomains = report.top_domains
    .slice(0, 6)
    .map((d) => `  - ${d.domain}: ${formatDuration(d.seconds)} (${d.classification})`)
    .join('\n');

  const diversions = report.diversion_moments
    .slice(0, 5)
    .map((d) => `  - ${d.browser_domain ?? d.app_name ?? 'Unknown'} at ${new Date(d.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}, duration: ${formatDuration(d.duration_seconds)}`)
    .join('\n');

  const activeSeconds = report.total_duration_seconds - report.idle_seconds;
  const focusPct = activeSeconds > 0 ? Math.round((report.focused_seconds / activeSeconds) * 100) : 0;
  const distractPct = activeSeconds > 0 ? Math.round((report.distracted_seconds / activeSeconds) * 100) : 0;

  let prompt = `Analyze this work session and provide coaching:

SESSION OVERVIEW:
- Title: ${report.session.title}
- Goal: ${isQuickSession ? 'Open tracking session (no specific goal)' : report.session.goal}
- Date: ${new Date(report.session.started_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
- Time: ${new Date(report.session.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} → ${report.session.ended_at ? new Date(report.session.ended_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'ongoing'}

PERFORMANCE METRICS:
- Focus Score: ${score}/100
- Total Duration: ${formatDuration(report.total_duration_seconds)}
- Focused Time: ${formatDuration(report.focused_seconds)} (${focusPct}% of active time)
- Distracted Time: ${formatDuration(report.distracted_seconds)} (${distractPct}% of active time)
- Idle/Break Time: ${formatDuration(report.idle_seconds)}
- Neutral Time: ${formatDuration(report.neutral_seconds)}
- Context Switches: ${report.context_switch_count} (app changes)
- Longest Focus Streak: ${formatDuration(report.longest_focus_streak_seconds)}
- Notable Distractions: ${report.diversion_moments.length}

TOP APPLICATIONS USED:
${topApps || '  (none recorded)'}

${topDomains ? `TOP WEBSITES VISITED:\n${topDomains}\n` : ''}
${diversions ? `DISTRACTION EVENTS (>30s each):\n${diversions}\n` : ''}`;

  if (visionSnapshots && visionSnapshots.length > 0) {
    prompt += `\nVISUAL CONTEXT (periodic screen snapshots — use these to identify WHAT SPECIFICALLY was being worked on: file names, document titles, features, code identifiers, etc.):
${visionSnapshots.map((s, i) => `  [${i + 1}] ${s}`).join('\n')}
`;
  }

  prompt += `
TASK:
Write a 3-4 sentence session summary that references specific data points. Then provide exactly 3 coaching suggestions as bullet points starting with "•". Each suggestion must be specific to this session's data, not generic advice.

Format your response as:
[Summary paragraph here]

• [Specific coaching suggestion 1]
• [Specific coaching suggestion 2]
• [Specific coaching suggestion 3]`;

  return prompt;
}

// ─── Response parser ──────────────────────────────────────────────────────────

export function parseLlmResponse(response: string): {
  summary: string;
  suggestions: string[];
} {
  // Strip any <think>...</think> blocks some models include
  const cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  const summaryLines: string[] = [];
  const suggestions: string[] = [];

  for (const line of lines) {
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line)) {
      const text = line.replace(/^[•\-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (text) suggestions.push(text);
    } else {
      summaryLines.push(line);
    }
  }

  // Fallback: if no summary found (model only returned bullets), use full cleaned text
  const summary = summaryLines.join(' ').trim() || cleaned;

  return {
    summary,
    suggestions: suggestions.slice(0, 5),
  };
}

// ─── Ollama helpers ───────────────────────────────────────────────────────────

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
 * Analyze a screenshot using an Ollama vision model (chat API with images array).
 * Works with minicpm-v, llava, llava-phi3, etc.
 */
async function analyzeScreenshotOllama(
  endpoint: string,
  model: string,
  screenshotBase64: string
): Promise<string | null> {
  try {
    const payload = {
      model,
      stream: false,
      messages: [
        {
          role: 'user',
          content: VISION_PROMPT,
          images: [screenshotBase64],
        },
      ],
      options: { temperature: 0.1, num_predict: 200 },
    };

    const response = await axios.post<{
      message: { content: string; thinking?: string };
    }>(
      `${endpoint}/api/chat`,
      payload,
      { timeout: 30_000 }
    );

    const content = response.data?.message?.content?.trim();
    return content ?? null;
  } catch (err) {
    console.error('[Ollama Vision] Screenshot analysis failed:', err);
    return null;
  }
}

async function generateOllama(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 900
): Promise<string | null> {
  try {
    const payload = {
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: { temperature: 0.4, num_predict: maxTokens },
    };
    // Use chat API for proper system message support
    const response = await axios.post<{ message: { content: string } }>(
      `${endpoint}/api/chat`,
      payload,
      { timeout: 60_000 }
    );
    return response.data?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('[Ollama] Generate failed:', err);
    return null;
  }
}

// ─── Claude helpers ───────────────────────────────────────────────────────────

async function generateClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey, timeout: 60_000 });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = message.content[0];
    return block.type === 'text' ? block.text.trim() : null;
  } catch (err) {
    console.error('[Claude] Generate failed:', err);
    return null;
  }
}

async function analyzeScreenshotClaude(
  apiKey: string,
  model: string,
  screenshotBase64: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey, timeout: 30_000 });
    const message = await client.messages.create({
      model,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: screenshotBase64 },
            },
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
    });
    const block = message.content[0];
    return block.type === 'text' ? block.text.trim() : null;
  } catch (err) {
    console.error('[Claude Vision] Screenshot analysis failed:', err);
    return null;
  }
}

// ─── OpenAI helpers ───────────────────────────────────────────────────────────

async function generateOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey, timeout: 60_000 });
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('[OpenAI] Generate failed:', err);
    return null;
  }
}

async function analyzeScreenshotOpenAI(
  apiKey: string,
  model: string,
  screenshotBase64: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey, timeout: 30_000 });
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${screenshotBase64}`, detail: 'low' },
            },
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('[OpenAI Vision] Screenshot analysis failed:', err);
    return null;
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * Analyze a screenshot and return a text description of what the user is doing.
 * Routes to Ollama (default, free, local) or Claude/OpenAI if configured.
 */
export async function analyzeScreenshot(
  settings: Settings,
  screenshotBase64: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string | null> {
  const provider: AiProvider = settings.ai_provider ?? 'ollama';
  const visionModel = settings.vision_model;

  if (!visionModel) return null;

  if (provider === 'ollama') {
    return analyzeScreenshotOllama(settings.ollama_endpoint, visionModel, screenshotBase64);
  } else if (provider === 'claude' && settings.claude_api_key) {
    return analyzeScreenshotClaude(settings.claude_api_key, visionModel, screenshotBase64, mimeType);
  } else if (provider === 'openai' && settings.openai_api_key) {
    return analyzeScreenshotOpenAI(settings.openai_api_key, visionModel, screenshotBase64, mimeType);
  }

  return null;
}

/**
 * Generate an LLM session summary using the configured AI provider.
 */
export async function generateSessionSummary(
  settings: Settings,
  report: Omit<SessionReport, 'llm_summary' | 'coaching_suggestions' | 'ai_provider_used'>,
  visionSnapshots?: string[]
): Promise<{ summary: string; suggestions: string[]; provider: string } | null> {
  const userPrompt = buildDetailedPrompt(report, visionSnapshots);
  const provider: AiProvider = settings.ai_provider ?? 'ollama';

  let rawResponse: string | null = null;

  if (provider === 'claude') {
    if (!settings.claude_api_key) {
      console.warn('[AI] Claude selected but no API key configured');
      return null;
    }
    const model = settings.language_model || 'claude-sonnet-4-6';
    rawResponse = await generateClaude(settings.claude_api_key, model, SYSTEM_PROMPT, userPrompt);
  } else if (provider === 'openai') {
    if (!settings.openai_api_key) {
      console.warn('[AI] OpenAI selected but no API key configured');
      return null;
    }
    const model = settings.language_model || 'gpt-5.4-mini';
    rawResponse = await generateOpenAI(settings.openai_api_key, model, SYSTEM_PROMPT, userPrompt);
  } else {
    // Ollama (default)
    const isUp = await checkOllamaStatus(settings.ollama_endpoint);
    if (!isUp) {
      console.warn('[AI] Ollama is not running');
      return null;
    }
    rawResponse = await generateOllama(
      settings.ollama_endpoint,
      settings.ollama_model,
      SYSTEM_PROMPT,
      userPrompt,
      900
    );
  }

  if (!rawResponse) return null;

  const parsed = parseLlmResponse(rawResponse);
  const providerLabel =
    provider === 'ollama' ? `Ollama (${settings.ollama_model})` :
    provider === 'claude' ? `Claude (${settings.language_model || 'claude-sonnet-4-6'})` :
    `OpenAI (${settings.language_model || 'gpt-5.4-mini'})`;

  return { summary: parsed.summary, suggestions: parsed.suggestions, provider: providerLabel };
}

/**
 * Check the status/reachability of the current AI provider.
 */
export async function checkAiStatus(settings: Settings): Promise<{
  provider: AiProvider;
  is_configured: boolean;
  is_running: boolean;
  models: string[];
  message: string;
}> {
  const provider: AiProvider = settings.ai_provider ?? 'ollama';

  if (provider === 'ollama') {
    const isUp = await checkOllamaStatus(settings.ollama_endpoint);
    const models = isUp ? await listOllamaModels(settings.ollama_endpoint) : [];
    return {
      provider,
      is_configured: true,
      is_running: isUp,
      models,
      message: isUp ? 'Ollama is running' : 'Ollama not running. Run: ollama serve',
    };
  } else if (provider === 'claude') {
    const hasKey = !!settings.claude_api_key;
    if (!hasKey) return { provider, is_configured: false, is_running: false, models: [], message: 'No Claude API key configured' };
    try {
      const client = new Anthropic({ apiKey: settings.claude_api_key });
      await client.models.list();
      return { provider, is_configured: true, is_running: true, models: [], message: 'Claude API key is valid' };
    } catch {
      return { provider, is_configured: true, is_running: false, models: [], message: 'Claude API key is invalid or unreachable' };
    }
  } else {
    const hasKey = !!settings.openai_api_key;
    if (!hasKey) return { provider, is_configured: false, is_running: false, models: [], message: 'No OpenAI API key configured' };
    try {
      const client = new OpenAI({ apiKey: settings.openai_api_key });
      await client.models.list();
      return { provider, is_configured: true, is_running: true, models: [], message: 'OpenAI API key is valid' };
    } catch {
      return { provider, is_configured: true, is_running: false, models: [], message: 'OpenAI API key is invalid or unreachable' };
    }
  }
}
