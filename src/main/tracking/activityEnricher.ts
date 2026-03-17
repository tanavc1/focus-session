/**
 * Activity Enrichment Engine
 * ──────────────────────────
 * Turns raw OS signals (app name, window title, URL) into the richest possible
 * understanding of what the user is actually doing.
 *
 * Three signal layers:
 *  1. Window-title parsing  — structured context for every major app type
 *  2. URL-path analysis     — e.g. "PR #123 in user/repo" from github.com/…/pull/123
 *  3. Page-metadata fetch   — og:title / og:description fetched from the live URL
 *                             (async, cached 10 min, never blocks the poll loop)
 *
 * All network calls have a hard 3-second timeout and never throw.
 */

import { get as httpsGet } from 'https';
import { get as httpGet }  from 'http';
import type { AppContext, PageMetadata } from '../../shared/types';

// ─── URL Metadata Cache ───────────────────────────────────────────────────────

const CACHE_TTL_MS  = 30 * 60 * 1000; // 30 minutes — metadata is stable
const CACHE_MAX     = 500;

interface CacheEntry { data: PageMetadata; ts: number }
const _urlCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  if (_urlCache.size <= CACHE_MAX) return;
  // Evict the 30 oldest entries
  const sorted = [..._urlCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < 30; i++) _urlCache.delete(sorted[i][0]);
}

function cacheGet(url: string): PageMetadata | null {
  const entry = _urlCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _urlCache.delete(url); return null; }
  return entry.data;
}

function cacheSet(url: string, data: PageMetadata): void {
  pruneCache();
  _urlCache.set(url, { data, ts: Date.now() });
}

// ─── Internal-URL guard ───────────────────────────────────────────────────────

function isPrivateUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === 'file:' || protocol === 'data:' || protocol === 'blob:') return true;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/\.local$/.test(hostname)) return true;
    // RFC-1918 private ranges
    if (/^10\./.test(hostname))                                         return true;
    if (/^192\.168\./.test(hostname))                                   return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname))                   return true;
    return false;
  } catch {
    return true;
  }
}

// ─── HTML meta-tag extractor ─────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function metaContent(html: string, ...attrs: string[]): string | undefined {
  for (const attr of attrs) {
    // Both attribute orders: attr...content  and  content...attr
    const re = [
      new RegExp(`<meta[^>]+${attr}[^>]+content=["']([^"']{1,600})["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']{1,600})["'][^>]+${attr}`, 'i'),
    ];
    for (const r of re) {
      const m = html.match(r);
      if (m?.[1]?.trim()) return decodeEntities(m[1].trim());
    }
  }
  return undefined;
}

function parseHtml(html: string): PageMetadata {
  const head = html.slice(0, 30_000); // first 30 KB is enough for <head>

  const ogTitle  = metaContent(head, 'property=["\']og:title["\']');
  const titleTag = head.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  const title    = ogTitle ?? (titleTag?.[1] ? decodeEntities(titleTag[1].trim()) : undefined);

  const description = metaContent(
    head,
    'property=["\']og:description["\']',
    'name=["\']description["\']',
    'name=["\']twitter:description["\']',
  );

  const site_name = metaContent(head, 'property=["\']og:site_name["\']');

  return { title, description, site_name };
}

// ─── Raw HTML fetch (3 s hard timeout, stops at 70 KB) ────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (v: string | null) => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => { req?.destroy(); resolve(null); }, 3000);

    const getter = url.startsWith('https') ? httpsGet : httpGet;
    let req: ReturnType<typeof httpsGet> | undefined;

    try {
      req = getter(
        url,
        {
          headers: {
            'User-Agent':      'FocusSession/1.0 (desktop activity tracker)',
            Accept:            'text/html',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity', // ask for uncompressed — most servers comply
          },
          timeout: 2500,
        },
        (res) => {
          const ct = res.headers['content-type'] ?? '';
          if (!ct.includes('text/html')) { res.destroy(); return done(null); }
          // Don't follow redirects — just bail; we'll get the URL next poll via cache miss
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            res.destroy(); return done(null);
          }

          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (buf.length > 30_000) { req?.destroy(); done(buf); }
          });
          res.on('end',   () => done(buf || null));
          res.on('error', () => done(null));
        },
      );
      req.on('error',   () => done(null));
      req.on('timeout', () => { req?.destroy(); done(null); });
    } catch {
      done(null);
    }
  });
}

// ─── Public: fetch page metadata (cached, async-safe) ────────────────────────

