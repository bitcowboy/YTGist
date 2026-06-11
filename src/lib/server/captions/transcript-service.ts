// transcript-service.ts — YouTube subtitles via yt-dlp (JSON3)
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { normalizeProxyUrl } from './proxy.js';
import { convertToYouTubeSegments, parseYoutubeJson3, type YouTubeSegment } from './transcript-parser.js';

function ytdlpExecutable(): string {
  return process.env.YTDLP_BIN?.trim() || 'yt-dlp';
}

function pickSubtitleFile(names: string[]): string | null {
  // Any json3 (or .json that isn't .info.json) is fair game — the transcript
  // is handed to an LLM downstream, which handles any language. Sort just to
  // make the choice deterministic when multiple files exist.
  const candidates = names
    .filter((n) => {
      const lower = n.toLowerCase();
      if (lower.endsWith('.part')) return false;
      if (lower.endsWith('.json3')) return true;
      if (lower.endsWith('.json') && !lower.endsWith('.info.json')) return true;
      return false;
    })
    .sort();
  return candidates[0] ?? null;
}

/** After yt-dlp exits, subtitle files may not be visible/readable immediately (Windows FS / slow disks). */
async function readSubtitleWhenReady(
  tempDir: string,
  opts: { maxMs: number; intervalMs: number }
): Promise<string | null> {
  const deadline = Date.now() + opts.maxMs;
  while (Date.now() < deadline) {
    try {
      const names = await readdir(tempDir);
      const picked = pickSubtitleFile(names);
      if (picked) {
        const text = await readFile(join(tempDir, picked), 'utf8');
        if (text.length > 0) return text;
      }
    } catch {
      // still writing or transient
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return null;
}

async function runYtDlpOnce(
  videoId: string,
  opts: { subLangs: string; writeSubs: boolean; waitMs: number }
): Promise<string | null> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ytgist-subs-'));
  try {
    const outPattern = join(tempDir, '%(id)s.%(ext)s');

    const args = [
      '--sub-langs',
      opts.subLangs,
      // Filters tlang-translated auto captions in yt-dlp versions where it
      // still works; broken at least in 2026.03.17 (the tracks pass through),
      // which is why the attempt cascade below avoids them by construction.
      '--extractor-args',
      'youtube:skip=translated_subs',
      // Stop at the first 429 instead of retrying the rate limiter into a
      // multi-minute hang — by that point we already have a couple of files.
      '--abort-on-error',
      '--retries',
      '1',
      '--skip-download',
      '--no-playlist',
      '--no-warnings',
      ...(opts.writeSubs ? ['--write-subs'] : []),
      '--write-auto-subs',
      '--sub-format',
      'json3',
      '--sleep-subtitles',
      '1',
      '--sleep-requests',
      '0.75',
      '-o',
      outPattern,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    if (env.PROXY_URI?.trim()) {
      args.unshift('--proxy', normalizeProxyUrl(env.PROXY_URI.trim()));
    }

    const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      const proc = spawn(ytdlpExecutable(), args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let errBuf = '';
      proc.stderr?.on('data', (d: Buffer) => {
        errBuf += d.toString();
      });
      proc.on('error', reject);
      proc.on('close', (c) => resolve({ code: c ?? 1, stderr: errBuf }));
    });

    if (code !== 0 && stderr.trim()) {
      console.warn('[yt-dlp]', stderr.trim());
    }

    return await readSubtitleWhenReady(tempDir, { maxMs: opts.waitMs, intervalMs: 100 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runYtDlpJson3(videoId: string): Promise<string> {
  // Attempt 1: the `-orig` track only — the original-language ASR, whatever
  // the language. Auto-translated tracks (en, zh-Hans, … on a Cantonese
  // video) are generated per request and 429 readily, so never ask for them:
  // any whitelist pattern would match them too because they reuse plain
  // language codes. One track, one download, covers every video that has
  // auto captions.
  const asrText = await runYtDlpOnce(videoId, {
    subLangs: '.*-orig',
    writeSubs: false,
    // Failure mode is "no file was ever written", so don't sit out the full
    // filesystem-visibility grace period before falling back.
    waitMs: 4_000,
  });
  if (asrText) return asrText;

  // Attempt 2: no ASR (music videos, captions-only uploads) — fetch manual
  // subs from a bounded whitelist of common languages. `all` would trip the
  // rate limiter on channels that upload per-language tracks (e.g. Hikakin
  // TV's 130+). The `.*` suffix lets each entry also match locale-suffixed
  // variants (en-US, zh-HK, pt-BR, …); yt-dlp anchors with `$` so a bare `en`
  // would miss them. --write-auto-subs stays on as a safety net for plain-code
  // ASR tracks (no `-orig` twin); the picker grabs whichever file lands —
  // the downstream LLM handles any language.
  const text = await runYtDlpOnce(videoId, {
    subLangs: '.*-orig,en.*,zh.*,yue.*,ja.*,ko.*,de.*,fr.*,es.*,ru.*,pt.*,ar.*,hi.*,it.*',
    writeSubs: true,
    waitMs: 15_000,
  });
  if (!text) {
    throw new Error('NO_SUBTITLES_AVAILABLE');
  }
  return text;
}

type TranscriptResult = { error: string } | { segments: YouTubeSegment[] };

// Coalesce concurrent calls for the same videoId so EventSource reconnects and
// duplicate /api/get-summary requests don't spawn parallel yt-dlp processes —
// the fan-out makes YouTube's bot detector much more eager to return
// "Sign in to confirm you're not a bot" on the prod IP.
const inflight = new Map<string, Promise<TranscriptResult>>();

async function doFetchTranscript(videoId: string): Promise<TranscriptResult> {
  let jsonText: string;
  try {
    jsonText = await runYtDlpJson3(videoId);
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_SUBTITLES_AVAILABLE') {
      return { error: 'No transcript available' };
    }
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      console.error('[yt-dlp] executable not found. Install yt-dlp or set YTDLP_BIN.');
    } else {
      console.error('[yt-dlp] transcript fetch failed:', e);
    }
    return { error: 'No transcript available' };
  }

  const segments = parseYoutubeJson3(jsonText);
  if (segments.length === 0) {
    return { error: 'No transcript available' };
  }

  return { segments: convertToYouTubeSegments(segments) };
}

export async function fetchTranscriptForVideo(videoId: string): Promise<TranscriptResult> {
  const existing = inflight.get(videoId);
  if (existing) {
    console.log(`[methodThree] dedup: reusing in-flight yt-dlp for ${videoId}`);
    return existing;
  }
  const pending = doFetchTranscript(videoId).finally(() => {
    inflight.delete(videoId);
  });
  inflight.set(videoId, pending);
  return pending;
}