/**
 * Fetch og:title / description / site_name for a URL.
 * Returns cached result immediately on cache-hit.
 * Returns null for private/internal URLs or on any failure.
 * Never throws.
 */
// Request coalescing: if a fetch for URL X is already in-flight, return the
// same promise rather than spawning a duplicate network request.
const _inFlight = new Map<string, Promise<PageMetadata | null>>();

export async function fetchUrlMetadata(url: string): Promise<PageMetadata | null> {
  if (!url || isPrivateUrl(url)) return null;

  const cached = cacheGet(url);
  if (cached) return cached;

  // Return existing in-flight promise (deduplicates concurrent fetches for same URL).
  if (_inFlight.has(url)) return _inFlight.get(url)!;

  const promise = (async () => {
    try {
      const html = await fetchHtml(url);
      if (!html) return null;
      const meta = parseHtml(html);
      cacheSet(url, meta);
      return meta;
    } catch {
      return null;
    } finally {
      _inFlight.delete(url);
    }
  })();

  _inFlight.set(url, promise);
  return promise;
}

// ─── Window-title parsers ─────────────────────────────────────────────────────

/** Split on common title separators (em-dash, en-dash, pipe, bullet). */
function titleParts(title: string): string[] {
  return title
    .replace(/^[●•]\s*/, '')                  // strip "modified" dot
    .split(/\s*[–—|·•]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseVSCode(title: string): AppContext {
  const parts = titleParts(title).filter(
    (p) => !/^(visual studio code|vs code|vscode|cursor|vscodium|zed)$/i.test(p),
  );
  const [file_name, project_name] = parts;
  return {
    type:         'editor',
    file_name,
    project_name: project_name !== file_name ? project_name : undefined,
    parsed_title: file_name ?? title,
  };
}

function parseJetBrains(title: string): AppContext {
  const IDE_NAMES =
    /intellij idea|pycharm|webstorm|goland|rider|clion|phpstorm|android studio|rubymine|datagrip/i;
  const parts = titleParts(title).filter((p) => !IDE_NAMES.test(p));
  return {
    type:         'editor',
    project_name: parts[0],
    file_name:    parts[1],
    parsed_title: parts[0] ?? title,
  };
}

function parseXcode(title: string): AppContext {
  const parts = titleParts(title).filter((p) => !/^xcode$/i.test(p));
  return {
    type:         'editor',
    project_name: parts.length > 1 ? parts[parts.length - 1] : parts[0],
    file_name:    parts.length > 1 ? parts[0] : undefined,
    parsed_title: parts[0] ?? title,
  };
}

function parseTerminal(title: string): AppContext {
  // Try to extract a path or directory name
  const dirMatch = title.match(/[~\/][\w/.~-]*/);
  const dir      = dirMatch?.[0];
  const parts    = dir?.split('/');
  const leaf     = parts?.[parts.length - 1] || dir || title;
  return {
    type:         'terminal',
    document_name: dir ?? title,
    parsed_title: `Terminal: ${leaf}`,
  };
}

function parseFigma(title: string): AppContext {
  const parts = titleParts(title).filter((p) => !/^figma$/i.test(p));
  return {
    type:         'design',
    file_name:    parts[0],
    project_name: parts[1],
    parsed_title: parts[0] ?? title,
  };
}

function parseSketch(title: string): AppContext {
  const parts = titleParts(title).filter((p) => !/^sketch$/i.test(p));
  return {
    type:         'design',
    file_name:    parts[0],
    parsed_title: parts[0] ?? title,
  };
}

function parseNotion(title: string): AppContext {
  const doc = titleParts(title).find((p) => !/^notion$/i.test(p)) ?? title;
  return { type: 'other', document_name: doc, parsed_title: doc };
}

function parseObsidian(title: string): AppContext {
  // "Note Title - Vault Name - Obsidian"
  const parts = titleParts(title).filter((p) => !/^obsidian$/i.test(p));
  return {
    type:         'editor',
    file_name:    parts[0],
    project_name: parts[1],
    parsed_title: parts[0] ?? title,
  };
}

function parseLinear(title: string): AppContext {
  // "ISS-42 My Issue Title · Linear"
  const issueMatch = title.match(/([A-Z]+-\d+)\s+(.+?)\s*[·•]/);
  if (issueMatch) {
    return { type: 'other', document_name: `${issueMatch[1]}: ${issueMatch[2]}`, parsed_title: issueMatch[2] };
  }
  const doc = titleParts(title).find((p) => !/^linear$/i.test(p)) ?? title;
  return { type: 'other', document_name: doc, parsed_title: doc };
}

function parseSlack(title: string): AppContext {
  // "channel | Workspace | Slack"
  const parts = titleParts(title).filter((p) => !/^slack$/i.test(p));
  return { type: 'communication', document_name: parts[0], parsed_title: parts[0] ?? 'Slack' };
}

function parseZoom(title: string): AppContext {
  // "Zoom Meeting" or "Meeting with John"
  const cleaned = title.replace(/zoom/i, '').trim();
  return { type: 'communication', document_name: cleaned || 'Video call', parsed_title: cleaned || 'Video call' };
}

function parseTeams(title: string): AppContext {
  const parts = titleParts(title).filter((p) => !/^microsoft teams?$/i.test(p));
  return { type: 'communication', document_name: parts[0], parsed_title: parts[0] ?? 'Teams' };
}

function parseMail(title: string): AppContext {
  // "Re: Subject — Inbox" or "Inbox (3)"
  const cleaned = title
    .replace(/\s*[-–—|·•]\s*(inbox|sent|drafts|trash|archive).*$/i, '')
    .replace(/\(\d+\)\s*/g, '')
    .trim();
  return { type: 'communication', document_name: cleaned || 'Email', parsed_title: cleaned || 'Email' };
}

function parseNotes(title: string): AppContext {
  // "Note Title — Notes"
  const doc = titleParts(title).find((p) => !/^notes$/i.test(p)) ?? title;
  return { type: 'other', document_name: doc, parsed_title: doc };
}

function parseOfficeDoc(title: string, appName: string): AppContext {
  // "Document.docx — Word" or "Spreadsheet.xlsx"
  const parts = titleParts(title).filter((p) => !new RegExp(`^(microsoft\\s+)?${escapeRe(appName)}$`, 'i').test(p));
  const doc = parts[0];
  return { type: 'other', document_name: doc, parsed_title: doc ?? title };
}

function parsePreview(title: string): AppContext {
  // "filename.pdf — Preview" or just "filename.pdf"
  const doc = titleParts(title).find((p) => !/^preview$/i.test(p)) ?? title;
  return { type: 'other', document_name: doc, parsed_title: doc };
}

function parseGeneric(title: string, appName: string): AppContext {
  // Strip the app name from the end of the title
  const cleaned = title.replace(new RegExp(`\\s*[-–|]\\s*${escapeRe(appName)}\\s*$`, 'i'), '').trim();
  return { type: 'other', parsed_title: cleaned || title };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Public: parse app context from window title ──────────────────────────────

/**
 * Return structured context for a desktop app's window title.
 * Returns null for browser apps (domain/URL path covers that case).
 */
export function parseAppContext(appName: string | null, windowTitle: string | null): AppContext | null {
  if (!appName || !windowTitle) return null;
  const title = windowTitle.trim();
  if (!title || title === appName) return null;

  const a = appName.toLowerCase();

  if (/code|cursor|vscodium|zed|nova|bbedit/.test(a)) return parseVSCode(title);
  if (/intellij|pycharm|webstorm|goland|rider|clion|phpstorm|android studio|rubymine|datagrip/.test(a)) return parseJetBrains(title);
  if (/xcode/.test(a)) return parseXcode(title);
  if (/terminal|iterm|warp|hyper|alacritty|kitty|ghostty/.test(a)) return parseTerminal(title);
  if (/figma/.test(a)) return parseFigma(title);
  if (/sketch/.test(a)) return parseSketch(title);
  if (/notion/.test(a)) return parseNotion(title);
  if (/obsidian/.test(a)) return parseObsidian(title);
  if (/linear/.test(a)) return parseLinear(title);
  if (/slack/.test(a)) return parseSlack(title);
  if (/zoom/.test(a)) return parseZoom(title);
  if (/microsoft teams?/.test(a)) return parseTeams(title);
  if (/^mail$|spark|mimestream|airmail/.test(a)) return parseMail(title);
  if (/^notes$/.test(a)) return parseNotes(title);
  if (/^preview$/.test(a)) return parsePreview(title);
  if (/word|excel|powerpoint|pages|numbers|keynote/.test(a)) return parseOfficeDoc(title, appName);

  return parseGeneric(title, appName);
}

// ─── URL path analyzer ────────────────────────────────────────────────────────

/**
 * Derive a short descriptive phrase from the URL path for well-known sites.
 * e.g. github.com/user/repo/pull/123 → "PR #123 in user/repo"
 */
export function analyzeUrlPath(domain: string | null, fullUrl: string | null): string | null {
  if (!domain || !fullUrl) return null;

  let parsed: URL;
  try { parsed = new URL(fullUrl); } catch { return null; }

  const segs = parsed.pathname.split('/').filter(Boolean);
  const d    = domain.toLowerCase();

  // ── GitHub ────────────────────────────────────────────────────────────────
  if (d === 'github.com') {
    if (segs.length === 0) return 'GitHub home';
    if (segs.length === 1) return `GitHub: ${segs[0]}`;
    const repo = `${segs[0]}/${segs[1]}`;
    if (segs[2] === 'pull')   return `PR #${segs[3] ?? '?'} in ${repo}`;
    if (segs[2] === 'issues') return segs[3] ? `Issue #${segs[3]} in ${repo}` : `Issues in ${repo}`;
    if (segs[2] === 'blob' || segs[2] === 'tree') return `Code in ${repo}`;
    if (segs[2] === 'actions') return `CI/CD for ${repo}`;
    if (segs[2] === 'commit') return `Commit in ${repo}`;
    return repo;
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (d === 'youtube.com' || d === 'www.youtube.com') {
    if (parsed.pathname.startsWith('/watch')) return 'YouTube video';
    if (parsed.pathname.startsWith('/shorts')) return 'YouTube Shorts';
    if (parsed.pathname === '/' || parsed.pathname === '') return 'YouTube home feed';
    if (parsed.pathname.startsWith('/results')) return 'YouTube search';
    if (segs[0] === 'channel' || segs[0] === 'c' || segs[0] === '@') return `YouTube channel`;
    return 'YouTube';
  }

  // ── Reddit ───────────────────────────────────────────────────────────────
  if (d === 'reddit.com' || d === 'old.reddit.com') {
    if (segs[0] === 'r' && segs[1]) {
      if (segs[2] === 'comments' && segs[3]) return `r/${segs[1]} thread`;
      return `r/${segs[1]}`;
    }
    if (segs[0] === 'u' && segs[1]) return `u/${segs[1]} profile`;
    return 'Reddit home';
  }

  // ── Twitter / X ───────────────────────────────────────────────────────────
  if (d === 'twitter.com' || d === 'x.com') {
    if (segs[0] === 'home') return 'Twitter/X home feed';
    if (segs[0] === 'explore') return 'Twitter/X explore';
    if (segs.length >= 3 && segs[1] === 'status') return `Tweet by @${segs[0]}`;
    if (segs[0]) return `@${segs[0]} on Twitter/X`;
    return 'Twitter/X';
  }

  // ── Linear ────────────────────────────────────────────────────────────────
  if (d === 'linear.app') {
    const issueMatch = parsed.pathname.match(/\/([A-Z]+-\d+)/);
    if (issueMatch) return `Linear: ${issueMatch[1]}`;
    return 'Linear';
  }

  // ── Notion ────────────────────────────────────────────────────────────────
  if (d === 'notion.so' || d === 'www.notion.so') {
    // Notion URLs have a hex suffix; not very readable — rely on window title
    return null;
  }

  // ── Figma ─────────────────────────────────────────────────────────────────
  if (d === 'figma.com' || d === 'www.figma.com') {
    if (segs[0] === 'file') return 'Figma design file';
    if (segs[0] === 'proto') return 'Figma prototype';
    return 'Figma';
  }

  // ── StackOverflow ─────────────────────────────────────────────────────────
  if (d === 'stackoverflow.com') {
    if (segs[0] === 'questions' && segs[1]) return 'Stack Overflow question';
    if (segs[0] === 'search') return 'Stack Overflow search';
    return 'Stack Overflow';
  }

  // ── Docs / documentation sites ────────────────────────────────────────────
  if (d.startsWith('docs.') || d.startsWith('developer.')) {
    return `${d} docs`;
  }

  // ── Vercel / Netlify / deployment ─────────────────────────────────────────
  if (d === 'vercel.com' || d === 'app.vercel.com') {
    if (segs[0] === 'deployments' || segs[1] === 'deployments') return 'Vercel deployments';
    return 'Vercel dashboard';
  }

  // ── Supabase ──────────────────────────────────────────────────────────────
  if (d === 'supabase.com' || d === 'app.supabase.com') {
    const table = parsed.pathname.match(/\/editor\/([^/]+)/);
    if (table) return `Supabase: ${table[1]}`;
    if (segs.includes('auth')) return 'Supabase Auth';
    if (segs.includes('storage')) return 'Supabase Storage';
    return 'Supabase dashboard';
  }

  // ── LeetCode / HackerRank ────────────────────────────────────────────────
  if (d === 'leetcode.com') {
    if (segs[0] === 'problems' && segs[1]) return `LeetCode: ${segs[1].replace(/-/g, ' ')}`;
    return 'LeetCode';
  }

  // ── Medium / Substack / reading ───────────────────────────────────────────
  if (d === 'medium.com' || d === 'www.medium.com') {
    if (segs.length >= 2 && segs[0].startsWith('@')) return `Medium article`;
    return 'Medium';
  }

  return null;
}

// ─── Context summary builder ─────────────────────────────────────────────────

/** Remove trailing "— App Name" / "| Site" / "· Site" suffixes from titles. */
function stripSuffix(title: string): string {
  // Remove last dash/pipe/bullet section if it looks like a site name (< 40 chars)
  const cleaned = title.replace(/\s*[-–—|·•]\s*[^-–—|·•]{2,40}$/, '').trim();
  return cleaned || title;
}

/**
 * Build a precise, human-readable one-liner describing what the user is doing.
 * Combines all enrichment signals in priority order.
 */
export function buildContextSummary(opts: {
  appName:     string | null;
  domain:      string | null;
  windowTitle: string | null;
  fullUrl:     string | null;
  appContext:  AppContext | null;
  metadata:    PageMetadata | null;
}): string {
  const { appName, domain, windowTitle, fullUrl, appContext, metadata } = opts;

  // ── Browser ─────────────────────────────────────────────────────────────────
  if (domain) {
    const urlCtx   = analyzeUrlPath(domain, fullUrl);
    // Use og:title (most precise) → window title (stripped) → URL context → domain
    const pageTitle = metadata?.title
      ?? (windowTitle ? stripSuffix(windowTitle) : null);

    const d = domain.toLowerCase();

    if (d === 'youtube.com' || d === 'www.youtube.com') {
      if (pageTitle && pageTitle !== 'YouTube') return `Watching: "${pageTitle}"`;
      return urlCtx ?? 'YouTube';
    }
    if (d === 'reddit.com' || d === 'old.reddit.com') {
      if (urlCtx) return `Reddit — ${urlCtx}`;
      if (pageTitle) return `Reddit: ${pageTitle}`;
      return 'Browsing Reddit';
    }
    if (d === 'twitter.com' || d === 'x.com') {
      return urlCtx ?? 'Browsing Twitter/X';
    }
    if (d === 'github.com') {
      if (urlCtx && pageTitle) return `GitHub: ${urlCtx}`;
      return urlCtx ?? pageTitle ?? 'GitHub';
    }
    if (pageTitle) return `${pageTitle} — ${domain}`;
    if (urlCtx)    return `${domain}: ${urlCtx}`;
    return `Browsing ${domain}`;
  }

  // ── Desktop app ──────────────────────────────────────────────────────────────
  if (appContext) {
    const { type, file_name, project_name, document_name, parsed_title } = appContext;

    switch (type) {
      case 'editor':
        if (file_name && project_name) return `Editing ${file_name} — ${project_name}`;
        if (file_name)                 return `Editing ${file_name}`;
        if (project_name)              return `Working in ${project_name}`;
        if (parsed_title)              return `Editing: ${parsed_title}`;
        break;
      case 'terminal':
        return parsed_title ?? 'Terminal';
      case 'design':
        if (file_name && project_name) return `${appName ?? 'Design'}: ${file_name} — ${project_name}`;
        if (file_name)                 return `${appName ?? 'Design'}: ${file_name}`;
        return `Working in ${appName ?? 'design tool'}`;
      case 'communication': {
        const label = document_name?.replace(/^(re:|fwd:)\s*/i, '').trim();
        if (label) return `${appName ?? 'Chat'}: ${label}`;
        return appName ?? 'Messaging';
      }
      default:
        if (document_name) return `${appName ?? 'App'}: ${document_name}`;
        if (parsed_title)  return `${appName ?? 'App'}: ${parsed_title}`;
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────────
  if (windowTitle && appName && windowTitle !== appName) {
    return `${appName}: ${stripSuffix(windowTitle)}`;
  }
  // Return just the app name if known — empty string if truly nothing is available
  // (empty string is filtered out by the UI so nothing renders rather than 'Unknown activity')
  return appName ?? '';
}
